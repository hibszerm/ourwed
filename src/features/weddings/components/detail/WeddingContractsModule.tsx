import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import {
  GeneratedWeddingContractService,
  type GeneratedWeddingContract,
} from '@/features/documents/template'
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

export function WeddingContractsModule({ wedding, onGenerate }: Props) {
  const { data: templates = [] } = useDocumentTemplates()
  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contracts', wedding.id],
    queryFn: () => GeneratedWeddingContractService.listForWedding(wedding.id),
  })
  const templateNames = new Map(templates.map((item) => [item.id, item.name]))

  return (
    <section className={styles.section} aria-labelledby="wedding-contracts-title">
      <div className={styles.header}>
        <div>
          <h2 id="wedding-contracts-title">Umowy</h2>
          <p>Dokumenty zapisane dla tego ślubu.</p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={onGenerate}>
          Generuj umowę
        </Button>
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
            <p>Wygeneruj dokument, sprawdź dane i zapisz artefakt DOCX.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onGenerate}>
            Generuj umowę
          </Button>
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
          <dd>{formats.map((value) => value.toUpperCase()).join(', ')}</dd>
        </div>
        <div>
          <dt>Zmodyfikowano</dt>
          <dd>{formatDate(contract.updatedAt)}</dd>
        </div>
      </dl>
      <div className={styles.actions}>
        <Link className={styles.openLink} to={previewPath}>
          Otwórz
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
              DOCX
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={downloading || !formats.includes('pdf')}
              onClick={() => formats.includes('pdf') && void download('pdf')}
            >
              {formats.includes('pdf') ? 'PDF' : 'PDF niedostępny'}
            </button>
          </div>
        </details>
        <details className={styles.moreMenu}>
          <summary aria-label={`Więcej opcji dla ${contract.draft.title}`}>
            <MoreHorizontal size={17} aria-hidden />
          </summary>
          <div role="menu">
            <Link role="menuitem" to={previewPath}>
              Szczegóły umowy
            </Link>
          </div>
        </details>
      </div>
    </article>
  )
}
