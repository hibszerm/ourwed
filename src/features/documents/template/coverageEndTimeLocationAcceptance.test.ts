/**
 * Focused regression: coverage_end_time physical span must be source "00.30".
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/coverageEndTimeLocationAcceptance.test.ts
 */

import { detectContractCandidates } from './candidateDetection'
import { bindSlotsToDocument } from './slotBinder'
import {
  applySlotToParagraphText,
  locateSlotInParagraph,
} from './slotRenderer'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
} from './canonicalParagraph'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import type { TemplateSlot } from './types'

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

const REAL_P11 =
  'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie przyjęcia weselnego reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin. Każda dodatkowa godzina to koszt w wysokości 800zł.'

run('1. Same-run time binds originalText "00.30"', () => {
  const text = 'reportaż do godziny 00.30.'
  const cands = detectContractCandidates([{ index: 0, text }])
  const cov = cands.find((c) => c.proposedKey === 'coverage_end_time')
  assert(Boolean(cov), 'candidate missing')
  assertEq(cov!.text, '00.30', 'candidate text is source form')
  assertEq(text.slice(cov!.startOffset, cov!.endOffset), '00.30', 'offsets')

  const { slots } = bindSlotsToDocument({
    registryKeys: ['coverage_end_time'],
    paragraphs: [{ index: 0, text }],
  })
  const slot = slots.find((s) => s.registryKey === 'coverage_end_time')
  assert(Boolean(slot?.physicallyBound), 'bound')
  assertEq(slot!.originalText, '00.30', 'binder originalText')
  assertEq(
    text.slice(slot!.startOffset!, slot!.endOffset!),
    '00.30',
    'binder offsets',
  )
})

run('2. Multi-run time still binds and replaces only "00.30"', () => {
  // Simulate DOCX runs: "reportaż do godziny " | "00" | "." | "30" | "."
  const xml = `<w:p>${[
    'reportaż do godziny ',
    '00',
    '.',
    '30',
    '.',
  ]
    .map((t) => `<w:r><w:t>${t}</w:t></w:r>`)
    .join('')}</w:p>`
  const model = buildParagraphRunModel(xml)
  assertEq(model.canonicalText, 'reportaż do godziny 00.30.', 'canonical')
  assert(model.runs.length >= 4, 'multi-run')

  const text = model.canonicalText
  const { slots } = bindSlotsToDocument({
    registryKeys: ['coverage_end_time'],
    paragraphs: [{ index: 0, text }],
  })
  const slot = slots.find((s) => s.registryKey === 'coverage_end_time')!
  assertEq(slot.originalText, '00.30', 'multi-run originalText')

  const applied = applySlotToParagraphText(text, slot, '00:30')
  assert(applied.ok, applied.reason ?? 'apply failed')
  assertEq(applied.text, 'reportaż do godziny 00:30.', 'replaced')
  assert(applied.text.includes('00:30'), 'has resolved')
  assert(!applied.text.includes('00.30'), 'source gone')
})

run('3. Semantic variant source 00.30 → resolved 00:30', () => {
  const text = 'reportaż do godziny 00.30.'
  const { slots } = bindSlotsToDocument({
    registryKeys: ['coverage_end_time'],
    paragraphs: [{ index: 0, text }],
  })
  const slot = slots.find((s) => s.registryKey === 'coverage_end_time')!
  const applied = applySlotToParagraphText(text, slot, '00:30')
  assert(applied.ok, applied.reason ?? 'fail')
  assertEq(applied.text, 'reportaż do godziny 00:30.', 'fragment')
})

run('4. Real paragraph 11 — replace time only; keep 12 godzin and 800zł', () => {
  const text = REAL_P11
  const { slots } = bindSlotsToDocument({
    registryKeys: [
      'reception_location',
      'coverage_end_time',
      'overtime_rate',
    ],
    paragraphs: [{ index: 11, text }],
  })
  const cov = slots.find((s) => s.registryKey === 'coverage_end_time')!
  assertEq(cov.originalText, '00.30', 'p11 originalText')
  assertEq(
    text.slice(cov.startOffset!, cov.endOffset!),
    '00.30',
    'p11 offsets',
  )

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 11, text }],
    slots: [cov],
    resolved: { coverage_end_time: '00:30' },
  })
  assert(applied.failures.length === 0, applied.failures[0]?.reason ?? 'fail')
  const out = applied.paragraphs[0]!.text
  assert(out.includes('do godziny 00:30.'), 'resolved time')
  assert(out.includes('12 godzin'), 'hours untouched')
  assert(out.includes('800zł'), 'overtime untouched')
  assert(out.includes('Rezydencji Lubomirskich'), 'venue untouched')
})

run('5. Reanalysis persists raw source offsets, not normalized-time', () => {
  const text = REAL_P11
  const cands = detectContractCandidates([{ index: 11, text }])
  const cov = cands.find((c) => c.proposedKey === 'coverage_end_time')!
  assertEq(cov.text, '00.30', 'detection keeps source punctuation')
  assertEq(text.slice(cov.startOffset, cov.endOffset), '00.30', 'raw offsets')
  assert(cov.text !== '00:30', 'must not persist colon form')
})

run('6. Legacy bad slot originalText "00:30" still locates source "00.30"', () => {
  const text = canonicalizeParagraphText(REAL_P11)
  const bad: TemplateSlot = {
    id: 'legacy',
    registryKey: 'coverage_end_time',
    label: 'coverage end time',
    sourceHint: 'package',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: 11,
    originalText: '00:30',
    startOffset: 171,
    endOffset: 176,
    leftAnchor: 'maksymalnie do godziny',
    rightAnchor: '. Czas',
    prefix: '',
    suffix: '',
  }
  const loc = locateSlotInParagraph(text, bad)
  assert(Boolean(loc), 'must locate via clock-time equivalence')
  assertEq(text.slice(loc!.start, loc!.end), '00.30', 'maps to source')

  const applied = applySlotToParagraphText(text, bad, '00:30')
  assert(applied.ok, applied.reason ?? 'fail')
  assert(applied.text.includes('do godziny 00:30.'), 'apply ok')
})

run('7. Validator masks only the time span', () => {
  const text = REAL_P11
  const { slots } = bindSlotsToDocument({
    registryKeys: ['coverage_end_time'],
    paragraphs: [{ index: 11, text }],
  })
  const slot = slots.find((s) => s.registryKey === 'coverage_end_time')!
  const resolved = { coverage_end_time: '00:30' }
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 11, text }],
    slots: [slot],
    resolved,
  })
  const quality = verifyContractTransformation({
    original: [{ index: 11, text }],
    transformed: applied.paragraphs,
    resolvedByKey: resolved,
    slots: [slot],
  })
  assert(quality.ok, quality.report ?? 'quality fail')
  // Whole-paragraph rewrite would wipe "12 godzin" / "800zł" differences incorrectly
  assert(applied.paragraphs[0]!.text.includes('12 godzin'), 'hours remain')
  assert(applied.paragraphs[0]!.text.includes('800zł'), 'money remain')
})

if (!process.exitCode) {
  console.log('\nAll coverage_end_time location tests passed.')
}
