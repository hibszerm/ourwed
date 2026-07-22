import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { questionnaireService } from '@/lib/api/questionnaireService'
import { formatShortDate } from '@/lib/utils/dates'
import styles from './PendingWeddingsCard.module.css'

export function PendingWeddingsCard() {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['pending-questionnaires'],
    queryFn: () => questionnaireService.listPending(),
  })

  async function handleAccept(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await questionnaireService.approve(id)
      await queryClient.invalidateQueries({ queryKey: ['pending-questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Nie udało się zaakceptować zgłoszenia.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await questionnaireService.reject(id)
      await queryClient.invalidateQueries({ queryKey: ['pending-questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Nie udało się odrzucić zgłoszenia.',
      )
    } finally {
      setBusyId(null)
    }
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
        action={
          <Link to="/oczekujace">
            <Button type="button" variant="ghost" size="sm">
              Wszystkie
            </Button>
          </Link>
        }
      />

      {isLoading && <p className={styles.empty}>Ładowanie…</p>}

      {!isLoading && pending.length === 0 && (
        <p className={styles.empty}>Nie ma oczekujących zgłoszeń.</p>
      )}

      {!isLoading && pending.length > 0 && (
        <ul className={styles.list}>
          {pending.slice(0, 4).map((item) => (
            <li key={item.instance.id} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.couple}>{item.coupleLabel}</p>
                <p className={styles.meta}>
                  <span>
                    {item.weddingDate
                      ? formatShortDate(item.weddingDate)
                      : 'Data do ustalenia'}
                  </span>
                  <span className={styles.dot}>·</span>
                  <span>{item.packageName || item.formName}</span>
                </p>
                <p className={styles.submitted}>
                  Wysłano{' '}
                  {item.instance.submittedAt
                    ? formatShortDate(item.instance.submittedAt.slice(0, 10))
                    : '—'}
                </p>
                <span className={styles.badge}>Oczekuje na zatwierdzenie</span>
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busyId === item.instance.id}
                  onClick={() => void handleAccept(item.instance.id)}
                >
                  {busyId === item.instance.id ? 'Zapisywanie…' : 'Akceptuj'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === item.instance.id}
                  onClick={() => void handleReject(item.instance.id)}
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
