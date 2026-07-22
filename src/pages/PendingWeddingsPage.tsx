import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { questionnaireService } from '@/lib/api/questionnaireService'
import { formatShortDate } from '@/lib/utils/dates'
import styles from '@/features/questionnaires/Questionnaires.module.css'

export function PendingWeddingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pending-questionnaires', userId],
    queryFn: () => questionnaireService.listPending(),
    enabled: Boolean(userId),
  })

  async function handleApprove(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      const { wedding } = await questionnaireService.approve(id)
      await queryClient.invalidateQueries({ queryKey: ['pending-questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/sluby/${wedding.id}`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Nie udało się zatwierdzić.')
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
      window.alert(err instanceof Error ? err.message : 'Nie udało się odrzucić.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout
      title="Oczekujące"
      subtitle={
        isLoading
          ? 'Ładowanie…'
          : `${data.length} ${data.length === 1 ? 'zgłoszenie' : 'zgłoszeń'} z ankiet`
      }
    >
      <PageContainer width="wide">
        {isLoading ? (
          <div className={styles.loading}>Ładowanie…</div>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować zgłoszeń"
            description={
              error instanceof Error ? error.message : 'Spróbuj ponownie.'
            }
          />
        ) : data.length === 0 ? (
          <EmptyState
            title="Brak oczekujących zgłoszeń"
            description="Po wypełnieniu ankiety leadowej pojawią się tutaj."
          />
        ) : (
          <div className={styles.detailGrid}>
            {data.map((item) => (
              <Card key={item.instance.id}>
                <CardHeader
                  title={item.coupleLabel}
                  subtitle={item.formName}
                  action={
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busyId === item.instance.id}
                        onClick={() => void handleApprove(item.instance.id)}
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
                  }
                />
                <dl className={styles.metaList}>
                  <div>
                    <dt>Data ślubu</dt>
                    <dd>
                      {item.weddingDate
                        ? formatShortDate(item.weddingDate)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Pakiet</dt>
                    <dd>{item.packageName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Ceremonia</dt>
                    <dd>{item.ceremonyLocation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Przyjęcie</dt>
                    <dd>{item.receptionLocation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Telefon</dt>
                    <dd>{item.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{item.email || '—'}</dd>
                  </div>
                </dl>
                <div className={styles.actions} style={{ marginTop: 16 }}>
                  <Link to={`/ankiety/${item.instance.id}`}>
                    <Button type="button" variant="secondary" size="sm">
                      Zobacz ankietę
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
        {isError ? (
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
