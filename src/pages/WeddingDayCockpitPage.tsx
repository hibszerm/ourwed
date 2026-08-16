import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { WeddingDayCockpitView } from '@/features/wedding-day-cockpit/WeddingDayCockpitView'
import { useWeddingDayCockpitData } from '@/features/wedding-day-cockpit/useWeddingDayCockpitData'
import { Button } from '@/components/ui/Button'
import styles from '@/features/wedding-day-cockpit/WeddingDayCockpit.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function WeddingDayCockpitPage() {
  const { weddingId = '' } = useParams<{ weddingId: string }>()
  const { userId, data, isLoading, isError, error, refetch } =
    useWeddingDayCockpitData(weddingId)

  if (!weddingId) {
    return (
      <AppLayout title="Dzień ślubu">
        <p>Brak identyfikatora zlecenia.</p>
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <AppLayout title="Dzień ślubu">
        <p className={styles.loading} data-testid="cockpit-loading">
          Ładowanie trybu dnia ślubu…
        </p>
      </AppLayout>
    )
  }

  if (isError || !data) {
    return (
      <AppLayout title="Dzień ślubu">
        <div className={styles.errorBox} data-testid="cockpit-error">
          <p>
            {getUserFacingErrorMessage(error, 'Nie udało się otworzyć trybu dnia ślubu.')}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
          <p style={{ marginTop: 16 }}>
            <Link to={`/sluby/${weddingId}`}>Wróć do zlecenia</Link>
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <WeddingDayCockpitView data={data} userId={userId} />
    </AppLayout>
  )
}
