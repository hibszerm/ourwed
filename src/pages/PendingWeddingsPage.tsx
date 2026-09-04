import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernPendingWorkspace } from '@/features/questionnaires/pending/modern/ModernPendingWorkspace'

export function PendingWeddingsPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernPendingWorkspace />
      </PageContainer>
    </AppLayout>
  )
}
