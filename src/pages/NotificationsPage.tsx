import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernNotificationsWorkspace } from '@/features/notifications/modern/ModernNotificationsWorkspace'
import { Link } from 'react-router-dom'
import styles from './NotificationsPage.module.css'

export function NotificationsPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <Link className={styles.weddingInvitationsLink} to="/wspolpraca/zaproszenia">
          Zaproszenia do zleceń
        </Link>
        <ModernNotificationsWorkspace />
      </PageContainer>
    </AppLayout>
  )
}
