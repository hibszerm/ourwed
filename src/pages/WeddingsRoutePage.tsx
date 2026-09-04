import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingsModernPage } from '@/pages/WeddingsModernPage'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product Śluby route. Presentation is selected by account interfaceStyle.
 * Classic and Modern keep their own page implementations; data hooks stay shared.
 */
export function WeddingsRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('weddings', interfaceStyle)

  if (presentation === 'modern') {
    return <WeddingsModernPage />
  }

  return <WeddingsPage />
}
