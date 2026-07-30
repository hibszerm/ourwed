import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import {
  GeneratedWeddingContractService,
  type GeneratedWeddingContract,
} from '@/features/documents/template'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingContractsModule.module.css'

interface Props {
  wedding: Wedding
  onGenerate: () => void
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function sortContractsNewestFirst(
  contracts: GeneratedWeddingContract[],
): GeneratedWeddingContract[] {
  return [...contracts].sort((a, b) => {
    const versionDiff =
      (b.generationVersion ?? 0) - (a.generationVersion ?? 0)
    if (versionDiff !== 0) return versionDiff
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function contractLifecycleLabel(wedding: Wedding): string {
  switch (wedding.contract?.status) {
    case 'signed':
      return 'Podpisana'
    case 'sent':
      return 'Wysłana'
    case 'generated':
      return 'Wygenerowana'
    default:
      return 'Gotowa'
  }
}

type CardState =
  | 'no_template'
  | 'template_available'
  | 'generated'
  | 'archived'

export function WeddingContractsModule({ wedding, onGenerate }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const { data: templates = [] } = useDocumentTemplates()
  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contracts', wedding.id],
    queryFn: () => GeneratedWeddingContractService.listForWedding(wedding.id),
  })
  const packageQuery = useQuery({
    queryKey: [
      'package-contract-for-wedding',
      wedding.id,
      wedding.packageId ?? null,
    ],
    queryFn: () =>
      resolvePackageContractForWedding({
        packageId: wedding.packageId,
        packageName: wedding.packageName,
      }),
    staleTime: 30_000,
  })
  const templateNames = new Map(templates.map((item) => [item.id, item.name]))

  const sorted = useMemo(
    () => sortContractsNewestFirst(contracts),
    [contracts],
  )
  const latest = sorted[0] ?? null
  const older = sorted.slice(1)

  const packageStatus = packageQuery.data?.status
  const hasTemplate = packageStatus === 'ok'
  const hasGenerated = contracts.length > 0
  const cardState: CardState =
    wedding.status === 'archived'
      ? 'archived'
      : !hasTemplate
        ? 'no_template'
        : hasGenerated
          ? 'generated'
          : 'template_available'

  const stateCopy: Record<CardState, { title: string; body: string }> = {
    no_template: {
      title: 'Brak szablonu w pakiecie',
      body: 'Dodaj szablon umowy w pakiecie, aby móc wygenerować dokument dla tego ślubu.',
    },
    template_available: {
      title: 'Szablon gotowy',
      body: 'Wygeneruj umowę na podstawie szablonu pakietu i danych tego ślubu.',
    },
    generated: {
      title: 'Aktualna umowa',
      body: 'Najnowsza wygenerowana wersja. Starsze wersje są w historii.',
    },
    archived: {
      title: 'Umowa zarchiwizowana',
      body: 'Ten ślub ma zarchiwizowany status umowy.',
    },
  }

  return (
    <section
      className={styles.section}
      aria-labelledby="wedding-contracts-title"
      data-testid="wedding-contracts-module"
    >
      <div className={styles.header}>
        <div>
          <h2 id="wedding-contracts-title">
            {hasGenerated ? 'Aktualna umowa' : 'Umowa'}
          </h2>
          <p>{stateCopy[cardState].body}</p>
        </div>
        {cardState === 'no_template' ? (
          <Link to="/studio/pakiety">
            <Button type="button" variant="secondary" size="sm">
              Przejdź do pakietu
            </Button>
          </Link>
        ) : cardState !== 'archived' ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="contracts-generate"
            onClick={onGenerate}
          >
            {hasGenerated ? 'Generuj ponownie' : 'Generuj umowę'}
          </Button>
        ) : null}
      </div>

      <div className={styles.stateBanner} data-state={cardState}>
        <strong>{stateCopy[cardState].title}</strong>
      </div>

      {isLoading ? <p className={styles.muted}>Ładowanie umów…</p> : null}
      {isError ? (
        <p className={styles.error} role="alert">
          Nie udało się wczytać zapisanych umów.
        </p>
      ) : null}
      {!isLoading && !isError && contracts.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={24} aria-hidden />
          <div>
            <strong>Nie ma jeszcze zapisanej umowy</strong>
            <p>
              {hasTemplate
                ? 'Wygeneruj dokument, sprawdź podgląd i pobierz DOCX lub PDF.'
                : 'Najpierw przypisz szablon DOCX do pakietu.'}
            </p>
          </div>
          {hasTemplate ? (
            <Button type="button" variant="secondary" size="sm" onClick={onGenerate}>
              Generuj umowę
            </Button>
          ) : null}
        </div>
      ) : null}

      {latest ? (
        <div
          className={styles.currentContract}
          data-testid="wedding-current-contract"
        >
          <ContractRow
            contract={latest}
            wedding={wedding}
            templateName={
              templateNames.get(latest.templateId) ?? 'Szablon archiwalny'
            }
            statusLabel={contractLifecycleLabel(wedding)}
            prominent
          />
        </div>
      ) : null}

      {older.length > 0 ? (
        <div className={styles.versionHistory} data-testid="wedding-version-history">
          <button
            type="button"
            className={styles.versionHistoryToggle}
            aria-expanded={historyOpen}
            data-testid="wedding-version-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            Historia wersji ({older.length})
          </button>
          {historyOpen ? (
            <div
              className={styles.versionHistoryList}
              data-testid="wedding-version-history-list"
            >
              {older.map((contract) => (
                <ContractRow
                  key={contract.draft.id}
                  contract={contract}
                  wedding={wedding}
                  templateName={
                    templateNames.get(contract.templateId) ??
                    'Szablon archiwalny'
                  }
                  statusLabel="Wersja archiwalna"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ContractRow({
  contract,
  wedding,
  templateName,
  statusLabel,
  prominent = false,
}: {
  contract: GeneratedWeddingContract
  wedding: Wedding
  templateName: string
  statusLabel: string
  prominent?: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const formats = [...new Set(contract.artifacts.map((item) => item.format))]
  const previewPath = `/sluby/${wedding.id}/umowy/${contract.draft.id}`

  async function download(format: 'docx' | 'pdf') {
    setDownloading(true)
    try {
      const url =
        await GeneratedWeddingContractService.getArtifactDownloadUrl(
          wedding.id,
          contract.draft.id,
          format,
        )
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <article
      className={prominent ? styles.cardProminent : styles.card}
      data-testid={
        prominent ? 'wedding-contract-latest' : 'wedding-contract-older'
      }
    >
      <div className={styles.cardTop}>
        <div>
          <h3>{contract.draft.title}</h3>
          <p>{templateName}</p>
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </div>
      <dl className={styles.meta}>
        <div>
          <dt>Wersja</dt>
          <dd>v{contract.generationVersion ?? 1}</dd>
        </div>
        <div>
          <dt>Data generacji</dt>
          <dd>{formatDate(contract.updatedAt)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Formaty</dt>
          <dd>
            {formats.map((value) => value.toUpperCase()).join(', ') || 'DOCX'}
          </dd>
        </div>
      </dl>
      <div className={styles.actions}>
        <Link className={styles.openLink} to={previewPath}>
          Podgląd
        </Link>
        <details className={styles.downloadMenu}>
          <summary aria-label={`Pobierz ${contract.draft.title}`}>
            <Download size={15} aria-hidden />
            Pobierz
          </summary>
          <div role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={downloading}
              onClick={() => void download('docx')}
            >
              Pobierz DOCX
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={downloading}
              onClick={() => void download('pdf')}
            >
              Pobierz PDF
            </button>
          </div>
        </details>
      </div>
    </article>
  )
}
