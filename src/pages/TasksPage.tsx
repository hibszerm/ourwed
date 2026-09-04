import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernTasksWorkspace } from '@/features/tasks/modern/ModernTasksWorkspace'

export function TasksPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernTasksWorkspace />
      </PageContainer>
    </AppLayout>
  )
}
