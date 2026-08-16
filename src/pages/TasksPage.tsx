import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { TasksCenter } from '@/features/tasks/TasksCenter'

export function TasksPage() {
  return (
    <AppLayout title="Zadania">
      <PageContainer width="full">
        <TasksCenter />
      </PageContainer>
    </AppLayout>
  )
}
