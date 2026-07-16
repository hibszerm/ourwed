import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { pendingWeddingService } from '@/lib/api/pendingWeddingService'
import { formatShortDate } from '@/lib/utils/dates'
import styles from './PendingWeddingsCard.module.css'

export function PendingWeddingsCard() {
  const queryClient = useQueryClient()
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['pending-weddings'],
    queryFn: () => pendingWeddingService.getPending(),
  })

  async function handleAccept(id: string) {
    await pendingWeddingService.accept(id)
    await queryClient.invalidateQueries({ queryKey: ['pending-weddings'] })
    await queryClient.invalidateQueries({ queryKey: ['weddings'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  async function handleReject(id: string) {
    await pendingWeddingService.reject(id)
    await queryClient.invalidateQueries({ queryKey: ['pending-weddings'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  return (
    <Card>
      <CardHeader
        title="Nowe zgłoszenia"
        subtitle={
          pending.length > 0
            ? `${pending.length} oczekuje na zatwierdzenie`
            : 'Brak nowych zgłoszeń'
        }
      />

      {isLoading && <p className={styles.empty}>Ładowanie…</p>}

      {!isLoading && pending.length === 0 && (
        <p className={styles.empty}>Nie ma oczekujących zgłoszeń.</p>
      )}

      {!isLoading && pending.length > 0 && (
        <ul className={styles.list}>
          {pending.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.couple}>{item.coupleLabel}</p>
                <p className={styles.meta}>
                  <span>{formatShortDate(item.weddingDate)}</span>
                  <span className={styles.dot}>·</span>
                  <span>{item.packageName}</span>
                </p>
                <p className={styles.submitted}>
                  Wysłano {formatShortDate(item.submittedAt.slice(0, 10))}
                </p>
                <span className={styles.badge}>Oczekuje na zatwierdzenie</span>
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleAccept(item.id)}
                >
                  Akceptuj
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReject(item.id)}
                >
                  Odrzuć
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
