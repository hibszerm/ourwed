import { useParams } from 'react-router-dom'
import { FormPublicPage } from '@/features/forms/FormPublicPage'

export function FormPage() {
  const { token = '' } = useParams<{ token: string }>()
  return <FormPublicPage token={token} />
}
