import { useParams } from 'react-router-dom'
import { PreWeddingPublicFormPage } from '@/features/prewedding/PreWeddingPublicFormPage'
import { usePublicThemeIsolation } from '@/features/theme/usePublicThemeIsolation'

/** Public pre-wedding questionnaire — /ankieta/:token (no auth required) */
export function PublicPreWeddingQuestionnairePage() {
  const { token = '' } = useParams<{ token: string }>()
  usePublicThemeIsolation(true)
  return <PreWeddingPublicFormPage token={token} />
}
