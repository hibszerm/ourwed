import { useParams } from 'react-router-dom'
import { ProductionContractFormPage } from '@/features/forms/ProductionContractFormPage'

/** Public production questionnaire — /form/:token */
export function PublicFormTokenPage() {
  const { token = '' } = useParams<{ token: string }>()
  return <ProductionContractFormPage key={token} />
}
