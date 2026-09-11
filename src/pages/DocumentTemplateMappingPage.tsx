import { Navigate, useParams } from 'react-router-dom'

/**
 * Legacy AI analysis wizard route — quarantined from V1 product UI.
 * Direct visits redirect to the slim template detail page.
 * Import-flow implementation remains in the codebase for a later cleanup batch.
 */
export function DocumentTemplateMappingPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return <Navigate to="/studio/pakiety" replace />
  }
  return <Navigate to={`/ustawienia/dokumenty/szablony/${id}`} replace />
}
