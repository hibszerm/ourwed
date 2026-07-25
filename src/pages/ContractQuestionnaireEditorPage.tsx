import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { QuestionnaireModuleNav } from '@/features/questionnaires/QuestionnaireModuleNav'
import { ContractQuestionnaireBuilder } from '@/features/questionnaires/builder/ContractQuestionnaireBuilder'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import styles from '@/features/questionnaires/Questionnaires.module.css'

export function ContractQuestionnaireEditorPage() {
  const userId = useStudioAuthId()
  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey: ['company-details', userId, 'questionnaire-config'],
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
  })

  return (
    <AppLayout>
      <PageContainer>
        <QuestionnaireModuleNav />
        {isLoading ? (
          <p className={styles.muted}>Ładowanie konfiguracji ankiety…</p>
        ) : isError ? (
          <p className={styles.errorText} role="alert">
            {error instanceof Error
              ? error.message
              : 'Nie udało się wczytać konfiguracji ankiety.'}
          </p>
        ) : (
          <ContractQuestionnaireBuilder
            initialConfig={data?.questionnaireConfig}
            dataUpdatedAt={dataUpdatedAt}
          />
        )}
      </PageContainer>
    </AppLayout>
  )
}
