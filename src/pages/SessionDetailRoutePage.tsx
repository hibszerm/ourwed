import { SessionDetailPage } from '@/pages/SessionDetailPage'
import { SessionDetailModernPage } from '@/pages/SessionDetailModernPage'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product `/sesje/:sessionId` route. Presentation follows account interfaceStyle.
 * Classic keeps SessionDetailPage; Modern uses the session modern-detail workspace.
 */
export function SessionDetailRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('session', interfaceStyle)

  if (presentation === 'modern') {
    return <SessionDetailModernPage />
  }

  return <SessionDetailPage />
}
