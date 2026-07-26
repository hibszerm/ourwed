/**
 * Paragraph 36 — coverage_hours + overtime PLN formatting regression.
 * Fixture: „nie przekracza 11 godzin (od 12:00 - 23:00)… kwota 1000 zł.”
 *
 * Run: npm run test:coverage-hours-para36
 */

import { detectContractCandidates, candidatesToTemplateSlots } from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { prepareSlotReplacementValue } from './slotReplacementValue'
import { verifyContractTransformation } from './contractQualityCheck'
import { bindCoverageHoursNumericSpan } from './slotBinder'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import type { TemplateSlot } from './types'

const PARA_36 =
  'Wykonawca zastrzega że, czas jego pracy w dniu ślubu nie przekracza 11 godzin (od 12:00 - 23:00). Dłuższy czas pracy jest płatny dodatkowo. Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1000 zł.'

const EXPECTED =
  'Wykonawca zastrzega że, czas jego pracy w dniu ślubu nie przekracza 12 godzin (od 12:00 - 00:30). Dłuższy czas pracy jest płatny dodatkowo. Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1 400 zł.'

const emptyAi = {
  documentType: 'contract',
  language: 'pl',
  fields: [],
  packageVariables: [],
  weddingVariables: [],
  companyVariables: [],
  coupleVariables: [],
} as unknown as AiDocumentAnalysisResult

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
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

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function slotOf(slots: TemplateSlot[], key: string): TemplateSlot {
  const s = slots.find((x) => x.registryKey === key && x.physicallyBound)
  assert(Boolean(s), `missing bound slot ${key}`)
  return s!
}

function buildPara36Slots(): TemplateSlot[] {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 36, text: PARA_36 }],
    plainText: PARA_36,
    sourceKind: 'docx',
  })
  return map.slots.filter((s) => s.paragraphIndex === 36 && s.physicallyBound)
}

const resolved = {
  coverage_hours: '12',
  coverage_start_time: '12:00',
  coverage_end_time: '00:30',
  overtime_rate: '1400',
  overtime_rate_formatted: '1 400 zł',
}

run('A — analysis creates coverage_hours for “11”', () => {
  const cands = detectContractCandidates([{ index: 36, text: PARA_36 }])
  const hours = cands.find(
    (c) =>
      c.proposedKey === 'coverage_hours' &&
      (c.decision === 'accepted' || c.decision === 'needs_confirmation'),
  )
  assert(Boolean(hours), 'candidate missing')
  assertEq(hours!.text, '11', 'span text')
  const slots = buildPara36Slots()
  assertEq(slotOf(slots, 'coverage_hours').originalText, '11', 'built slot')
})

run('B — coverage_hours owns only the numeric token', () => {
  const hit = bindCoverageHoursNumericSpan(PARA_36)
  assert(Boolean(hit), 'bind hit')
  assertEq(hit!.originalText, '11', 'numeric only')
  assert(!hit!.originalText.includes('godzin'), 'no godzin')
  assertEq(PARA_36.slice(hit!.start, hit!.end), '11', 'offsets')
  const slot = slotOf(buildPara36Slots(), 'coverage_hours')
  assertEq(slot.originalText, '11', 'slot text')
  assert(
    !(slot.originalText ?? '').includes('godzin'),
    'slot excludes godzin',
  )
})

run('C — all four slots are non-overlapping', () => {
  const slots = buildPara36Slots()
  const keys = [
    'coverage_hours',
    'coverage_start_time',
    'coverage_end_time',
    'overtime_rate',
  ] as const
  const owned = keys.map((k) => {
    const s = slotOf(slots, k)
    const start = s.startOffset ?? s.allowedRange!.start
    const end = s.endOffset ?? s.allowedRange!.end
    console.info('[para36-slot-diag]', {
      registryKey: s.registryKey,
      startOffset: start,
      endOffset: end,
      originalSpan: s.originalText,
      leftAnchor: s.leftAnchor,
      rightAnchor: s.rightAnchor,
    })
    return { key: k, start, end, text: s.originalText! }
  })
  assertEq(owned.find((o) => o.key === 'coverage_hours')!.text, '11', 'hours')
  assertEq(owned.find((o) => o.key === 'coverage_start_time')!.text, '12:00', 'start')
  assertEq(owned.find((o) => o.key === 'coverage_end_time')!.text, '23:00', 'end')
  assert(
    owned.find((o) => o.key === 'overtime_rate')!.text === '1000 zł' ||
      owned.find((o) => o.key === 'overtime_rate')!.text === '1000',
    'overtime span',
  )
  for (let i = 0; i < owned.length; i++) {
    for (let j = i + 1; j < owned.length; j++) {
      assert(
        !rangesOverlap(owned[i]!, owned[j]!),
        `overlap ${owned[i]!.key} vs ${owned[j]!.key}`,
      )
    }
  }
})

run('D–G — generated paragraph hours / times / money', () => {
  const slots = buildPara36Slots()
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 36, text: PARA_36 }],
    slots,
    resolved,
  })
  const out = applied.paragraphs[0]!.text
  assert(out.includes('12 godzin'), 'D — 12 godzin')
  assert(out.includes('od 12:00 - 00:30'), 'E — od 12:00 - 00:30')
  assert(out.includes('1 400 zł'), 'F — 1 400 zł')
  assert(!/\b1400\b/.test(out), 'G — no bare 1400')
  assert(!/1 400 zł zł/i.test(out), 'J — no duplicate currency')
  assertEq(out, EXPECTED, 'exact expected paragraph')
})

run('H — quality gate passes', () => {
  const slots = buildPara36Slots()
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 36, text: PARA_36 }],
    slots,
    resolved,
  })
  const quality = verifyContractTransformation({
    original: [{ index: 36, text: PARA_36 }],
    transformed: applied.paragraphs,
    allowedValues: Object.values(resolved),
    resolvedByKey: resolved,
    slots,
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality failed')
})

run('I — changing unrelated legal wording still fails quality gate', () => {
  const slots = buildPara36Slots()
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 36, text: PARA_36 }],
    slots,
    resolved,
  })
  const tampered = applied.paragraphs.map((p) => ({
    ...p,
    text: p.text.replace('Dłuższy czas pracy jest płatny dodatkowo', 'INNA TREŚĆ PRAWNA'),
  }))
  const quality = verifyContractTransformation({
    original: [{ index: 36, text: PARA_36 }],
    transformed: tampered,
    allowedValues: Object.values(resolved),
    resolvedByKey: resolved,
    slots,
  })
  assert(!quality.ok, 'must fail on immutable legal rewrite')
})

run('J — overtime formatting shapes A (1000 zł) and B (1000 + zł)', () => {
  const full = prepareSlotReplacementValue({
    registryKey: 'overtime_rate',
    value: '1400',
    originalText: '1000 zł',
    resolved: {
      overtime_rate: '1400',
      overtime_rate_formatted: '1 400 zł',
    },
  })
  assertEq(full, '1 400 zł', 'A — owns 1000 zł')

  const numeric = prepareSlotReplacementValue({
    registryKey: 'overtime_rate',
    value: '1400',
    originalText: '1000',
    resolved: {
      overtime_rate: '1400',
      overtime_rate_formatted: '1 400 zł',
    },
  })
  assertEq(numeric, '1 400', 'B — owns only 1000')

  // Shape B apply: immutable „ zł” suffix preserved, no double unit.
  const slots: TemplateSlot[] = [
    {
      id: 'ot-num',
      registryKey: 'overtime_rate',
      label: 'overtime',
      sourceHint: 'package',
      occurrences: 1,
      exampleText: '1000',
      enabled: true,
      placeholderInserted: false,
      physicallyBound: true,
      operation: 'replace',
      paragraphIndex: 0,
      originalText: '1000',
      startOffset: 7,
      endOffset: 11,
      allowedRange: { start: 7, end: 11 },
      leftAnchor: 'kwota ',
      rightAnchor: ' zł',
    },
  ]
  const src = 'kwota 1000 zł.'
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: src }],
    slots,
    resolved: {
      overtime_rate: '1400',
      overtime_rate_formatted: '1 400 zł',
    },
  })
  assertEq(applied.paragraphs[0]!.text, 'kwota 1 400 zł.', 'B apply preserves zł')
  assert(!/zł zł/i.test(applied.paragraphs[0]!.text), 'no double zł')
})

run('K — existing “do godziny 00:30” pattern still works', () => {
  const text =
    'reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin.'
  const cands = detectContractCandidates([{ index: 11, text }])
  const end = cands.find((c) => c.proposedKey === 'coverage_end_time')
  const hours = cands.find((c) => c.proposedKey === 'coverage_hours')
  assert(Boolean(end), 'end time')
  assertEq(end!.text.replace(':', '.'), '00.30', 'end span')
  assertEq(hours?.text, '12', 'hours')
})

run('L — coverage duration / end-time stay non-colliding', () => {
  const text =
    'reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin. Każda dodatkowa godzina to koszt w wysokości 800zł.'
  const slots = candidatesToTemplateSlots(
    detectContractCandidates([{ index: 11, text }]),
  ).filter((s) => s.physicallyBound)
  const hours = slots.find((s) => s.registryKey === 'coverage_hours')
  const end = slots.find((s) => s.registryKey === 'coverage_end_time')
  assert(Boolean(hours && end), 'both present')
  assertEq(hours!.originalText, '12', 'hours numeric')
  assert(
    hours!.originalText !== end!.originalText,
    'distinct spans',
  )
  const hs = hours!.startOffset!
  const he = hours!.endOffset!
  const es = end!.startOffset!
  const ee = end!.endOffset!
  assert(!rangesOverlap({ start: hs, end: he }, { start: es, end: ee }), 'no overlap')
})

if (!process.exitCode) {
  console.log('\nAll coverage-hours para36 tests passed.')
}
