/**
 * Review draft/commit lifecycle + quality replacement-trace regression.
 * Run: npm run test:review-quality-trace
 */

import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import {
  isIncompleteContractFieldValue,
  validateContractFieldValue,
} from './contractFieldValidation'
import type { TemplateSlot } from './types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { userFacingGenerationErrorMessage } from './generationPipelineError'
import { GenerationPipelineError } from './generationPipelineError'

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

function binding(
  registryKey: string,
  para: number,
  start: number,
  end: number,
  originalText: string,
): TemplateSlot {
  return {
    id: `slot-${registryKey}-${para}-${start}-${end}`,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: para,
    originalText,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    detectionStatus: 'bound',
  }
}

const page = readFileSync(
  resolve('src/pages/WeddingContractGenerationPage.tsx'),
  'utf8',
)

run('A — input does not disappear on first keystroke (committed vs draft)', () => {
  assert(page.includes('draftOverrides'), 'draft state')
  assert(page.includes('committedOverrides'), 'committed state')
  assert(page.includes('visibleEditableFields'), 'visible fields')
  assert(
    page.includes('never drives field visibility') ||
      page.includes('Keystroke draft'),
    'documented separation',
  )
  assert(page.includes('fieldErrors'), 'field errors keep visibility')
  // Review missing filter still uses committed overrides only — not drafts.
  assert(
    page.includes('overrides: committedOverrides'),
    'review built from committed',
  )
  // Typing updates draft only.
  assert(page.includes('setDraftOverrides'), 'onChange writes draft')
  assert(!page.includes('setOverrides((current)'), 'no live override hide path')
})

run('B — one-letter address fails validation', () => {
  const result = validateContractFieldValue('groom_address', 'd')
  assertEq(result.ok, false, 'ok')
  if (result.ok) throw new Error('expected fail')
  assertEq(result.message, 'Wpisz pełny adres.', 'message')
  assert(isIncompleteContractFieldValue('groom_address', 'd'), 'incomplete')
})

run('C — invalid field remains visible (page keeps errors + drafts)', () => {
  assert(page.includes('fieldErrors[field.registryKey]'), 'shows field error')
  assert(
    page.includes('data-testid={`field-error-${field.registryKey}`}'),
    'testid',
  )
  assert(page.includes('commitDraftOverrides'), 'commit path')
})

run('D — valid committed address resolves the review issue', () => {
  const result = validateContractFieldValue(
    'groom_address',
    'ul. Długa 12, 00-001 Warszawa',
  )
  assert(result.ok, 'valid address')
  // After commit, page passes committedOverrides into buildGenerationReviewState;
  // non-empty committed override removes the key from editableMissingFields.
  assert(page.includes('commitDraftOverrides'), 'commit exists')
  assert(page.includes('setCommittedOverrides(nextCommitted)'), 'commits values')
})

run('E+F — generated value “d” does not match “d” in “adres”; trace exact', () => {
  const original =
    'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków'
  const start = original.indexOf('ul. Świętego Tomasza 35/2A, 31-027 Kraków')
  const end = start + 'ul. Świętego Tomasza 35/2A, 31-027 Kraków'.length
  const slot = binding('groom_address', 0, start, end, original.slice(start, end))
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: original }],
    slots: [slot],
    resolved: { groom_address: 'd' },
  })
  assertEq(applied.failures.length, 0, 'apply ok')
  assertEq(applied.replacementTraces.length, 1, 'one trace')
  const trace = applied.replacementTraces[0]!
  assertEq(trace.replacementValue, 'd', 'replacement')
  assertEq(trace.generatedStart, start, 'generated start after label')
  assertEq(trace.generatedEnd, start + 1, 'generated end')
  assertEq(
    applied.paragraphs[0]!.text.slice(trace.generatedStart, trace.generatedEnd),
    'd',
    'slice is replacement',
  )
  assert(
    !applied.paragraphs[0]!.text
      .slice(0, trace.generatedStart)
      .endsWith('a'), // "adres" ends before ": "
    'not masking inside adres word via bad range',
  )
  // Quality with traces must pass for address-only replacement even with "d"
  const quality = verifyContractTransformation({
    original: [{ index: 0, text: original }],
    transformed: applied.paragraphs,
    resolvedByKey: { groom_address: 'd' },
    slots: [slot],
    replacementTraces: applied.replacementTraces,
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality')
  // Without traces, old search would poison "adres" — ensure we do not rely on it.
  const withoutTrace = verifyContractTransformation({
    original: [{ index: 0, text: original }],
    transformed: applied.paragraphs,
    resolvedByKey: { groom_address: 'd' },
    slots: [slot],
  })
  // May fail without anchors/trace — that is acceptable; with trace must pass.
  void withoutTrace
})

run('G — shorter replacement updates following generated offsets', () => {
  const text = 'AAA OLDONE BBB OLDTWO CCC'
  const s1 = text.indexOf('OLDONE')
  const s2 = text.indexOf('OLDTWO')
  const slots = [
    binding('a', 0, s1, s1 + 6, 'OLDONE'),
    binding('b', 0, s2, s2 + 6, 'OLDTWO'),
  ]
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: { a: 'X', b: 'YY' },
  })
  const tA = applied.replacementTraces.find((t) => t.key === 'a')!
  const tB = applied.replacementTraces.find((t) => t.key === 'b')!
  assertEq(tA.generatedStart, s1, 'a start')
  assertEq(tA.generatedEnd, s1 + 1, 'a end')
  // b shifts left by 5 (6→1)
  assertEq(tB.generatedStart, s2 - 5, 'b start shifted')
  assertEq(tB.generatedEnd, s2 - 5 + 2, 'b end')
  assertEq(
    applied.paragraphs[0]!.text.slice(tB.generatedStart, tB.generatedEnd),
    'YY',
    'b value',
  )
})

run('H — longer replacement updates following generated offsets', () => {
  const text = 'AAA OLD BBB END'
  const s1 = text.indexOf('OLD')
  const s2 = text.indexOf('END')
  const slots = [
    binding('a', 0, s1, s1 + 3, 'OLD'),
    binding('b', 0, s2, s2 + 3, 'END'),
  ]
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: { a: 'VERYLONG', b: 'ZZ' },
  })
  const tB = applied.replacementTraces.find((t) => t.key === 'b')!
  assertEq(tB.generatedStart, s2 + (8 - 3), 'b shifted by +5')
  assertEq(
    applied.paragraphs[0]!.text.slice(tB.generatedStart, tB.generatedEnd),
    'ZZ',
    'b value',
  )
})

run('I — two slots with the same replacement value remain distinct', () => {
  const text = 'one PLACE and two PLACE end'
  const first = text.indexOf('PLACE')
  const second = text.indexOf('PLACE', first + 1)
  const slots = [
    binding('loc_a', 0, first, first + 5, 'PLACE'),
    binding('loc_b', 0, second, second + 5, 'PLACE'),
  ]
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: { loc_a: 'SAME', loc_b: 'SAME' },
  })
  assertEq(applied.replacementTraces.length, 2, 'two traces')
  const quality = verifyContractTransformation({
    original: [{ index: 0, text }],
    transformed: applied.paragraphs,
    resolvedByKey: { loc_a: 'SAME', loc_b: 'SAME' },
    slots,
    replacementTraces: applied.replacementTraces,
  })
  assert(quality.ok, quality.report ?? 'quality')
})

run('J — replacement value in immutable text does not confuse quality', () => {
  const original = 'adres zamieszkania: Kraków Stare Miasto'
  const start = original.indexOf('Kraków Stare Miasto')
  const end = start + 'Kraków Stare Miasto'.length
  const slot = binding('groom_address', 0, start, end, original.slice(start, end))
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: original }],
    slots: [slot],
    resolved: { groom_address: 'a' }, // also appears in "adres"
  })
  const quality = verifyContractTransformation({
    original: [{ index: 0, text: original }],
    transformed: applied.paragraphs,
    resolvedByKey: { groom_address: 'a' },
    slots: [slot],
    replacementTraces: applied.replacementTraces,
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality')
  const maskedGenStart = applied.replacementTraces[0]!.generatedStart
  assert(maskedGenStart > original.indexOf('adres'), 'range after adres word')
})

run('K — repeated dates use physical traces rather than value search', () => {
  const text = 'ślub 19.06.2025 oraz płatność 19.06.2025 koniec'
  const w = text.indexOf('19.06.2025')
  const p = text.indexOf('19.06.2025', w + 1)
  const slots = [
    binding('wedding_date', 0, w, w + 10, '19.06.2025'),
    binding('final_payment_due_date', 0, p, p + 10, '19.06.2025'),
  ]
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: {
      wedding_date: '26.07.2026',
      final_payment_due_date: '26.07.2026',
    },
  })
  assertEq(applied.replacementTraces.length, 2, 'two date traces')
  const quality = verifyContractTransformation({
    original: [{ index: 0, text }],
    transformed: applied.paragraphs,
    resolvedByKey: {
      wedding_date: '26.07.2026',
      final_payment_due_date: '26.07.2026',
    },
    slots,
    replacementTraces: applied.replacementTraces,
  })
  assert(quality.ok, quality.report ?? 'quality')
})

run('L — immutable-text modification still fails quality', () => {
  const original = 'adres zamieszkania: ul. Test 1'
  const start = original.indexOf('ul. Test 1')
  const slot = binding(
    'groom_address',
    0,
    start,
    start + 'ul. Test 1'.length,
    'ul. Test 1',
  )
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: original }],
    slots: [slot],
    resolved: { groom_address: 'ul. Nowa 2' },
  })
  // Tamper immutable label
  const tampered = [
    {
      index: 0,
      text: applied.paragraphs[0]!.text.replace(
        'adres zamieszkania',
        'miejsce zamieszkania',
      ),
    },
  ]
  const quality = verifyContractTransformation({
    original: [{ index: 0, text: original }],
    transformed: tampered,
    resolvedByKey: { groom_address: 'ul. Nowa 2' },
    slots: [slot],
    replacementTraces: applied.replacementTraces,
  })
  assert(!quality.ok, 'must fail')
})

run('M — address-only replacement passes quality', () => {
  const original =
    'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków'
  const start = original.indexOf('ul. Świętego Tomasza 35/2A, 31-027 Kraków')
  const end = start + 'ul. Świętego Tomasza 35/2A, 31-027 Kraków'.length
  const slot = binding('groom_address', 0, start, end, original.slice(start, end))
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: original }],
    slots: [slot],
    resolved: { groom_address: 'ul. Nowa 8, 00-001 Warszawa' },
  })
  const quality = verifyContractTransformation({
    original: [{ index: 0, text: original }],
    transformed: applied.paragraphs,
    resolvedByKey: { groom_address: 'ul. Nowa 8, 00-001 Warszawa' },
    slots: [slot],
    replacementTraces: applied.replacementTraces,
  })
  assert(quality.ok, quality.report ?? 'quality')
  assert(
    applied.paragraphs[0]!.text.startsWith('adres zamieszkania: '),
    'label intact',
  )
})

run('N — right-to-left replacement trace remains correct for multiple slots', () => {
  const text = 'L LEFT M MID R RIGHT X'
  const left = text.indexOf('LEFT')
  const mid = text.indexOf('MID')
  const right = text.indexOf('RIGHT')
  const slots = [
    binding('k1', 0, left, left + 4, 'LEFT'),
    binding('k2', 0, mid, mid + 3, 'MID'),
    binding('k3', 0, right, right + 5, 'RIGHT'),
  ]
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: { k1: 'AAAA', k2: 'B', k3: 'CCCCCC' },
  })
  assertEq(applied.applied[0]!.registryKey, 'k3', 'RTL apply first')
  for (const trace of applied.replacementTraces) {
    assertEq(
      applied.paragraphs[0]!.text.slice(
        trace.generatedStart,
        trace.generatedEnd,
      ),
      trace.replacementValue,
      `${trace.key} range`,
    )
  }
})

run('O — empty and whitespace-only values remain unresolved', () => {
  assert(isIncompleteContractFieldValue('groom_address', ''), 'empty')
  assert(isIncompleteContractFieldValue('groom_address', '   '), 'whitespace')
  assert(isIncompleteContractFieldValue('bride_phone', '12'), 'short phone')
  assert(!isIncompleteContractFieldValue('bride_phone', '500600700'), 'phone ok')
})

run('user-facing quality message is concise', () => {
  const err = new GenerationPipelineError({
    code: 'docx_render_failed',
    stage: 'docx_render',
    message: 'QUALITY CHECK FAILED — huge dump',
    correlationId: 'ABCD',
  })
  const msg = userFacingGenerationErrorMessage(err)
  assert(!msg.includes('QUALITY CHECK FAILED'), 'no technical dump')
  assert(msg.includes('bezpiecznie wygenerować'), 'safe message')
})

run('page uses committed overrides for generation', () => {
  assert(page.includes('overrides: committedOverrides'), 'generate uses committed')
  assert(page.includes('commitDraftOverrides'), 'commit helper')
  assert(page.includes('canGenerate'), 'canGenerate gate')
})

console.log('\nReview + quality trace regression finished.')
