/**
 * Acceptance: readiness uses required detected slots — not the full registry.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/templateReadinessAcceptance.test.ts
 */

import {
  canonicalRegistryKey,
  dedupeSlotsByCanonicalKey,
  classifySlotDetection,
} from './slotClassification'
import {
  finalizeSlotMapClassification,
  stripNonDetectedSlots,
  validateTemplateSlotBindings,
} from './templateReadiness'
import type { TemplateSlot, TemplateSlotMap } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function slot(
  key: string,
  patch: Partial<TemplateSlot> = {},
): TemplateSlot {
  return {
    id: `slot-${key}`,
    registryKey: key,
    label: key,
    sourceHint: 'unknown',
    occurrences: 1,
    enabled: true,
    physicallyBound: false,
    ...patch,
  }
}

run('Test 1 — 8 bound of 60 registry: ready; required ≈ detected bound', () => {
  const keys = [
    'wedding_date',
    'company_name',
    'package_price',
    'deposit_amount',
    'ceremony_location',
    'reception_location',
    'company_nip',
    'company_bank_account',
  ]
  const slots = keys.map((k, i) =>
    slot(k, {
      physicallyBound: true,
      detectionStatus: 'bound',
      paragraphIndex: i,
      originalText: `value-${k}`,
      startOffset: 0,
      endOffset: 5,
      allowedRange: { start: 0, end: 5 },
    }),
  )
  // Noise: 52 unbound registry suggestions with no evidence
  for (let i = 0; i < 52; i++) {
    slots.push(slot(`noise_${i}`, { physicallyBound: false, exampleText: null }))
  }
  const map = stripNonDetectedSlots(
    finalizeSlotMapClassification({
      version: 1,
      slots,
      unmappedDynamics: [],
    }),
  )
  const report = validateTemplateSlotBindings(map)
  assert(report.ready, `expected ready: ${report.unresolvedKeys.join(',')}`)
  assert(
    report.counters.unresolvedRequiredSlotCount === 0,
    `unresolvedRequired=${report.counters.unresolvedRequiredSlotCount}`,
  )
  assert(
    report.counters.detectedSlotCount <= 8,
    `detected should be ≤8 after strip, got ${report.counters.detectedSlotCount}`,
  )
  assert(
    report.counters.requiredSlotCount <= 8,
    `requiredSlots=${report.counters.requiredSlotCount}`,
  )
})

run('Test 2 — SWIFT with no evidence is false_positive, does not block', () => {
  const slots = [
    slot('wedding_date', {
      physicallyBound: true,
      paragraphIndex: 0,
      originalText: '30.10.2024',
      startOffset: 0,
      endOffset: 10,
      allowedRange: { start: 0, end: 10 },
    }),
    slot('company_swift', { physicallyBound: false }),
  ]
  const classified = finalizeSlotMapClassification({
    version: 1,
    slots,
    unmappedDynamics: [],
  })
  const swift = classified.slots.find((s) => s.registryKey === 'company_swift')!
  assert(
    swift.detectionStatus === 'false_positive',
    `swift status=${swift.detectionStatus}`,
  )
  const stripped = stripNonDetectedSlots(classified)
  const report = validateTemplateSlotBindings(stripped)
  assert(report.ready, 'SWIFT must not block')
  assert(!report.unresolvedKeys.includes('company_swift'), 'swift not unresolved')
})

run('Test 3 — five aliases collapse to one logical slot', () => {
  const slots = dedupeSlotsByCanonicalKey([
    slot('bride_full_name'),
    slot('bride.name'),
    slot('bride_first_name'),
    slot('bride_last_name'),
    slot('value_16', { registryKey: 'bride_full_name' }),
  ])
  const active = slots.filter((s) => s.detectionStatus !== 'duplicate_alias')
  assert(active.length === 1, `expected 1 canonical, got ${active.length}`)
  assert(active[0]!.registryKey === 'bride_full_name', 'canonical bride_full_name')
})

run('Test 4 — optional unbound preparation_location does not block', () => {
  const map: TemplateSlotMap = {
    version: 1,
    slots: [
      slot('wedding_date', {
        physicallyBound: true,
        requirement: 'required',
        detectionStatus: 'bound',
        paragraphIndex: 0,
        originalText: '1.1.2026',
        startOffset: 0,
        endOffset: 8,
        allowedRange: { start: 0, end: 8 },
      }),
      slot('preparation_location', {
        physicallyBound: false,
        requirement: 'optional',
        detectionStatus: 'optional_unbound',
        leftAnchor: 'odbędą się w',
        rightAnchor: ';',
        originalText: '',
      }),
    ],
    unmappedDynamics: [],
  }
  const report = validateTemplateSlotBindings(
    finalizeSlotMapClassification(map, 'Przygotowań ślubnych, które odbędą się w ;'),
  )
  assert(report.ready, 'optional unbound must allow ready')
  assert(report.counters.unresolvedRequiredSlotCount === 0, 'no required unresolved')
})

run('Test 5 — required unbound wedding_date blocks with explicit key', () => {
  const map = finalizeSlotMapClassification(
    {
      version: 1,
      slots: [
        slot('wedding_date', {
          physicallyBound: false,
          leftAnchor: 'Data:',
          rightAnchor: '.',
          originalText: '________',
          paragraphIndex: 2,
        }),
        slot('ceremony_location', {
          physicallyBound: true,
          paragraphIndex: 3,
          originalText: 'Rzeszowie',
          startOffset: 0,
          endOffset: 9,
          allowedRange: { start: 0, end: 9 },
        }),
      ],
      unmappedDynamics: [],
    },
    'Data: ________. ceremonii w Rzeszowie',
  )
  const report = validateTemplateSlotBindings(map)
  assert(!report.ready, 'must be incomplete')
  assert(
    report.unresolvedKeys.includes('wedding_date'),
    `keys=${report.unresolvedKeys.join(',')}`,
  )
  const issue = report.issues.find((i) => i.registryKey === 'wedding_date')
  assert(Boolean(issue?.reason), 'must explain wedding_date')
})

run('Test 6 — not present removes from required calculations', () => {
  const map = finalizeSlotMapClassification({
    version: 1,
    slots: [
      slot('wedding_date', {
        physicallyBound: true,
        paragraphIndex: 0,
        originalText: '30.10.2024',
        startOffset: 0,
        endOffset: 10,
        allowedRange: { start: 0, end: 10 },
      }),
      slot('package_price', {
        physicallyBound: false,
        requirement: 'required',
        detectionStatus: 'required_unbound',
        originalText: '5000 zł',
        paragraphIndex: 4,
      }),
    ],
    unmappedDynamics: [],
  })
  assert(!validateTemplateSlotBindings(map).ready, 'price unbound blocks')

  const dismissed = {
    ...map,
    slots: map.slots.map((s) =>
      s.registryKey === 'package_price'
        ? {
            ...s,
            dismissedAsNotPresent: true,
            detectionStatus: 'not_present' as const,
            enabled: false,
          }
        : s,
    ),
  }
  const stripped = stripNonDetectedSlots(dismissed)
  const report = validateTemplateSlotBindings(stripped)
  assert(report.ready, 'after not-present must be ready')
  assert(
    !stripped.slots.some((s) => s.registryKey === 'package_price'),
    'package_price removed from map',
  )
})

run('Audit shape — classify mock of test nowy 38 entries', () => {
  const bound = [
    'ceremony_location',
    'reception_location',
    'coverage_end_time',
    'overtime_rate',
    'wedding_date',
    'company_nip',
    'company_regon',
    'company_bank_account',
  ]
  const unboundNoEvidence = [
    'bride_first_name',
    'bride_last_name',
    'bride_phone',
    'bride_address',
    'groom_first_name',
    'groom_last_name',
    'preparation_location',
    'package_name',
    'marketing_consent',
    'food_for_crew',
    'additional_notes',
    'ceremony_time',
    'wedding_schedule',
    'company_name',
    'company_address',
    'company_phone',
    'company_representative',
    'company_signature',
    'company_logo',
    'package_price',
    'deposit_amount',
    'payment_deadline',
    'remaining_payment',
    'delivery_time',
    'videographers_count',
    'film_duration',
    'film_delivery_method',
    'film_delivery_format',
    'travel_fee',
    'accommodation',
  ]
  const slots = [
    ...bound.map((k, i) =>
      slot(k, {
        physicallyBound: true,
        paragraphIndex: i,
        originalText: `x-${k}`,
        startOffset: 0,
        endOffset: 3,
        allowedRange: { start: 0, end: 3 },
      }),
    ),
    ...unboundNoEvidence.map((k) => slot(k)),
  ]
  assert(slots.length === 38, `expected 38 got ${slots.length}`)

  const rows = slots.map((s) => {
    const c = classifySlotDetection(s, { patternMatchedInText: false })
    return {
      key: canonicalRegistryKey(s.registryKey!),
      bound: Boolean(s.physicallyBound),
      required: c.requirement,
      status: c.detectionStatus,
      reason: c.detectionReason,
    }
  })

  const falsePos = rows.filter((r) => r.status === 'false_positive')
  const requiredUnbound = rows.filter((r) => r.status === 'required_unbound')
  const boundRows = rows.filter((r) => r.status === 'bound')

  assert(boundRows.length === 8, `bound=${boundRows.length}`)
  assert(
    falsePos.length === 30,
    `expected 30 false_positive, got ${falsePos.length}: ${falsePos.map((r) => r.key).join(',')}`,
  )
  assert(
    requiredUnbound.length === 0,
    `unexpected required_unbound: ${requiredUnbound.map((r) => r.key).join(',')}`,
  )

  const stripped = stripNonDetectedSlots(
    finalizeSlotMapClassification({
      version: 1,
      slots,
      unmappedDynamics: [],
    }),
  )
  const report = validateTemplateSlotBindings(stripped)
  assert(report.ready, 'test nowy shape should be ready after classification')
  assert(report.counters.unresolvedRequiredSlotCount === 0, 'no required unbound')
})

if (!process.exitCode) {
  console.log('\nAll template readiness acceptance tests passed.')
}
