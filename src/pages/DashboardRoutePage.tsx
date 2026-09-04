import { DashboardPage } from '@/pages/DashboardPage'
import { DashboardV3Page } from '@/pages/DashboardV3Page'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product Pulpit route. Presentation is selected by account interfaceStyle.
 * Classic and Modern keep their own page implementations; data hooks stay shared.
 */
export function DashboardRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('dashboard', interfaceStyle)

  if (presentation === 'modern') {
    return <DashboardV3Page />
  }

  return <DashboardPage />
}
