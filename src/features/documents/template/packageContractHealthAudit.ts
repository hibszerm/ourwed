/**
 * Package-contract template health audit (upload-time, product-facing).
 *
 * Detects template-quality issues that survive generation:
 * - derived financial amounts (percentage + concrete zł tied to contract price)
 * - single physical location covering multiple wedding roles
 * - broken payment numbering / orphan installment labels
 *
 * Warnings do not block generation. Critical issues still block readiness.
 * Detection is semantic/generic — no template-specific hardcoded amounts.
 */

import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import { devErrorArgs, devInfoArgs } from '@/lib/debug/devConsole'

export type PackageContractHealthStatus = 'ok' | 'warning' | 'critical'

export type PackageContractHealthCode =
  | 'bindings_valid'
  | 'required_data_ready'
  | 'package_mode'
  | 'quality_safe'
  | 'immutable_preserved'
  | 'derived_financial_value'
  | 'multi_location_slot'
  | 'payment_numbering_inconsistent'
  | 'remaining_amount_mismatch'
  | 'deposit_mismatch'

export type PackageContractHealthCheck = {
  id: string
  code: PackageContractHealthCode
  status: PackageContractHealthStatus
  title: string
  message?: string
  recommendation?: string
  paragraphIndex?: number | null
  evidence?: string | null
}

export type PackageContractHealthReport = {
  generatedAt: string
  checks: PackageContractHealthCheck[]
  warningCount: number
  criticalCount: number
  /** True when no critical checks — generation may proceed. */
  generationAllowed: boolean
}

const LOCATION_KEYS = [
  'preparation_location',
  'ceremony_location',
  'reception_location',
] as const

const PRICE_KEYS = [
  'contract_value',
  'contract_value_formatted',
  'package_price',
] as const

const DEPOSIT_KEYS = [
  'deposit_amount',
  'agreed_deposit',
  'agreed_deposit_formatted',
] as const

const REMAINING_KEYS = [
  'remaining_amount',
  'remaining_after_deposit',
  'remaining_after_deposit_formatted',
  'remaining_to_pay',
  'remaining_to_pay_formatted',
] as const

const FINANCIAL_CONTEXT =
  /wynagrodzen|zadat|zalicz|rata|pozostał|kara|karę|karą|rabat|zniżk|depozyt|penalty|deposit|installment|płatno|zapłat|kwot/i

const MULTI_LOCATION_ROLES =
  /przygotowa|ceremoni|przyjęci|weseln|ślubn|lokacj|miejsc/i

/** Parse Polish-formatted money amounts from prose (zł / PLN). */
export function extractMoneyAmountsPln(text: string): number[] {
  const amounts: number[] = []
  const re =
    /(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:zł|zl|PLN)(?=\s|$|[.,;:!?)\]])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const whole = m[1]!.replace(/[ \u00a0]/g, '')
    const frac = m[2] ? m[2].padEnd(2, '0') : '00'
    const n = Number(`${whole}.${frac}`)
    if (Number.isFinite(n) && n > 0) amounts.push(n)
  }
  return amounts
}

/** Parse integer percentages from prose. */
export function extractPercentages(text: string): number[] {
  const out: number[] = []
  const re = /(\d{1,3})\s*%/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0 && n <= 100) out.push(n)
  }
  return out
}

function parseAmountFromSlotText(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  const found = extractMoneyAmountsPln(text)
  if (found[0] != null) return found[0]!
  // Bare number in slot originalText (e.g. "9000")
  const bare = text.replace(/\s/g, '').replace(',', '.')
  const n = Number(bare.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function amountsNearlyEqual(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance
}

function slotAmounts(
  slots: TemplateSlot[],
  keys: readonly string[],
): number[] {
  const out: number[] = []
  for (const slot of slots) {
    if (!slot.registryKey || !keys.includes(slot.registryKey)) continue
    if (!isSlotPhysicallyBound(slot)) continue
    const n = parseAmountFromSlotText(slot.originalText)
    if (n != null) out.push(n)
  }
  return out
}

function uniqueSpans(
  slots: TemplateSlot[],
): Array<{ paragraphIndex: number; start: number; end: number }> {
  const seen = new Set<string>()
  const out: Array<{ paragraphIndex: number; start: number; end: number }> = []
  for (const slot of slots) {
    if (!isSlotPhysicallyBound(slot) || slot.paragraphIndex == null) continue
    const start = slot.startOffset ?? slot.allowedRange?.start
    const end = slot.endOffset ?? slot.allowedRange?.end
    if (start == null || end == null) continue
    const key = `${slot.paragraphIndex}:${start}:${end}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ paragraphIndex: slot.paragraphIndex, start, end })
  }
  return out
}

/**
 * Detect percentage + concrete amount that mathematically equals pct% of a
 * known dynamic contract price (derived / calculated clause).
 */
export function detectDerivedFinancialClauses(input: {
  paragraphs: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
}): PackageContractHealthCheck[] {
  const priceAmounts = slotAmounts(input.slots, PRICE_KEYS)
  const depositAmounts = slotAmounts(input.slots, DEPOSIT_KEYS)
  const remainingAmounts = slotAmounts(input.slots, REMAINING_KEYS)
  const checks: PackageContractHealthCheck[] = []

  for (const para of input.paragraphs) {
    const text = para.text
    if (!FINANCIAL_CONTEXT.test(text)) continue
    const percentages = extractPercentages(text)
    const amounts = extractMoneyAmountsPln(text)
    if (amounts.length === 0) continue

    // Percentage + concrete amount ≈ pct% of bound contract price
    for (const pct of percentages) {
      for (const amount of amounts) {
        for (const price of priceAmounts) {
          const expected = Math.round((price * pct) / 100)
          if (!amountsNearlyEqual(amount, expected)) continue
          const isBoundAmount = input.slots.some((s) => {
            if (!isSlotPhysicallyBound(s) || s.paragraphIndex !== para.index) {
              return false
            }
            const slotAmt = parseAmountFromSlotText(s.originalText)
            return slotAmt != null && amountsNearlyEqual(slotAmt, amount)
          })
          if (isBoundAmount) {
            const looksDerivedPhrase =
              /\btj\.?\b|\bczyli\b|\bto jest\b|\bw wysokości\b/i.test(text) &&
              percentages.length > 0
            if (!looksDerivedPhrase) continue
          }
          checks.push({
            id: `derived-financial-${para.index}-${pct}-${amount}`,
            code: 'derived_financial_value',
            status: 'warning',
            title: 'Wyliczona kwota finansowa',
            message:
              'This clause contains a calculated amount derived from another dynamic field.',
            recommendation:
              'OPTION A: Create an explicit dynamic slot (e.g. deposit/penalty amount). OPTION B: Rewrite the clause so only the percentage remains.',
            paragraphIndex: para.index,
            evidence: text.trim().slice(0, 220),
          })
        }

        // Deposit mismatch: clause amount ≈ pct% of price but ≠ bound deposit
        for (const price of priceAmounts) {
          const expected = Math.round((price * pct) / 100)
          if (!amountsNearlyEqual(amount, expected)) continue
          for (const deposit of depositAmounts) {
            if (amountsNearlyEqual(amount, deposit)) continue
            if (!/zadat|zalicz|depozyt|deposit/i.test(text)) continue
            checks.push({
              id: `deposit-mismatch-${para.index}-${amount}`,
              code: 'deposit_mismatch',
              status: 'warning',
              title: 'Niespójna zaliczka',
              message:
                'A deposit percentage clause uses an amount that does not match the bound deposit slot.',
              recommendation:
                'Bind the deposit amount as a dynamic slot, or keep only the percentage in immutable text.',
              paragraphIndex: para.index,
              evidence: text.trim().slice(0, 220),
            })
          }
        }
      }
    }

    // Remaining mismatch: concrete remaining ≈ price − deposit but not bound
    for (const amount of amounts) {
      for (const price of priceAmounts) {
        for (const deposit of depositAmounts) {
          const expectedRemaining = Math.round(price - deposit)
          if (!amountsNearlyEqual(amount, expectedRemaining)) continue
          const boundRemaining = remainingAmounts.some((r) =>
            amountsNearlyEqual(r, amount),
          )
          if (boundRemaining) continue
          if (!/pozostał|pozostał[aeą]|remaining|do zapłaty/i.test(text)) {
            continue
          }
          if (
            percentages.length === 0 &&
            !/pomniejsz|po odjęciu|minus|tj\.?/i.test(text)
          ) {
            continue
          }
          checks.push({
            id: `remaining-mismatch-${para.index}-${amount}`,
            code: 'remaining_amount_mismatch',
            status: 'warning',
            title: 'Niespójna pozostała kwota',
            message:
              'A remaining-balance clause embeds a concrete amount that will drift when the contract price changes.',
            recommendation:
              'Bind the remaining amount as a dynamic slot, or express it only relative to the total.',
            paragraphIndex: para.index,
            evidence: text.trim().slice(0, 220),
          })
        }
      }
    }

    // Generic: % + amount with "tj." bridge and no owned money slot in paragraph
    if (
      percentages.length > 0 &&
      amounts.length > 0 &&
      /\btj\.?\b/i.test(text) &&
      FINANCIAL_CONTEXT.test(text)
    ) {
      const already = checks.some(
        (c) =>
          c.paragraphIndex === para.index &&
          c.code === 'derived_financial_value',
      )
      if (!already) {
        const ownedHere = input.slots.some((s) => {
          if (!isSlotPhysicallyBound(s) || s.paragraphIndex !== para.index) {
            return false
          }
          const key = s.registryKey ?? ''
          return (
            PRICE_KEYS.includes(key as (typeof PRICE_KEYS)[number]) ||
            DEPOSIT_KEYS.includes(key as (typeof DEPOSIT_KEYS)[number]) ||
            REMAINING_KEYS.includes(key as (typeof REMAINING_KEYS)[number]) ||
            /penalty|deposit|remaining|value|price|kwot/i.test(key)
          )
        })
        if (!ownedHere) {
          checks.push({
            id: `derived-financial-tj-${para.index}`,
            code: 'derived_financial_value',
            status: 'warning',
            title: 'Wyliczona kwota finansowa',
            message:
              'This clause contains a calculated amount derived from another dynamic field.',
            recommendation:
              'OPTION A: Create an explicit dynamic slot. OPTION B: Rewrite the clause so only the percentage remains.',
            paragraphIndex: para.index,
            evidence: text.trim().slice(0, 220),
          })
        }
      }
    }
  }

  return dedupeChecks(checks)
}

/**
 * One physical location span used for multiple wedding roles, or a single
 * location placeholder while the product stores prep/ceremony/reception.
 */
export function detectMultiLocationSlot(input: {
  paragraphs: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
}): PackageContractHealthCheck[] {
  const locationSlots = input.slots.filter(
    (s) =>
      s.registryKey &&
      LOCATION_KEYS.includes(s.registryKey as (typeof LOCATION_KEYS)[number]) &&
      isSlotPhysicallyBound(s),
  )
  if (locationSlots.length === 0) return []

  const spans = uniqueSpans(locationSlots)
  const keys = [
    ...new Set(locationSlots.map((s) => s.registryKey!).filter(Boolean)),
  ]

  // Multiple logical keys collapsed onto one physical span
  if (keys.length >= 2 && spans.length === 1) {
    return [
      {
        id: 'multi-location-shared-span',
        code: 'multi_location_slot',
        status: 'warning',
        title: 'Jedno miejsce na kilka lokalizacji',
        message:
          'This template contains only one location placeholder although the product stores preparation, ceremony and reception separately.',
        recommendation:
          'Leave as-is, or update the template so each location role has its own physical span. Do not invent placeholders automatically.',
        paragraphIndex: spans[0]!.paragraphIndex,
        evidence: locationSlots[0]?.originalText ?? null,
      },
    ]
  }

  // Single location binding, but prose mentions multiple event places
  if (spans.length === 1) {
    const para = input.paragraphs.find((p) => p.index === spans[0]!.paragraphIndex)
    const text = para?.text ?? ''
    const roleHits = [
      /przygotowa/i.test(text),
      /ceremoni/i.test(text),
      /przyjęci|weseln/i.test(text),
    ].filter(Boolean).length
    if (roleHits >= 2 || (MULTI_LOCATION_ROLES.test(text) && roleHits >= 1 && keys.length === 1)) {
      return [
        {
          id: 'multi-location-single-slot',
          code: 'multi_location_slot',
          status: 'warning',
          title: 'Jedno miejsce na kilka lokalizacji',
          message:
            'This template contains only one location placeholder although the product stores preparation, ceremony and reception separately.',
          recommendation:
            'Leave as-is, or split preparation / ceremony / reception into distinct physical spans in the template.',
          paragraphIndex: spans[0]!.paragraphIndex,
          evidence: text.trim().slice(0, 220),
        },
      ]
    }
  }

  return []
}

/**
 * Broken installment / payment list numbering in immutable prose.
 */
export function detectPaymentNumberingIssues(input: {
  paragraphs: Array<{ index: number; text: string }>
}): PackageContractHealthCheck[] {
  const hay = input.paragraphs.map((p) => p.text).join('\n')
  const checks: PackageContractHealthCheck[] = []

  const claimedMatch = hay.match(
    /(?:w\s+)?(\d+|dwóch|trzech|czterech|pięciu)\s+rat(?:ach|y)?/i,
  )
  const wordToNum: Record<string, number> = {
    dwóch: 2,
    trzech: 3,
    czterech: 4,
    pięciu: 5,
  }
  let claimed = 0
  if (claimedMatch) {
    const raw = claimedMatch[1]!.toLowerCase()
    claimed = wordToNum[raw] ?? Number(raw)
  }

  // Collect installment-ish list markers near payment context
  const paymentParas = input.paragraphs.filter((p) =>
    /rat|płatno|zapłat|wynagrodzen|zadat|zalicz/i.test(p.text),
  )
  const letterMarkers = new Set<string>()
  const numberMarkers = new Set<number>()
  for (const p of paymentParas) {
    const letters = p.text.matchAll(/\b([a-d])\)/gi)
    for (const m of letters) letterMarkers.add(m[1]!.toLowerCase())
    const nums = p.text.matchAll(/(?:^|\n|\s)(\d+)[\).]/gm)
    for (const m of nums) {
      const n = Number(m[1])
      if (n >= 1 && n <= 9) numberMarkers.add(n)
    }
  }

  if (claimed >= 2) {
    const letterCount = letterMarkers.size
    const numberCount = numberMarkers.size
    const observed = Math.max(letterCount, numberCount)
    // Also count "pierwsza/druga/trzecia rata"
    const ordinalHits = [
      /pierwsz[aey].{0,20}rat/i.test(hay),
      /drug[aie].{0,20}rat/i.test(hay),
      /trzeci[aie].{0,20}rat/i.test(hay),
      /czwart[aie].{0,20}rat/i.test(hay),
    ].filter(Boolean).length
    const best = Math.max(observed, ordinalHits)
    if (best > 0 && best < claimed) {
      const para = paymentParas[0]
      checks.push({
        id: `payment-numbering-${claimed}-${best}`,
        code: 'payment_numbering_inconsistent',
        status: 'warning',
        title: 'Niespójna numeracja płatności',
        message: `The template claims ${claimed} installment(s) but only ${best} payment item(s) are clearly listed.`,
        recommendation:
          'Align the installment count with the listed payment items (a/b/c or 1/2/3).',
        paragraphIndex: para?.index ?? null,
        evidence: claimedMatch?.[0] ?? null,
      })
    }
  }

  // Orphan: "pierwsza rata" without "druga"
  if (/pierwsz[aey].{0,20}rat/i.test(hay) && !/drug[aie].{0,20}rat/i.test(hay)) {
    if (claimed >= 2 || /ratach|trzy\s+rat/i.test(hay)) {
      checks.push({
        id: 'payment-orphan-first',
        code: 'payment_numbering_inconsistent',
        status: 'warning',
        title: 'Niespójna numeracja płatności',
        message:
          'The template mentions the first installment without a matching second installment.',
        recommendation: 'Complete or remove the installment list so numbering is consistent.',
        paragraphIndex:
          input.paragraphs.find((p) => /pierwsz[aey].{0,20}rat/i.test(p.text))
            ?.index ?? null,
        evidence: null,
      })
    }
  }

  // Letter list starting at b) without a)
  if (letterMarkers.has('b') && !letterMarkers.has('a') && claimed >= 2) {
    checks.push({
      id: 'payment-orphan-letter-b',
      code: 'payment_numbering_inconsistent',
      status: 'warning',
      title: 'Niespójna numeracja płatności',
      message:
        'Payment list markers appear incomplete (e.g. b)/c) without a)).',
      recommendation: 'Restore missing list items or renumber the payment schedule.',
      paragraphIndex:
        paymentParas.find((p) => /\bb\)/i.test(p.text))?.index ?? null,
      evidence: null,
    })
  }

  return dedupeChecks(checks)
}

function dedupeChecks(
  checks: PackageContractHealthCheck[],
): PackageContractHealthCheck[] {
  const seen = new Set<string>()
  const out: PackageContractHealthCheck[] = []
  for (const c of checks) {
    const key = `${c.code}:${c.paragraphIndex ?? ''}:${c.message ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

function bindingsValidCheck(input: {
  hasPhysicalBindings: boolean
}): PackageContractHealthCheck {
  if (input.hasPhysicalBindings) {
    return {
      id: 'bindings_valid',
      code: 'bindings_valid',
      status: 'ok',
      title: 'Powiązania poprawne',
    }
  }

  return {
    id: 'bindings_valid',
    code: 'bindings_valid',
    status: 'critical',
    title: 'Brak pól do uzupełnienia',
    message:
      'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.',
    recommendation:
      'Upewnij się, że umowa zawiera dane strony zamawiającej, daty oraz wartość — w formie możliwej do odczytania z dokumentu.',
    evidence: 'diagnostic:no_physical_allowlisted_bindings',
  }
}

function requiredDataReadyCheck(input: {
  requiredData: {
    ready: boolean
    missingCategories: readonly string[]
    missingRegistryKeys: readonly string[]
    blockingIssues: readonly { code: string; evidence: string; message: string }[]
    evidence: readonly string[]
  }
}): PackageContractHealthCheck {
  const { requiredData } = input
  if (requiredData.ready) {
    return {
      id: 'required_data_ready',
      code: 'required_data_ready',
      status: 'ok',
      title: 'Wymagane dane kompletne',
    }
  }

  const evidence =
    requiredData.evidence[0] ??
    (requiredData.blockingIssues[0]?.evidence ||
      (requiredData.missingCategories.length > 0
        ? 'diagnostic:required_categories_incomplete'
        : 'diagnostic:required_data_unspecified'))

  // Never emit required_categories_incomplete without categories.
  const safeEvidence =
    evidence === 'diagnostic:required_categories_incomplete' &&
    requiredData.missingCategories.length === 0
      ? (requiredData.blockingIssues[0]?.evidence ??
        'diagnostic:required_data_unspecified')
      : evidence

  return {
    id: 'required_data_ready',
    code: 'required_data_ready',
    status: 'critical',
    title: 'Brakuje wymaganych danych',
    message:
      requiredData.blockingIssues[0]?.message ??
      'Rozpoznaliśmy część dokumentu, ale brakuje informacji potrzebnych do automatycznego generowania.',
    recommendation:
      requiredData.blockingIssues[0]?.message ??
      'Sprawdź, czy w dokumencie są: dane strony zamawiającej, data zawarcia umowy, data ślubu oraz wartość umowy.',
    evidence: safeEvidence,
  }
}

function baseOkChecks(): PackageContractHealthCheck[] {
  return [
    {
      id: 'package_mode',
      code: 'package_mode',
      status: 'ok',
      title: 'Tryb pakietu',
    },
    {
      id: 'quality_safe',
      code: 'quality_safe',
      status: 'ok',
      title: 'Bezpieczeństwo dokumentu',
    },
    {
      id: 'immutable_preserved',
      code: 'immutable_preserved',
      status: 'ok',
      title: 'Klauzule stałe zachowane',
    },
  ]
}

/**
 * Build the full package-contract health report for an uploaded template.
 */
export function buildPackageContractHealthReport(input: {
  paragraphs: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  /**
   * Canonical required-data readiness. Prefer this over bare readinessReady.
   */
  requiredData?: {
    ready: boolean
    missingCategories: readonly string[]
    missingRegistryKeys: readonly string[]
    blockingIssues: readonly {
      code: string
      evidence: string
      message: string
    }[]
    evidence: readonly string[]
  }
  /** @deprecated Pass `requiredData` instead. Kept for older call sites/tests. */
  readinessReady?: boolean
}): PackageContractHealthReport {
  const physicalBound = input.slots.filter(
    (s) => s.registryKey && isSlotPhysicallyBound(s),
  )
  const hasBindings = physicalBound.length > 0

  const requiredForCheck =
    input.requiredData ??
    (input.readinessReady === true
      ? {
          ready: true as const,
          missingCategories: [] as string[],
          missingRegistryKeys: [] as string[],
          blockingIssues: [] as Array<{
            code: string
            evidence: string
            message: string
          }>,
          evidence: [] as string[],
        }
      : {
          ready: false as const,
          missingCategories: [] as string[],
          missingRegistryKeys: [] as string[],
          blockingIssues: [
            {
              code: 'legacy_readiness_boolean',
              evidence: 'diagnostic:legacy_readiness_incomplete',
              message:
                'Rozpoznaliśmy część dokumentu, ale brakuje informacji potrzebnych do automatycznego generowania.',
            },
          ],
          evidence: ['diagnostic:legacy_readiness_incomplete'],
        })

  const checks: PackageContractHealthCheck[] = [
    bindingsValidCheck({ hasPhysicalBindings: hasBindings }),
    requiredDataReadyCheck({ requiredData: requiredForCheck }),
    ...baseOkChecks(),
    ...detectDerivedFinancialClauses(input),
    ...detectMultiLocationSlot(input),
    ...detectPaymentNumberingIssues(input),
  ]

  const warningCount = checks.filter((c) => c.status === 'warning').length
  const criticalCount = checks.filter((c) => c.status === 'critical').length

  const report: PackageContractHealthReport = {
    generatedAt: new Date().toISOString(),
    checks,
    warningCount,
    criticalCount,
    generationAllowed: criticalCount === 0,
  }

  assertPackageContractHealthConsistency(report, {
    missingCategories: requiredForCheck.missingCategories,
    missingRegistryKeys: requiredForCheck.missingRegistryKeys,
    blockingIssues: requiredForCheck.blockingIssues,
  })

  devInfoArgs('[package-contract-health-report]', {
    warningCount,
    criticalCount,
    hasPhysicalBindings: hasBindings,
    physicalBindingCount: physicalBound.length,
    physicalBindingKeys: physicalBound.map((s) => s.registryKey),
    requiredDataReady: requiredForCheck.ready,
    missingCategories: requiredForCheck.missingCategories,
    missingRegistryKeys: requiredForCheck.missingRegistryKeys,
    blockingIssues: requiredForCheck.blockingIssues.map((b) => b.code),
    codes: checks.map((c) => `${c.status}:${c.code}`),
    bindingsEvidence: checks.find((c) => c.code === 'bindings_valid')?.evidence,
    requiredDataEvidence: checks.find((c) => c.code === 'required_data_ready')
      ?.evidence,
  })

  return report
}

/**
 * Enforce health-report invariants. Throws in DEV/tests; logs in production.
 */
export function assertPackageContractHealthConsistency(
  report: PackageContractHealthReport,
  gaps?: {
    missingCategories?: readonly string[]
    missingRegistryKeys?: readonly string[]
    blockingIssues?: readonly { code: string }[]
  },
): void {
  const required = report.checks.find((c) => c.code === 'required_data_ready')
  const missingCats = gaps?.missingCategories?.length ?? 0
  const missingKeys = gaps?.missingRegistryKeys?.length ?? 0
  const blockers = gaps?.blockingIssues?.length ?? 0
  const gapCount = missingCats + missingKeys + blockers

  const fail = (message: string) => {
    devErrorArgs('[package-contract-health-consistency]', {
      message,
      requiredStatus: required?.status,
      requiredEvidence: required?.evidence,
      gaps,
      codes: report.checks.map((c) => `${c.status}:${c.code}`),
    })
    const strict =
      import.meta.env?.DEV ||
      import.meta.env?.MODE === 'test' ||
      process.env.NODE_ENV !== 'production'
    if (strict) {
      throw new Error(`package-contract health inconsistency: ${message}`)
    }
  }

  if (required?.status === 'critical' && gaps && gapCount === 0) {
    fail('required_data_ready critical with no reported gaps')
  }
  if (
    required?.evidence === 'diagnostic:required_categories_incomplete' &&
    gaps &&
    missingCats === 0
  ) {
    fail('required_categories_incomplete without missingCategories')
  }
  if (
    report.generationAllowed &&
    report.checks.some((c) => c.status === 'critical')
  ) {
    fail('generationAllowed with critical checks')
  }
}

/** Polish UI labels for health check status marks. */
export function packageContractHealthMark(
  status: PackageContractHealthStatus,
): string {
  if (status === 'ok') return '✔'
  if (status === 'warning') return '⚠'
  return '✖'
}
