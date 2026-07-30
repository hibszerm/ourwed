/**
 * Focused pre-wedding template editor route wrapper.
 * Reuses PreWeddingTemplatesPage list+editor with deep-link selection.
 */

import { useParams, Navigate } from 'react-router-dom'
import { PreWeddingTemplatesPage } from '@/pages/PreWeddingTemplatesPage'

export function PreWeddingTemplateEditorRoute() {
  const { templateId } = useParams<{ templateId: string }>()
  if (!templateId) return <Navigate to="/ankiety" replace />
  return <PreWeddingTemplatesPage initialTemplateId={templateId} />
}
