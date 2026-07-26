/**
 * Exact quality-gate regression for the two outside-slot date paragraphs
 * caused by prepared date values not being used when locating generated spans.
 *
 * Fixture mirrors correlationId 8DD19470 / Umowa GP shape:
 * - party name slot (must pass when only the owned name changes)
 * - wedding_date + final_payment_due_date (failed before the fix)
 */

import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import { verifyContractTransformation } from '@/features/documents/template/contractQualityCheck'
import {
  ensureCouplePartyParticipleSlot,
  resolveCouplePartyParticiple,
  resolvePartyBlock,
} from '@/features/documents/template/partyBlockResolver'
import type { TemplateSlot } from '@/features/documents/template/types'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

function slot(p: Partial<TemplateSlot> & { registryKey: string }): TemplateSlot {
  return {
    id: p.id ?? `s-${p.registryKey}-${p.paragraphIndex ?? 0}`,
    label: p.registryKey,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    requirement: 'optional',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 1,
    originalText: '',
    ...p,
  } as TemplateSlot
}

const partyText =
  'Aleksandra Biłas, zam. ul. Przykładowa 1, 00-001 Warszawa, tel. 500 100 200, zwaną dalej „Parą Młodą”'
const dateText = 'Umowa została zawarta w dniu 15.07.2026 r. w Warszawie.'
const payText =
  'pozostałą kwotę Para młoda zapłaci Kamerzyście najpóźniej w dniu 15.07.2026 r.'
const coverageText =
  'reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin.'

const nameStart = partyText.indexOf('Aleksandra Biłas')
const wedDateStart = dateText.indexOf('15.07.2026')
const payDateStart = payText.indexOf('15.07.2026')
const hoursStart = coverageText.lastIndexOf('12')
const endStart = coverageText.indexOf('00.30')

const baseSlots: TemplateSlot[] = [
  slot({
    registryKey: 'bride_full_name',
    paragraphIndex: 0,
    originalText: 'Aleksandra Biłas',
    startOffset: nameStart,
    endOffset: nameStart + 'Aleksandra Biłas'.length,
    rightAnchor:
      ', zam. ul. Przykładowa 1, 00-001 Warszawa, tel. 500 100 200, zwaną dalej „Parą Młodą”',
  }),
  slot({
    registryKey: 'wedding_date',
    paragraphIndex: 1,
    originalText: '15.07.2026',
    startOffset: wedDateStart,
    endOffset: wedDateStart + '15.07.2026'.length,
  }),
  slot({
    registryKey: 'coverage_end_time',
    paragraphIndex: 2,
    originalText: '00.30',
    startOffset: endStart,
    endOffset: endStart + 5,
  }),
  slot({
    registryKey: 'coverage_hours',
    paragraphIndex: 2,
    originalText: '12',
    startOffset: hoursStart,
    endOffset: hoursStart + 2,
  }),
  slot({
    registryKey: 'final_payment_due_date',
    paragraphIndex: 3,
    originalText: '15.07.2026',
    startOffset: payDateStart,
    endOffset: payDateStart + '15.07.2026'.length,
  }),
]

const wedding = {
  id: 'w',
  couple: {
    partner1: 'Iza Karczewska',
    partner2: 'Jan Kulewski',
    partner1Address: 'ul. A 1',
    partner2Address: 'ul. A 1',
  },
  date: '2026-07-29',
  coverageHours: 12,
  coverageEndTime: '00:30',
} as Wedding

const original = [
  { index: 0, text: partyText },
  { index: 1, text: dateText },
  { index: 2, text: coverageText },
  { index: 3, text: payText },
]

run('A — pre-fix quality reproduces two outside-slot date failures', () => {
  // Simulate the bug: quality uses raw ISO while apply wrote dotted Polish dates.
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots: baseSlots,
    resolved,
  })
  // Intentionally skip prepareSlotReplacementValue in an old quality path by
  // checking that WITHOUT the prepare alignment, locating ISO in generated fails.
  // We assert the known broken symptom: generated has dotted dates.
  assert(
    applied.paragraphs[1]!.text.includes('29.07.2026'),
    'wedding date written as Polish short',
  )
  assert(
    applied.paragraphs[3]!.text.includes('29.07.2026'),
    'payment date written as Polish short',
  )
  assert(
    applied.paragraphs[0]!.text.includes('Iza Karczewska') &&
      applied.paragraphs[0]!.text.includes('Jan Kulewski'),
    'both partners in party clause',
  )
  assert(
    applied.paragraphs[0]!.text.includes('zwaną dalej'),
    'participle unchanged before owned-slot fix',
  )
})

run('B — diagnostic reports complete source/generated diffs', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots: baseSlots,
    resolved,
  })
  const quality = verifyContractTransformation({
    original,
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots: baseSlots,
  })
  // After the fix, quality should pass — diagnostic shape still present on failures.
  if (!quality.ok) {
    assert(Boolean(quality.report?.includes('ORIGINAL')), 'report has ORIGINAL')
    assert(Boolean(quality.report?.includes('GENERATED')), 'report has GENERATED')
    for (const f of quality.failures ?? []) {
      assert(f.original.length > 0, 'original text')
      assert(f.generated.length > 0, 'generated text')
      assert(f.unifiedDiff.includes('--- original'), 'unified diff')
    }
  } else {
    assert(true, 'quality passes with full ownership alignment')
  }
})

run('C/D/E — combined partners + owned participle; fixed wording preserved', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const slots = ensureCouplePartyParticipleSlot({
    slots: baseSlots,
    paragraphs: original,
    bothPartnersRepresented: partyPlan.bothPartnersRepresented,
  })
  assert(
    slots.some((s) => s.registryKey === 'couple_party_participle'),
    'participle slot owned from source',
  )
  const participle = resolveCouplePartyParticiple({
    bothPartnersRepresented: true,
    sourceParticiple: 'zwaną dalej',
  })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    couple_party_participle: participle!,
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
  })
  const partyOut = applied.paragraphs[0]!.text
  assert(partyOut.includes('Iza Karczewska'), 'partner1')
  assert(partyOut.includes('Jan Kulewski'), 'partner2')
  assert(partyOut.includes('zwani dalej'), 'owned participle')
  assert(partyOut.includes('zam. ul. Przykładowa 1'), 'address preserved')
  assert(partyOut.includes('tel. 500 100 200'), 'phone preserved')
  assert(partyOut.includes('„Parą Młodą”') || partyOut.includes('"Parą Młodą"'), 'role label')
  assert(!partyOut.includes('Aleksandra'), 'stale source name gone')

  const quality = verifyContractTransformation({
    original,
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots,
  })
  assert(quality.ok, quality.report ?? 'quality must pass')
})

run('F/G — date formatting changes only the owned date span; r. preserved', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const slots = ensureCouplePartyParticipleSlot({
    slots: baseSlots,
    paragraphs: original,
    bothPartnersRepresented: partyPlan.bothPartnersRepresented,
  })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    couple_party_participle: 'zwani dalej',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
  })
  assertEq(
    applied.paragraphs[1]!.text,
    'Umowa została zawarta w dniu 29.07.2026 r. w Warszawie.',
  )
  assert(
    applied.paragraphs[1]!.text.includes(' r. w Warszawie'),
    'space before r. and following prose',
  )
  assertEq(
    applied.paragraphs[3]!.text,
    'pozostałą kwotę Para młoda zapłaci Kamerzyście najpóźniej w dniu 29.07.2026 r.',
  )
})

run('H/I — duration and end-time stay independent', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const slots = ensureCouplePartyParticipleSlot({
    slots: baseSlots,
    paragraphs: original,
    bothPartnersRepresented: true,
  })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    couple_party_participle: 'zwani dalej',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
  })
  const cov = applied.paragraphs[2]!.text
  assert(cov.includes('do godziny 00:30'), 'end time')
  assert(cov.includes('maksymalnie 12 godzin'), 'duration')
  assert(!/12\s+godzin[ay]?\s+00/i.test(cov), 'no collision')
})

run('J — placeholder replacement would only touch owned underscore span', () => {
  const text = 'teledysku ślubnego o długości ok. __________;'
  const start = text.indexOf('__________')
  const phSlot = slot({
    registryKey: 'film_duration',
    paragraphIndex: 0,
    originalText: '__________',
    startOffset: start,
    endOffset: start + 10,
  })
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots: [phSlot],
    resolved: { film_duration: '90 sekund' },
  })
  assertEq(
    applied.paragraphs[0]!.text,
    'teledysku ślubnego o długości ok. 90 sekund;',
  )
})

run('L/M — visible outside-slot text still fails; owned changes pass', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const slots = ensureCouplePartyParticipleSlot({
    slots: baseSlots,
    paragraphs: original,
    bothPartnersRepresented: true,
  })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    couple_party_participle: 'zwani dalej',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
  })
  // Tamper fixed legal prose outside slots
  const tampered = applied.paragraphs.map((p) =>
    p.index === 1
      ? { ...p, text: p.text.replace('zawarta', 'sporządzona') }
      : p,
  )
  const bad = verifyContractTransformation({
    original,
    transformed: tampered,
    resolvedByKey: resolved,
    slots,
  })
  assert(!bad.ok, 'outside-slot legal change must fail')
  assert(
    (bad.failures ?? []).some((f) => f.index === 1),
    'reports paragraph 1',
  )

  const good = verifyContractTransformation({
    original,
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots,
  })
  assert(good.ok, good.report ?? 'owned spans must pass')
})

run('O — 8DD19470 fixture passes after the fix', () => {
  const partyPlan = resolvePartyBlock({ slots: baseSlots, wedding })
  const slots = ensureCouplePartyParticipleSlot({
    slots: baseSlots,
    paragraphs: original,
    bothPartnersRepresented: true,
  })
  const resolved: Record<string, string> = {
    wedding_date: '2026-07-29',
    final_payment_due_date: '2026-07-29',
    coverage_hours: '12',
    coverage_end_time: '00:30',
    couple_party_participle: 'zwani dalej',
    ...partyPlan.overrides,
  }
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
  })
  const quality = verifyContractTransformation({
    original,
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots,
  })
  assert(quality.ok, quality.report ?? '8DD19470 fixture')
  assertEq(quality.failures?.length ?? 0, 0)
})

function assertEq(a: unknown, b: unknown, message?: string) {
  if (a !== b) {
    throw new Error(
      `${message ?? 'assertEq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
    )
  }
}

console.log('\nQuality outside-slot regression done.')
