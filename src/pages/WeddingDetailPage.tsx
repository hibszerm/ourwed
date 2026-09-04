import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { IconArrowLeft } from '@/components/icons'
import { WeddingDetailV2 } from '@/features/weddings/detail/v2/WeddingDetailV2'
import { WeddingDetailHostModals } from '@/features/weddings/detail/WeddingDetailHostModals'
import { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './WeddingDetailPage.module.css'

export function WeddingDetailPage() {
  const host = useWeddingDetailHost()

  if (host.isLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className={styles.loading}>Ładowanie szczegółów ślubu...</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (host.isError) {
    return (
      <AppLayout title="Błąd">
        <PageContainer>
          <p className={styles.notFound}>
            {getUserFacingErrorMessage(host.error, 'Nie udało się załadować ślubu.')}
          </p>
          <Button type="button" variant="secondary" onClick={() => void host.refetch()}>
            Spróbuj ponownie
          </Button>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!host.wedding || !host.snapshot || !host.sharedProps) {
    return (
      <AppLayout title="Nie znaleziono">
        <PageContainer>
          <p className={styles.notFound}>Ślub o podanym identyfikatorze nie istnieje.</p>
          <Link to="/sluby">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      action={
        !host.sharedProps.editing ? (
          <Link to="/sluby">
            <Button variant="ghost">
              <IconArrowLeft />
              Wróć do listy
            </Button>
          </Link>
        ) : null
      }
    >
      <PageContainer>
        <WeddingDetailV2 key={host.wedding.id} {...host.sharedProps} />
      </PageContainer>
      <WeddingDetailHostModals host={host} />
    </AppLayout>
  )
}
