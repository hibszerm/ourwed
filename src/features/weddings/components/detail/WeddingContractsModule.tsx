import { useState } from 'react'
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

type CardState =
  | 'no_template'
  | 'template_available'
  | 'generated'
  | 'archived'

export function WeddingContractsModule({ wedding, onGenerate }: Props) {
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
      title: 'Umowa wygenerowana',
      body: 'Poniżej znajdziesz zapisane wersje. Możesz wygenerować kolejną.',
    },
    archived: {
      title: 'Umowa zarchiwizowana',
      body: 'Ten ślub ma zarchiwizowany status umowy.',
    },
  }

  return (
    <section className={styles.section} aria-labelledby="wedding-contracts-title">
      <div className={styles.header}>
        <div>
          <h2 id="wedding-contracts-title">Umowa</h2>
          <p>{stateCopy[cardState].body}</p>
        </div>
        {cardState === 'no_template' ? (
          <Link to="/studio/pakiety">
            <Button type="button" variant="secondary" size="sm">
              Przejdź do pakietu
            </Button>
          </Link>
        ) : cardState !== 'archived' ? (
          <Button type="button" variant="primary" size="sm" onClick={onGenerate}>
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
      {contracts.length > 0 ? (
        <div className={styles.grid}>
          {contracts.map((contract) => (
            <ContractRow
              key={contract.draft.id}
              contract={contract}
              wedding={wedding}
              templateName={
                templateNames.get(contract.templateId) ?? 'Szablon archiwalny'
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ContractRow({
  contract,
  wedding,
  templateName,
}: {
  contract: GeneratedWeddingContract
  wedding: Wedding
  templateName: string
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
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <div>
          <h3>{contract.draft.title}</h3>
          <p>{templateName}</p>
        </div>
        <span className={styles.status}>Gotowa</span>
      </div>
      <dl className={styles.meta}>
        <div>
          <dt>Ślub</dt>
          <dd>{wedding.date}</dd>
        </div>
        <div>
          <dt>Wersja</dt>
          <dd>v{contract.generationVersion ?? 1}</dd>
        </div>
        <div>
          <dt>Formaty</dt>
          <dd>{formats.map((value) => value.toUpperCase()).join(', ') || 'DOCX'}</dd>
        </div>
        <div>
          <dt>Zmodyfikowano</dt>
          <dd>{formatDate(contract.updatedAt)}</dd>
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
