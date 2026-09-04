import { CalendarPage } from '@/pages/CalendarPage'
import { CalendarModernPage } from '@/pages/CalendarModernPage'
import { useInterfaceStyle } from '@/features/interface-style/useInterfaceStyle'
import { resolveScreenPresentation } from '@/features/interface-style/types'

/**
 * Product Kalendarz route. Presentation is selected by account interfaceStyle.
 * Classic and Modern keep their own page implementations; data hooks stay shared.
 */
export function CalendarRoutePage() {
  const { interfaceStyle } = useInterfaceStyle()
  const presentation = resolveScreenPresentation('calendar', interfaceStyle)

  if (presentation === 'modern') {
    return <CalendarModernPage />
  }

  return <CalendarPage />
}
