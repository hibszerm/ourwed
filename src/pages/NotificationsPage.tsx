import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernNotificationsWorkspace } from '@/features/notifications/modern/ModernNotificationsWorkspace'

export function NotificationsPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernNotificationsWorkspace />
      </PageContainer>
    </AppLayout>
  )
}
