import { useParams } from 'react-router-dom'
import { ProductionContractFormPage } from '@/features/forms/ProductionContractFormPage'
import { usePublicThemeIsolation } from '@/features/theme/usePublicThemeIsolation'

/** Public production questionnaire — /form/:token */
export function PublicFormTokenPage() {
  const { token = '' } = useParams<{ token: string }>()
  usePublicThemeIsolation(true)
  return <ProductionContractFormPage key={token} token={token} />
}
