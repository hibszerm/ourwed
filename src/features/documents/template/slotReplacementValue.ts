/**
 * Prepare the value written into a physical slot — style, sanitize, isolate families.
 * Shared by applyBoundSlots and the quality gate so ownership spans match.
 */

import {
  formatContractDateForSlot,
  isDateRegistryKey,
} from './contractDateStyle'
import {
  extractClockTimeOnly,
  formatCoverageDurationForSource,
  stripClockTimeFromDuration,
} from './polishDuration'
import {
  isMaterialPackageRegistryKey,
  isPlaceholderOnlyValue,
} from './placeholderValue'
import { isOvertimeRegistryKey } from './numericSemanticFamily'
import { formatContractPln, formatPlnDigits } from '@/lib/utils/currency'

function parseMoneyAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/zł\.?/gi, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function prepareSlotReplacementValue(input: {
  registryKey: string
  value: string
  originalText?: string | null
  resolved: Record<string, string>
}): string {
  const key = input.registryKey
  let value = input.value.trim()
  if (!value) return ''

  if (isDateRegistryKey(key)) {
    return formatContractDateForSlot({
      isoOrValue: value,
      sourceText: input.originalText ?? value,
    })
  }

  if (
    key === 'coverage_hours' ||
    key === 'working_hours' ||
    key === 'package_duration'
  ) {
    value = stripClockTimeFromDuration(value)
    const hours = Number(value.match(/\d+/)?.[0])
    if (Number.isFinite(hours)) {
      return formatCoverageDurationForSource({
        hours,
        sourceText: input.originalText ?? value,
      })
    }
    return value
  }

  if (key === 'coverage_end_time' || key === 'coverage_start_time') {
    const clock =
      extractClockTimeOnly(value) ??
      extractClockTimeOnly(input.resolved.coverage_end_time ?? '')
    return clock ?? value
  }

  if (key === 'couple_party_participle') {
    // Owned participle only — never rewrite adjacent legal prose.
    return value
  }

  // Overtime money — never emit bare "1400" when the template uses PLN formatting.
  if (isOvertimeRegistryKey(key) || key === 'overtime_rate') {
    const original = (input.originalText ?? '').trim()
    const ownsCurrency = /zł/i.test(original)
    const formattedBag =
      input.resolved.overtime_rate_formatted?.trim() ||
      input.resolved.overtime_price?.trim() ||
      ''
    const amount =
      parseMoneyAmount(value) ??
      parseMoneyAmount(formattedBag) ??
      parseMoneyAmount(input.resolved.overtime_rate ?? '')

    if (amount != null) {
      if (ownsCurrency) {
        // Slot owns "1000 zł" → write full "1 400 zł" (never double zł).
        if (formattedBag && /zł/i.test(formattedBag)) {
          return formattedBag.replace(/\s+/g, ' ').trim()
        }
        return formatContractPln(amount)
      }
      // Slot owns only "1000" before immutable " zł" → digits only.
      return formatPlnDigits(amount)
    }
  }

  if (isMaterialPackageRegistryKey(key) && isPlaceholderOnlyValue(value)) {
    return ''
  }

  return value
}
