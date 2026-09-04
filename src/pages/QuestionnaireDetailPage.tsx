import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernQuestionnaireDetailWorkspace } from '@/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace'

export function QuestionnaireDetailPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernQuestionnaireDetailWorkspace />
      </PageContainer>
    </AppLayout>
  )
}
