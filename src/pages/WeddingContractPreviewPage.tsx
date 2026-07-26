import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import {
  extractDocxParagraphs,
  GeneratedWeddingContractService,
  saveGeneratedContract,
} from '@/features/documents/template'
import { PDF_EXPORT_UNAVAILABLE_MESSAGE } from '@/features/documents/template/ContractExportService'
import {
  WeddingContractGenerationService,
  type ConfiguredContractCompletenessReport,
} from '@/features/documents/template/WeddingContractGenerationService'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import styles from './WeddingContractPreviewPage.module.css'

function manualOverridesFromSnapshot(snapshot: Record<string, unknown>): Record<string, string> {
  const source = snapshot.sourceDataSnapshot
  if (!source || typeof source !== 'object') return {}
  const overrides = (source as { manualOverrides?: unknown }).manualOverrides
  if (!overrides || typeof overrides !== 'object') return {}
  return Object.fromEntries(
    Object.entries(overrides).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

export function WeddingContractPreviewPage() {
  const { weddingId = '', contractId = '' } = useParams<{
    weddingId: string
    contractId: string
  }>()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { data: wedding } = useWedding(weddingId)
  const { data: templates = [] } = useDocumentTemplates()
  const { data: contract, isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contract', weddingId, contractId],
    queryFn: () => GeneratedWeddingContractService.getForWedding(weddingId, contractId),
    enabled: Boolean(weddingId && contractId),
  })
  const [editing, setEditing] = useState(false)
  const [report, setReport] =
    useState<ConfiguredContractCompletenessReport | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const latestDocx = useMemo(
    () =>
      contract?.artifacts
        .filter((item) => item.format === 'docx')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0],
    [contract],
  )
  const latestPdf = useMemo(
    () =>
      contract?.artifacts
        .filter((item) => item.format === 'pdf')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0],
    [contract],
  )
  const template = templates.find((item) => item.id === contract?.templateId)
  const {
    data: paragraphs = [],
    isLoading: previewLoading,
    isError: previewFailed,
  } = useQuery({
    queryKey: [
      'generated-wedding-contract-preview',
      weddingId,
      contractId,
      latestDocx?.id,
    ],
    queryFn: async () => {
      const bytes = await GeneratedWeddingContractService.downloadArtifact(
        weddingId,
        contractId,
        'docx',
      )
      if (!bytes) return []
      return (await extractDocxParagraphs(bytes)).map((item) => item.text)
    },
    enabled: Boolean(latestDocx),
  })

  async function download(format: 'docx' | 'pdf') {
    const url = await GeneratedWeddingContractService.getArtifactDownloadUrl(
      weddingId,
      contractId,
      format,
    )
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function startEditing() {
    if (!contract || !wedding) return
    setBusy(true)
    setActionError(null)
    try {
      const savedOverrides = latestDocx
        ? manualOverridesFromSnapshot(latestDocx.snapshotJson)
        : {}
      const next = await WeddingContractGenerationService.prepareVerification({
        wedding,
        templateId: contract.templateId,
        overrides: savedOverrides,
      })
      setOverrides(savedOverrides)
      setReport(next)
      setEditing(true)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Nie udało się wczytać pól umowy.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function regenerate() {
    if (!contract || !wedding || !report) return
    setBusy(true)
    setActionError(null)
    try {
      const attempt = await WeddingContractGenerationService.generate({
        wedding,
        report,
        overrides,
        scope: 'local_only',
        templateVersionId: contract.templateVersionId,
      })
      if (attempt.status === 'needs_review') {
        setActionError(
          attempt.reviewStatePatch.contextualMessages.join('\n') ||
            'Uzupełnij wymagane dane przed ponownym generowaniem.',
        )
        return
      }
      const generated = attempt.artifact
      const saved = await saveGeneratedContract({
        wedding,
        draftId: contract.draft.id,
        templateId: contract.templateId,
        templateVersionId: contract.templateVersionId,
        title: contract.draft.title,
        docxBytes: generated.docxBytes,
        packageSnapshot: report.packageSnapshot,
        manualOverrides: overrides,
        resolvedValues: generated.resolved,
        omittedKeys: generated.omittedKeys,
        templateMeta: template?.meta,
        executionSnapshot: generated.executionSnapshot,
        auditSummary: {
          regeneratedFromContractId: contract.draft.id,
          variableOnlyEditor: true,
        },
      })
      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      await queryClient.invalidateQueries({
        queryKey: ['generated-wedding-contracts'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['generated-wedding-contract', weddingId, contractId],
      })
      setEditing(false)
      showToast(`Zapisano wersję v${saved.generationVersion}.`, 'success')
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Nie udało się zapisać nowej wersji.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <AppLayout title="Umowa">
        <PageContainer><p>Ładowanie umowy…</p></PageContainer>
      </AppLayout>
    )
  }

  if (isError || !contract || !wedding) {
    return (
      <AppLayout title="Umowa">
        <PageContainer>
          <p role="alert">Nie znaleziono zapisanego artefaktu umowy.</p>
          <Link to={`/sluby/${weddingId}`}>Wróć do ślubu</Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide" className={styles.page}>
        <header className={styles.header}>
          <div>
            <Link to={`/sluby/${wedding.id}`}>← Wróć do ślubu</Link>
            <p className={styles.eyebrow}>Umowa · Gotowa</p>
            <h1>{contract.draft.title}</h1>
            <p>
              {wedding.couple.partner1} i {wedding.couple.partner2} ·{' '}
              {template?.name ?? 'Szablon archiwalny'} · wersja{' '}
              {contract.generationVersion ?? 1}
            </p>
            <p>
              Zaktualizowano{' '}
              {new Intl.DateTimeFormat('pl-PL', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(contract.updatedAt))}
            </p>
          </div>
          <span className={styles.status}>Gotowa do pobrania</span>
        </header>

        {editing && report ? (
          <section className={styles.editor} aria-labelledby="edit-contract-data">
            <div>
              <h2 id="edit-contract-data">Edytuj dane umowy</h2>
              <p>
                Możesz zmienić tylko skonfigurowane pola zmienne. Treść prawna nie
                jest edytowalna na tej stronie.
              </p>
            </div>
            {report.groups.map((group) => (
              <fieldset key={group.id}>
                <legend>{group.label}</legend>
                {group.fields.map((field) => (
                  <label key={field.slotId}>
                    <span>{field.label}</span>
                    <input
                      value={overrides[field.registryKey] ?? field.value}
                      onChange={(event) =>
                        setOverrides((current) => ({
                          ...current,
                          [field.registryKey]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <div className={styles.editorActions}>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Anuluj
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void regenerate()}
              >
                {busy ? 'Zapisywanie…' : 'Regeneruj i zapisz nową wersję'}
              </Button>
            </div>
          </section>
        ) : (
          <section className={styles.preview} aria-labelledby="simplified-preview">
            <div className={styles.previewTitle}>
              <h2 id="simplified-preview">Uproszczony podgląd DOCX</h2>
              <p>
                Tekst został odczytany z zapisanego pliku. Układ, grafiki i
                formatowanie sprawdź w pobranym DOCX.
              </p>
            </div>
            {previewFailed ? (
              <p role="alert">Nie udało się odczytać uproszczonego podglądu.</p>
            ) : null}
            {previewLoading ? <p>Odczytywanie treści…</p> : null}
            <article className={styles.paper}>
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>
              ))}
            </article>
          </section>
        )}

        {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

        <div className={styles.stickyActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || editing}
            onClick={() => void startEditing()}
          >
            Edytuj dane umowy
          </Button>
          <Button type="button" variant="primary" onClick={() => void download('docx')}>
            Pobierz DOCX
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!latestPdf}
            title={latestPdf ? undefined : PDF_EXPORT_UNAVAILABLE_MESSAGE}
            onClick={() => latestPdf && void download('pdf')}
          >
            {latestPdf ? 'Pobierz PDF' : 'PDF niedostępny'}
          </Button>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
