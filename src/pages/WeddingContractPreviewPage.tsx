import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import {
  GeneratedWeddingContractService,
  saveGeneratedContract,
} from '@/features/documents/template'
import {
  WeddingContractGenerationService,
  type ConfiguredContractCompletenessReport,
} from '@/features/documents/template/WeddingContractGenerationService'
import { ContractReadyPreview } from '@/features/documents/contract-experience'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import styles from './WeddingContractPreviewPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

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
  const navigate = useNavigate()
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
  const template = templates.find((item) => item.id === contract?.templateId)

  const {
    data: docxBytes = null,
    isLoading: docxLoading,
    isError: docxFailed,
    refetch: refetchDocx,
  } = useQuery({
    queryKey: [
      'generated-wedding-contract-docx-bytes',
      weddingId,
      contractId,
      latestDocx?.id,
    ],
    queryFn: () =>
      GeneratedWeddingContractService.downloadArtifact(
        weddingId,
        contractId,
        'docx',
      ),
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
        getUserFacingErrorMessage(error, 'Nie udało się wczytać pól umowy.'),
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
      if (attempt.status === 'manual_input_required') {
        navigate(`/sluby/${wedding.id}/umowa/generuj`)
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
        getUserFacingErrorMessage(error, 'Nie udało się zapisać nowej wersji.'),
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
              {getWeddingDisplayName(wedding)} ·{' '}
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
          <>
            {docxLoading ? <p>Ładowanie dokumentu…</p> : null}
            {docxFailed ? (
              <p role="alert">
                Nie udało się pobrać pliku DOCX.{' '}
                <button type="button" onClick={() => void refetchDocx()}>
                  Spróbuj ponownie
                </button>
              </p>
            ) : null}
            <ContractReadyPreview
              fileName={`${contract.draft.title || 'umowa'}.docx`}
              docxBytes={docxBytes}
              onDownloadDocx={() => void download('docx')}
              onRegenerate={() =>
                navigate(`/sluby/${wedding.id}/umowa/generuj`)
              }
              weddingId={wedding.id}
              documentId={contract.draft.id}
            />
          </>
        )}

        {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

        {editing ? null : (
          <div className={styles.stickyActions}>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void startEditing()}
            >
              Edytuj dane umowy
            </Button>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  )
}
