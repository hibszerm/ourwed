/**
 * Focused regression: §2 financial amount pairs (numeric + słownie).
 * Run: npm run test:contract-money-pairs
 */

import { detectContractCandidates } from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import {
  assertSafeMoneyPairsForGeneration,
  classifyMoneyConcept,
  countStandalonePhrase,
  detectMoneyPairsInText,
  findSlownieWordsAfter,
  findStaleMoneySourcePhrases,
} from './contractMoneyPairs'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
} from './canonicalParagraph'
import { verifyContractTransformation } from './contractQualityCheck'
import { canonicalRegistryKey } from './slotClassification'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
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

const emptyAi: AiDocumentAnalysisResult = {
  schemaVersion: '1',
  model: 'test',
  promptVersion: 'test',
  analyzerId: 'test',
  analyzerVersion: '1',
  documentType: 'contract',
  overallConfidence: 1,
  fields: [],
  packageVariables: [],
  sections: [],
  clauses: [],
  warnings: [],
  analyzedAt: new Date().toISOString(),
  sourceTextLength: 0,
}

const P_CONTRACT =
  'Z tytułu wykonania Umowy Para młoda zobowiązuje się zapłacić Kamerzyście wynagrodzenie w łącznej wysokości 8 000 zł (słownie: osiem tysięcy złotych) brutto'

const P_DEPOSIT =
  'Para młoda w terminie 7 dni od daty zawarcia Umowy zobowiązana jest do wpłaty zadatku w wysokości 1000 zł (słownie: tysiąc złotych) brutto na rachunek bankowy Kamerzysty.'

const P_REMAINING =
  'Para młoda zobowiązuje się zapłacić pozostałą do zapłaty część wynagrodzenia, pomniejszoną o zadatek, tj. kwotę 7 000 zł (słownie: siedem tysięcy złotych) najpóźniej w dniu uroczystości.'

const RESOLVED = {
  contract_value_formatted: '9 500 zł',
  contract_value_words: 'dziewięć tysięcy pięćset złotych',
  agreed_deposit_formatted: '1 000 zł',
  agreed_deposit_words: 'jeden tysiąc złotych',
  remaining_after_deposit_formatted: '8 500 zł',
  remaining_after_deposit_words: 'osiem tysięcy pięćset złotych',
  // Intentionally different ledger remaining — must NOT be used for §2 remaining clause
  remaining_to_pay_formatted: '8 500 zł',
  remaining_to_pay_words: 'osiem tysięcy pięćset złotych',
}

function slotByKey(slots: TemplateSlot[], key: string) {
  return slots.find(
    (s) => s.registryKey === key || canonicalRegistryKey(s.registryKey!) === key,
  )
}

run('1. contract numeric + words pair', () => {
  const text = P_CONTRACT
  const pairs = detectMoneyPairsInText(text)
  assertEq(pairs.length, 1, 'one pair')
  assertEq(pairs[0]!.concept, 'contract_value', 'concept')
  assertEq(pairs[0]!.numeric.text, '8 000 zł', 'numeric source')
  assertEq(pairs[0]!.words!.text, 'osiem tysięcy złotych', 'words source')

  const { slots } = {
    slots: buildSlotsFromAnalysis({
      ai: emptyAi,
      paragraphs: [{ index: 29, text }],
      plainText: text,
    }).slots,
  }
  const num = slotByKey(slots, 'contract_value_formatted')!
  const words = slotByKey(slots, 'contract_value_words')!
  assert(Boolean(num?.physicallyBound), 'numeric bound')
  assert(Boolean(words?.physicallyBound), 'words bound')
  assertEq(num.originalText, '8 000 zł', 'numeric originalText')
  assertEq(words.originalText, 'osiem tysięcy złotych', 'words originalText')
  assert(
    !words.originalText!.includes('słownie'),
    'wrapper not in words span',
  )

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 29, text }],
    slots: [num, words],
    resolved: RESOLVED,
  })
  assert(applied.failures.length === 0, applied.failures[0]?.reason ?? 'fail')
  const out = applied.paragraphs[0]!.text
  assert(out.includes('9 500 zł'), 'numeric replaced')
  assert(out.includes('dziewięć tysięcy pięćset złotych'), 'words replaced')
  assert(out.includes('(słownie: dziewięć tysięcy pięćset złotych)'), 'wrapper kept')
  assert(!out.includes('8 000 zł'), 'old numeric gone')
  assertEq(
    countStandalonePhrase(out, 'osiem tysięcy złotych'),
    0,
    'old words gone (not false-positive inside pięćset)',
  )
})

run('2. deposit numeric + words pair', () => {
  const text = P_DEPOSIT
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 30, text }],
    plainText: text,
  })
  const num = slotByKey(map.slots, 'agreed_deposit_formatted')!
  const words = slotByKey(map.slots, 'agreed_deposit_words')!
  assertEq(num.originalText, '1000 zł', 'deposit numeric source')
  assertEq(words.originalText, 'tysiąc złotych', 'deposit words source')

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 30, text }],
    slots: [num, words],
    resolved: RESOLVED,
  })
  assert(applied.failures.length === 0, 'apply')
  const out = applied.paragraphs[0]!.text
  assert(out.includes('1 000 zł'), out)
  assert(out.includes('(słownie: jeden tysiąc złotych)'), out)
  assert(!out.includes('(słownie: tysiąc złotych)'), 'source words wrapper gone')
})

run('3. remaining-after-deposit pair', () => {
  const text = P_REMAINING
  assertEq(
    classifyMoneyConcept(text, text.indexOf('7 000 zł'), text.indexOf('7 000 zł') + 8),
    'remaining_after_deposit',
    'classify remaining not deposit',
  )
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 31, text }],
    plainText: text,
  })
  const num = slotByKey(map.slots, 'remaining_after_deposit_formatted')!
  const words = slotByKey(map.slots, 'remaining_after_deposit_words')!
  assert(Boolean(num), 'remaining numeric')
  assert(Boolean(words), 'remaining words')
  assertEq(num.originalText, '7 000 zł', 'remaining numeric source')
  assertEq(words.originalText, 'siedem tysięcy złotych', 'remaining words')
  assert(
    !slotByKey(map.slots, 'remaining_to_pay_formatted'),
    'must not map to remaining_to_pay',
  )
  assert(
    !map.slots.some((s) => s.registryKey === 'remaining_to_pay'),
    'no remaining_to_pay slot',
  )

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 31, text }],
    slots: [num, words],
    resolved: RESOLVED,
  })
  assert(applied.failures.length === 0, 'apply remaining')
  const out = applied.paragraphs[0]!.text
  assert(out.includes('8 500 zł'), out)
  assert(out.includes('osiem tysięcy pięćset złotych'), out)
  assert(!out.includes('7 000 zł'), 'old remaining gone')
  assertEq(
    countStandalonePhrase(out, 'siedem tysięcy złotych'),
    0,
    'old remaining words gone',
  )
})

run('4. words split across DOCX runs', () => {
  const xml = `<w:p>${[
    'wynagrodzenie w łącznej wysokości 8 000 zł ',
    '(słownie: ',
    'osiem tysięcy',
    ' złotych',
    ') brutto',
  ]
    .map((t) => `<w:r><w:t>${t}</w:t></w:r>`)
    .join('')}</w:p>`
  const model = buildParagraphRunModel(xml)
  const text = model.canonicalText
  const words = findSlownieWordsAfter(text, text.indexOf('zł') + 2)
  assert(Boolean(words), 'slownie found across runs')
  assertEq(words!.text, 'osiem tysięcy złotych', 'canonical words')

  const cands = detectContractCandidates([{ index: 0, text }])
  const w = cands.find((c) => c.proposedKey === 'contract_value_words')!
  assertEq(w.text, 'osiem tysięcy złotych', 'candidate words')
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots: [
      {
        id: 'w',
        registryKey: 'contract_value_words',
        label: 'words',
        sourceHint: 'package',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        operation: 'replace',
        paragraphIndex: 0,
        originalText: w.text,
        startOffset: w.startOffset,
        endOffset: w.endOffset,
        leftAnchor: w.leftAnchor,
        rightAnchor: w.rightAnchor,
      },
    ],
    resolved: RESOLVED,
  })
  assert(applied.failures.length === 0, 'multi-run apply')
  assert(
    applied.paragraphs[0]!.text.includes('dziewięć tysięcy pięćset złotych'),
    applied.paragraphs[0]!.text,
  )
})

run('5. two money pairs in one paragraph', () => {
  const text = `${P_CONTRACT}. ${P_DEPOSIT}`
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 40, text }],
    plainText: text,
  })
  assert(Boolean(slotByKey(map.slots, 'contract_value_formatted')), 'cv')
  assert(Boolean(slotByKey(map.slots, 'contract_value_words')), 'cvw')
  assert(Boolean(slotByKey(map.slots, 'agreed_deposit_formatted')), 'dep')
  assert(Boolean(slotByKey(map.slots, 'agreed_deposit_words')), 'depw')

  const moneySlots = map.slots.filter((s) =>
    [
      'contract_value_formatted',
      'contract_value_words',
      'agreed_deposit_formatted',
      'agreed_deposit_words',
    ].includes(canonicalRegistryKey(s.registryKey!)),
  )
  assertEq(moneySlots.length, 4, 'four money slots')

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 40, text }],
    slots: moneySlots,
    resolved: RESOLVED,
  })
  assert(
    applied.failures.length === 0,
    applied.failures.map((f) => `${f.registryKey}:${f.reason}`).join('; ') ||
      'two pairs apply',
  )
  const out = applied.paragraphs[0]!.text
  assert(out.includes('9 500 zł') && out.includes('1 000 zł'), out)
  assert(
    out.includes('dziewięć tysięcy pięćset złotych') &&
      out.includes('jeden tysiąc złotych'),
    out,
  )
})

run('6. numeric bound but words missing → abort', () => {
  const text = P_CONTRACT
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 29, text }],
    plainText: text,
  })
  const num = slotByKey(map.slots, 'contract_value_formatted')!
  const onlyNumeric = [num]
  let threw = false
  try {
    assertSafeMoneyPairsForGeneration({
      slots: onlyNumeric,
      paragraphs: [{ index: 29, text }],
    })
  } catch (err) {
    threw = true
    const msg = err instanceof Error ? err.message : String(err)
    assert(
      msg.includes('Unsafe financial pair contract_value') &&
        msg.includes('words slot is missing'),
      msg,
    )
  }
  assert(threw, 'must abort')
})

run('7. remaining-after-deposit is not remaining_to_pay', () => {
  const text = P_REMAINING
  const cands = detectContractCandidates([{ index: 31, text }])
  const keys = cands.map((c) => c.proposedKey)
  assert(
    keys.includes('remaining_after_deposit_formatted'),
    `keys=${keys.join(',')}`,
  )
  assert(
    keys.includes('remaining_after_deposit_words'),
    'words key',
  )
  assert(!keys.includes('remaining_to_pay'), 'no remaining_to_pay')
  assert(!keys.includes('remaining_to_pay_formatted'), 'no remaining_to_pay_formatted')
  assert(!keys.includes('deposit_amount'), 'not misclassified as deposit')
  assert(!keys.includes('agreed_deposit_formatted'), 'not deposit formatted')
})

run('8. validator masks only six physical money spans', () => {
  const paragraphs = [
    { index: 29, text: P_CONTRACT },
    { index: 30, text: P_DEPOSIT },
    { index: 31, text: P_REMAINING },
  ]
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs,
    plainText: paragraphs.map((p) => p.text).join('\n'),
  })
  const moneyKeys = [
    'contract_value_formatted',
    'contract_value_words',
    'agreed_deposit_formatted',
    'agreed_deposit_words',
    'remaining_after_deposit_formatted',
    'remaining_after_deposit_words',
  ]
  const moneySlots = moneyKeys.map((k) => {
    const s = slotByKey(map.slots, k)
    assert(Boolean(s?.physicallyBound), `missing ${k}`)
    return s!
  })
  assertEq(moneySlots.length, 6, 'six spans')

  const applied = applyBoundSlotsToParagraphs({
    original: paragraphs,
    slots: moneySlots,
    resolved: RESOLVED,
  })
  assert(applied.failures.length === 0, 'apply six')

  const quality = verifyContractTransformation({
    original: paragraphs,
    transformed: applied.paragraphs,
    resolvedByKey: RESOLVED,
    slots: moneySlots,
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality fail')

  // Surrounding legal wording preserved
  for (const p of applied.paragraphs) {
    assert(p.text.includes('brutto') || p.text.includes('najpóźniej'), p.text)
  }
  assert(
    applied.paragraphs[0]!.text.includes('wynagrodzenie w łącznej wysokości'),
    'legal cue kept',
  )
  assert(
    applied.paragraphs[2]!.text.includes('pomniejszoną o zadatek'),
    'remaining legal cue kept',
  )
})

run('9. no stale source values after successful generation', () => {
  const paragraphs = [
    { index: 29, text: P_CONTRACT },
    { index: 30, text: P_DEPOSIT },
    { index: 31, text: P_REMAINING },
  ]
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs,
    plainText: paragraphs.map((p) => p.text).join('\n'),
  })
  const moneySlots = map.slots.filter((s) =>
    [
      'contract_value_formatted',
      'contract_value_words',
      'agreed_deposit_formatted',
      'agreed_deposit_words',
      'remaining_after_deposit_formatted',
      'remaining_after_deposit_words',
    ].includes(canonicalRegistryKey(s.registryKey!)),
  )
  assertSafeMoneyPairsForGeneration({ slots: moneySlots, paragraphs })
  const applied = applyBoundSlotsToParagraphs({
    original: paragraphs,
    slots: moneySlots,
    resolved: RESOLVED,
  })
  const joined = applied.paragraphs.map((p) => p.text).join('\n')
  assert(!joined.includes('8 000 zł'), 'no 8000')
  assert(!joined.includes('7 000 zł'), 'no 7000')
  assertEq(
    countStandalonePhrase(joined, 'osiem tysięcy złotych'),
    0,
    'no stale contract words',
  )
  assertEq(
    countStandalonePhrase(joined, 'siedem tysięcy złotych'),
    0,
    'no stale remaining words',
  )
  assert(
    !joined.includes('(słownie: tysiąc złotych)'),
    'deposit words updated',
  )
  assert(joined.includes('(słownie: jeden tysiąc złotych)'), 'deposit words new')
  // “osiem tysięcy pięćset” must not trip stale “osiem tysięcy złotych”
  assert(joined.includes('osiem tysięcy pięćset złotych'), 'new remaining words')

  const stale = findStaleMoneySourcePhrases({
    transformed: applied.paragraphs,
    slots: moneySlots,
    resolved: RESOLVED,
  })
  assertEq(stale.length, 0, `stale=${JSON.stringify(stale)}`)

  console.info('[contract-commercial-apply] money pairs ok', {
    excerpt29: canonicalizeParagraphText(applied.paragraphs[0]!.text),
    excerpt30: canonicalizeParagraphText(applied.paragraphs[1]!.text),
    excerpt31: canonicalizeParagraphText(applied.paragraphs[2]!.text),
  })
})

if (!process.exitCode) {
  console.log('\nAll contract money-pair tests passed.')
}
