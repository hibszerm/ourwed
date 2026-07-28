import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { documentStorage } from '@/lib/api/documents/storage'
import { weddingContractRecoveryRepository } from '@/features/wedding-contract-recovery/repository'
import { reanalyzeSourceContract } from '@/features/wedding-contract-recovery/recoveryService'
import { useToast } from '@/components/ui/Toast'
import {
  PackageSnapshotCard,
  packageSnapshotFromRow,
} from '@/features/wedding-contract-recovery/components/PackageSnapshotCard'
import styles from './WeddingSourceContractsPanel.module.css'

function statusLabel(status: string): string {
  switch (status) {
    case 'uploaded':
      return 'Przesłano'
    case 'extracting':
    case 'extracting_text':
      return 'Odczytywanie'
    case 'analyzing':
      return 'Analizowanie'
    case 'ready_for_review':
      return 'Wymaga sprawdzenia'
    case 'applied':
      return 'Dane zastosowane'
    case 'failed':
      return 'Analiza nie powiodła się'
    default:
      return status
  }
}

export function WeddingSourceContractsPanel({ weddingId }: { weddingId: string }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const { data: sourceContracts = [], refetch } = useQuery({
    queryKey: ['wedding-source-contracts', weddingId],
    queryFn: () => weddingContractRecoveryRepository.listSourceContractsByWedding(weddingId),
  })

  const { data: packageSnapshots = [] } = useQuery({
    queryKey: ['wedding-contract-package-snapshots', weddingId],
    queryFn: () => weddingContractRecoveryRepository.listPackageSnapshotsByWedding(weddingId),
  })

  const sourceNameById = new Map(
    sourceContracts.map((c) => [c.id, c.originalFileName] as const),
  )

  async function openContract(filePath: string) {
    const url = await documentStorage.signedUrl(filePath)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleReanalyze(sourceContractId: string) {
    try {
      const recovery = await reanalyzeSourceContract(sourceContractId)
      showToast('Ponowna analiza zakończona', 'success')
      await refetch()
      navigate(`/sluby/${weddingId}/uzupelnij-z-umowy?recoveryId=${recovery.id}`)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się ponowić analizy.',
        'error',
      )
    }
  }

  return (
    <section className={styles.wrap} aria-labelledby="source-contracts-title">
      <div className={styles.header}>
        <div className={styles.intro}>
          <h2 id="source-contracts-title" className={styles.title}>
            Umowy źródłowe
          </h2>
          <p className={styles.description}>
            Wgraj istniejącą umowę PDF lub DOCX i uzupełnij dane zlecenia.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/sluby/${weddingId}/uzupelnij-z-umowy`)}
        >
          Uzupełnij dane z umowy
        </Button>
      </div>

      {sourceContracts.length === 0 ? (
        <p className={styles.emptyState}>Brak wgranych umów źródłowych.</p>
      ) : (
        <div className={styles.list}>
          {sourceContracts.map((contract) => (
            <article key={contract.id} className={styles.card}>
              <div className={styles.cardBody}>
                <p className={styles.fileName} title={contract.originalFileName}>
                  {contract.originalFileName}
                </p>
                <p className={styles.meta}>
                  {contract.mimeType.includes('pdf') ? 'PDF' : 'DOCX'} ·{' '}
                  {new Date(contract.createdAt).toLocaleString('pl-PL')}
                </p>
                <p className={styles.status}>{statusLabel(contract.status)}</p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void openContract(contract.filePath)}
                >
                  Otwórz
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleReanalyze(contract.id)}
                >
                  Analizuj ponownie
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {packageSnapshots.length > 0 ? (
        <div className={styles.packageSection}>
          {packageSnapshots.map((snapshot) => (
            <PackageSnapshotCard
              key={snapshot.id}
              model={packageSnapshotFromRow(
                snapshot,
                sourceNameById.get(snapshot.sourceContractId) ?? null,
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
