/**
 * Deterministic synthetic test-generation gate before generationReady.
 * Does not persist a real contract — validates slot minimalism + immutable wording.
 */

import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { LEGAL_WRAPPER_PHRASES, isSlotPhysicallyUnsafe } from './contractSlotSafety'
import { verifyContractTransformation } from './contractQualityCheck'
import { canonicalizeParagraphText } from './canonicalParagraph'
import type { TemplateSlot } from './types'

export const SYNTHETIC_TEST_VALUES: Record<string, string> = {
  company_name: 'TESTOWE STUDIO FILMOWE',
  company_representative: 'JAN TESTOWY',
  partner1_full_name: 'JAN TESTOWY',
  partner2_full_name: 'ANNA TESTOWA',
  couple_full_names: 'JAN TESTOWY i ANNA TESTOWA',
  company_city_locative: 'Krakowie',
  contract_value_formatted: '12 345 zł',
  package_price: '12 345 zł',
  contract_execution_date: '01.01.2099',
}

export interface TestGenerationGateResult {
  ok: boolean
  reasons: string[]
  transformedParagraphs: Array<{ index: number; text: string }>
}

/**
 * Apply synthetic values to physically bound replace slots and verify safety.
 */
export function runSyntheticTestGenerationGate(input: {
  paragraphs: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  sourceKind?: 'docx' | 'pdf' | string
}): TestGenerationGateResult {
  const reasons: string[] = []

  if (input.sourceKind === 'pdf') {
    return {
      ok: false,
      reasons: [
        'PDF analysis is evidence-only — generationReady requires a reviewed DOCX with physical bindings.',
      ],
      transformedParagraphs: input.paragraphs,
    }
  }

  const bound = input.slots.filter(
    (s) =>
      s.enabled !== false &&
      s.physicallyBound &&
      s.registryKey &&
      s.operation !== 'insert' &&
      s.variableClassification !== 'template_constant' &&
      s.variableClassification !== 'ignored_non_variable',
  )

  const immutableProviderOriginals = new Set(
    input.slots
      .filter(
        (s) =>
          s.sourceHint === 'company' &&
          (s.variableClassification === 'template_constant' ||
            s.variableClassification === 'ignored_non_variable') &&
          Boolean(s.originalText?.trim()),
      )
      .map((s) => s.originalText!.trim()),
  )

  for (const s of bound) {
    if (isSlotPhysicallyUnsafe(s)) {
      reasons.push(
        `Unsafe physical span for ${s.registryKey} — cannot run test generation`,
      )
    }
  }
  if (reasons.length > 0) {
    return { ok: false, reasons, transformedParagraphs: input.paragraphs }
  }

  const resolved: Record<string, string> = { ...SYNTHETIC_TEST_VALUES }
  for (const s of bound) {
    const key = s.registryKey!
    if (!resolved[key] && s.originalText) {
      // Distinct synthetic placeholder so we can detect replacement
      resolved[key] = `⟦TEST:${key}⟧`
    }
  }

  const applied = applyBoundSlotsToParagraphs({
    original: input.paragraphs,
    slots: bound,
    resolved,
  })
  if (applied.failures.length > 0) {
    for (const f of applied.failures) {
      reasons.push(`Locate failed for ${f.registryKey}: ${f.reason}`)
    }
  }

  const quality = verifyContractTransformation({
    original: input.paragraphs,
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots: bound,
  })
  if (!quality.ok) {
    reasons.push(
      quality.reason ??
        'Immutable wording changed outside approved minimal spans',
    )
  }

  const joinedOut = applied.paragraphs.map((p) => p.text).join('\n')
  const joinedIn = input.paragraphs.map((p) => p.text).join('\n')

  // Expected synthetics that we resolved must appear
  for (const s of bound) {
    const key = s.registryKey!
    const value = resolved[key]
    if (value && !joinedOut.includes(value)) {
      reasons.push(`Synthetic value for ${key} missing in transformed output`)
    }
    const original = s.originalText?.trim()
    if (
      original &&
      value &&
      original !== value &&
      // exact original should not remain as standalone if replaced
      countStandalone(joinedOut, original) > 0 &&
      // allow if original is suffix of new value
      !value.endsWith(original)
    ) {
      // Only flag when original was unique in source
      if (countStandalone(joinedIn, original) === 1) {
        reasons.push(
          `Stale source value still present for ${key}: “${original.slice(0, 40)}”`,
        )
      }
    }
  }

  // Legal wrappers from source must remain
  for (const phrase of LEGAL_WRAPPER_PHRASES) {
    if (
      joinedIn.toLocaleLowerCase('pl-PL').includes(
        phrase.toLocaleLowerCase('pl-PL'),
      ) &&
      !joinedOut
        .toLocaleLowerCase('pl-PL')
        .includes(phrase.toLocaleLowerCase('pl-PL'))
    ) {
      reasons.push(`Immutable legal wrapper removed: “${phrase}”`)
    }
  }

  // Provider template_constant values must remain (not stale, not removed)
  for (const orig of immutableProviderOriginals) {
    if (joinedIn.includes(orig) && !joinedOut.includes(orig)) {
      reasons.push(
        `Immutable provider value was removed from template: “${orig.slice(0, 40)}”`,
      )
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    transformedParagraphs: applied.paragraphs.map((p) => ({
      index: p.index,
      text: canonicalizeParagraphText(p.text),
    })),
  }
}

function countStandalone(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    count += 1
    from = idx + Math.max(1, needle.length)
  }
  return count
}
