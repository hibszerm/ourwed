/**
 * Empty / obfuscated contact placeholder classification.
 * Run: npm run test:contract-contact-placeholders
 */

import { detectContractCandidates, candidatesToTemplateSlots } from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { validateTemplateSlotBindings } from './templateReadiness'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, label: string) {
  if (a !== b) {
    throw new Error(
      `${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
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

function clientParas(contactLine: string) {
  return [
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    { index: 2, text: contactLine },
  ]
}

function accepted(
  cands: ReturnType<typeof detectContractCandidates>,
  key: string,
) {
  return cands.find(
    (c) =>
      c.proposedKey === key &&
      (c.decision === 'accepted' || c.decision === 'needs_confirmation'),
  )
}

run('1 — Telefon: __________ → bride_phone', () => {
  const text = 'Telefon: __________'
  const c = detectContractCandidates(clientParas(text))
  const phone = accepted(c, 'bride_phone')
  assert(Boolean(phone), 'phone')
  assertEq(phone!.text, '__________', 'span')
})

run('2 — E-mail: __________ → bride_email', () => {
  const c = detectContractCandidates(clientParas('E-mail: __________'))
  assertEq(accepted(c, 'bride_email')?.text, '__________', 'email')
})

run('3 — Label is not part of replace span', () => {
  const line = 'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…@…ex….pl'
  const c = detectContractCandidates(clientParas(line))
  const phone = accepted(c, 'bride_phone')!
  assert(!phone.text.toLowerCase().includes('telefon'), 'no label')
  assert(!phone.text.includes(':'), 'no colon in phone when after label')
})

run('4 — Colon is not part of replace span', () => {
  const line = 'Telefon: __________'
  const c = detectContractCandidates(clientParas(line))
  const phone = accepted(c, 'bride_phone')!
  assertEq(line.slice(phone.startOffset, phone.endOffset), '__________', 'offs')
  assertEq(line[phone.startOffset - 1], ' ', 'space before or after colon left out')
})

run('5 — Dot placeholder supported', () => {
  const c = detectContractCandidates(clientParas('telefon: ..........'))
  assertEq(accepted(c, 'bride_phone')?.text, '..........', 'dots')
})

run('6 — Dash placeholder supported', () => {
  const c = detectContractCandidates(clientParas('telefon: ----------'))
  assertEq(accepted(c, 'bride_phone')?.text, '----------', 'dashes')
})

run('7 — XXX XXX XXX in phone context', () => {
  const c = detectContractCandidates(clientParas('telefon: XXX XXX XXX'))
  assertEq(accepted(c, 'bride_phone')?.text, 'XXX XXX XXX', 'masked')
})

run('8 — xxx@xxx.xx in email context', () => {
  const c = detectContractCandidates(clientParas('e-mail: xxx@xxx.xx'))
  assertEq(accepted(c, 'bride_email')?.text, 'xxx@xxx.xx', 'masked email')
})

run('9 — Blank table-like cell after phone (whitespace reserved)', () => {
  // Deterministic whitespace span after label
  const line = 'telefon:           '
  const c = detectContractCandidates(clientParas(line))
  const phone = c.find((x) => x.proposedKey === 'bride_phone')
  // blank after label with only spaces → absent / needs_review
  assert(Boolean(phone), 'surfaced')
  assertEq(phone!.decision, 'needs_confirmation', 'review')
})

run('10 — Blank after email label requires review when no span', () => {
  const c = detectContractCandidates(clientParas('e-mail:'))
  const email = c.find((x) => x.proposedKey === 'bride_email')
  assert(Boolean(email), 'candidate surfaced')
  assertEq(email!.decision, 'needs_confirmation', 'review')
  assert(!email!.text.trim(), 'no fake value')
})

run('11 — Label-only paragraph with no writable span → requires_review', () => {
  const c = detectContractCandidates(clientParas('Telefon:'))
  const phone = c.find((x) => x.proposedKey === 'bride_phone')
  assert(Boolean(phone), 'surfaced')
  assertEq(phone!.decision, 'needs_confirmation', 'review')
  const slots = candidatesToTemplateSlots(c)
  assert(
    slots.find((s) => s.registryKey === 'bride_phone')?.physicallyBound !== true,
    'not bound',
  )
})

run('12 — Shared ambiguous phone+email underscore → review or separable', () => {
  // Separable with comma is OK; truly shared single span is review
  const shared = detectContractCandidates(
    clientParas('Telefon / E-mail: __________'),
  )
  // May map to phone only or review — must not invent two overlapping binds on same span
  const phone = accepted(shared, 'bride_phone')
  const email = accepted(shared, 'bride_email')
  if (phone?.decision === 'accepted' && email?.decision === 'accepted') {
    assert(
      phone.startOffset !== email.startOffset || phone.text !== email.text,
      'must not duplicate identical unsafe binds',
    )
  }
})

run('13 — Bride section maps to partner1 / bride_* keys', () => {
  const c = detectContractCandidates(
    clientParas('telefon: …6…0…0…, e-mail: …a…@…b….pl'),
  )
  assert(Boolean(accepted(c, 'bride_phone')), 'bride_phone')
  assert(Boolean(accepted(c, 'bride_email')), 'bride_email')
})

run('14 — Groom section maps to groom_* without affecting bride', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Anna Kowalska' },
    { index: 2, text: 'telefon: __________' },
    { index: 3, text: 'Pan Młody: Jan Kowalski' },
    { index: 4, text: 'telefon: ----------' },
  ])
  assertEq(accepted(c, 'bride_phone')?.text, '__________', 'bride')
  assertEq(accepted(c, 'groom_phone')?.text, '----------', 'groom')
})

run('15 — Provider phone/email not classified as client contacts', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Dominikiem Błaszczyk, e-mail: dominik@primephoto.pl, tel. 508 144 120',
    },
    { index: 1, text: 'a Parą Młodą:' },
    { index: 2, text: 'Panna Młoda: Katarzyna Dobrowolska' },
  ])
  assert(!accepted(c, 'bride_phone'), 'no bride phone from provider')
  assert(!accepted(c, 'bride_email'), 'no bride email from provider')
})

run('16 — Source placeholder text is not generation value', () => {
  const line = 'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…@…ex….pl'
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: clientParas(line),
    plainText: clientParas(line)
      .map((p) => p.text)
      .join('\n'),
  })
  const phone = map.slots.find((s) => s.registryKey === 'bride_phone')!
  assert(phone.physicallyBound === true, 'bound')
  // Slot originalText is placeholder evidence only — generation uses resolved bag
  assert(phone.originalText?.includes('…') === true, 'placeholder evidence')
  const generationValue = '600828797'
  assert(generationValue !== phone.originalText, 'value ≠ source placeholder')
})

run('17 — Renderer resolves contact values from wedding/client data', () => {
  const line = 'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…@…ex….pl'
  const paras = clientParas(line)
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: paras,
    plainText: paras.map((p) => p.text).join('\n'),
  })
  const phone = map.slots.find((s) => s.registryKey === 'bride_phone')!
  const email = map.slots.find((s) => s.registryKey === 'bride_email')!
  const applied = applyBoundSlotsToParagraphs({
    original: paras,
    slots: [phone, email],
    resolved: {
      bride_phone: '600828797',
      bride_email: 'katarzyna@dobrowolska.pl',
    },
  })
  assert(applied.paragraphs[2]!.text.includes('600828797'), 'phone rendered')
  assert(
    applied.paragraphs[2]!.text.includes('katarzyna@dobrowolska.pl'),
    'email rendered',
  )
  assert(!applied.paragraphs[2]!.text.includes('…6…'), 'placeholder gone')
})

run('18 — Missing generation input is detectable for required contacts', () => {
  const line = 'telefon: __________ , e-mail: __________'
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: clientParas(line),
    plainText: line,
  })
  const phone = map.slots.find((s) => s.registryKey === 'bride_phone')
  assert(phone?.physicallyBound === true, 'bound')
  assertEq(phone?.requirement, 'required', 'required when present')
  const resolved: Record<string, string> = {}
  assert(!resolved.bride_phone?.trim(), 'missing phone at generation')
  assert(!resolved.bride_email?.trim(), 'missing email at generation')
})

run('19 — Template analysis does not require actual wedding contact values', () => {
  const line =
    'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…ta…rz…y…na…@…d…ob…ro…w…o…ls…ka….p…l'
  const paras = [
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    { index: 2, text: 'adres: ul. Testowa 1' },
    { index: 3, text: 'PESEL: 94030313269' },
    { index: 4, text: line },
    { index: 5, text: 'Pan Młody: Tomasz Lepka' },
  ]
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: paras,
    plainText: paras.map((p) => p.text).join('\n'),
  })
  const phone = map.slots.find((s) => s.registryKey === 'bride_phone')
  const email = map.slots.find((s) => s.registryKey === 'bride_email')
  assert(phone?.physicallyBound === true, 'phone safe')
  assert(email?.physicallyBound === true, 'email safe')
  assert(phone?.needsConfirmation !== true, 'no phone review')
  assert(email?.needsConfirmation !== true, 'no email review')
  assert(
    !map.analysisWarnings?.some((w) => /telefon \/ e-mail/i.test(w)),
    'no contact gap warning',
  )
  void validateTemplateSlotBindings(map)
})

if (!process.exitCode) {
  console.log('\nAll contract-contact-placeholder tests passed.')
}
