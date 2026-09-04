import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { Link } from 'react-router-dom'
import { WeddingDetailHostModals } from '@/features/weddings/detail/WeddingDetailHostModals'
import { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'
import { ModernWeddingDetailWorkspace } from '@/features/weddings/modern-detail/ModernWeddingDetailWorkspace'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './WeddingDetailModernPage.module.css'

export function WeddingDetailModernPage() {
  const host = useWeddingDetailHost()

  if (host.isLoading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <div className={styles.loading}>Ładowanie szczegółów ślubu...</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (host.isError) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <p className={styles.emptyTitle}>Nie udało się załadować ślubu</p>
          <p className={styles.emptyDesc}>
            {getUserFacingErrorMessage(host.error, 'Spróbuj odświeżyć stronę.')}
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
      <AppLayout>
        <PageContainer width="wide">
          <p className={styles.emptyTitle}>Nie znaleziono</p>
          <p className={styles.emptyDesc}>Ślub o podanym identyfikatorze nie istnieje.</p>
          <Link to="/sluby">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="wedding-detail-modern">
          <ModernWeddingDetailWorkspace
            key={host.wedding.id}
            {...host.sharedProps}
          />
        </div>
      </PageContainer>
      <WeddingDetailHostModals host={host} />
    </AppLayout>
  )
}
