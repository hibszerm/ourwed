/**
 * Mapping warning severity — relative payment is informational only.
 */

import type { StructuredAiMappingResponse } from './types'

export type MappingWarningSeverity = 'info' | 'warning' | 'blocking'

export type ClassifiedMappingWarning =
  StructuredAiMappingResponse['warnings'][number] & {
    severity: MappingWarningSeverity
    userMessage?: string
  }

export function classifyMappingWarning(
  warning: StructuredAiMappingResponse['warnings'][number],
): ClassifiedMappingWarning {
  if (warning.code === 'unsupported_payment_structure') {
    const relative =
      /relative|względ|dni przed|before the event/i.test(warning.message) ||
      /14\s+dni/i.test(warning.message)
    if (relative) {
      return {
        ...warning,
        severity: 'info',
        userMessage:
          'Termin płatności pozostanie zapisany względem daty wydarzenia.',
      }
    }
  }

  if (warning.code === 'missing_required_field') {
    return { ...warning, severity: 'blocking' }
  }

  return { ...warning, severity: 'warning' }
}

export function blockingWarnings(
  warnings: StructuredAiMappingResponse['warnings'] | undefined,
): ClassifiedMappingWarning[] {
  return (warnings ?? [])
    .map(classifyMappingWarning)
    .filter((w) => w.severity === 'blocking')
}
