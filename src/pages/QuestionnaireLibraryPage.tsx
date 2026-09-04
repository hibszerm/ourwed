import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernQuestionnaireLibrary } from '@/features/prewedding/modern/ModernQuestionnaireLibrary'

export function QuestionnaireLibraryPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <ModernQuestionnaireLibrary />
      </PageContainer>
    </AppLayout>
  )
}
