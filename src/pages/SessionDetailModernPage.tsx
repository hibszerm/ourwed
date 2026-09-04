import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useSession } from '@/features/sessions/hooks/useSession'
import { ModernSessionDetailWorkspace } from '@/features/sessions/modern-detail/ModernSessionDetailWorkspace'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './SessionDetailModernPage.module.css'

/**
 * Modern `/sesje/:sessionId` page shell.
 * Matches Wedding Detail Modern geometry (full PageContainer + 1280 page axis).
 * Identity lives in the hero — AppLayout has no duplicate page title.
 */
export function SessionDetailModernPage() {
  const { sessionId = '' } = useParams()
  const { data: session, isLoading, isError, error, refetch } =
    useSession(sessionId)

  if (isLoading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <div className={styles.loading}>Ładowanie szczegółów sesji…</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <p className={styles.emptyTitle}>Nie udało się załadować sesji</p>
          <p className={styles.emptyDesc}>
            {getUserFacingErrorMessage(error, 'Spróbuj odświeżyć stronę.')}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!session) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <p className={styles.emptyTitle}>Nie znaleziono</p>
          <p className={styles.emptyDesc}>
            Sesja o podanym identyfikatorze nie istnieje.
          </p>
          <Link to="/sesje">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="full">
        <div className={styles.page} data-testid="session-detail-modern">
          <ModernSessionDetailWorkspace key={session.id} session={session} />
        </div>
      </PageContainer>
    </AppLayout>
  )
}
