import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { WeddingDetailModernPage } from '@/pages/WeddingDetailModernPage'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product `/sluby/:id` route. Presentation is selected by account interfaceStyle.
 * Classic keeps Wedding Detail V2; Modern uses the Phase 1 workspace.
 */
export function WeddingDetailRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('wedding', interfaceStyle)

  if (presentation === 'modern') {
    return <WeddingDetailModernPage />
  }

  return <WeddingDetailPage />
}
