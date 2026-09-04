import { SessionsPage } from '@/pages/SessionsPage'
import { SessionsModernPage } from '@/pages/SessionsModernPage'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product Sesje route. Presentation is selected by account interfaceStyle.
 * Classic and Modern keep their own page implementations; data hooks stay shared.
 */
export function SessionsRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('sessions', interfaceStyle)

  if (presentation === 'modern') {
    return <SessionsModernPage />
  }

  return <SessionsPage />
}
