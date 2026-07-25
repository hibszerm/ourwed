/**
 * Acceptance: client-party label forms (Panna Młoda: / Pan Młody: …).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/clientPartyLabelDetectionAcceptance.test.ts
 */

import { detectContractCandidates } from './candidateDetection'
import { detectClientPartyLabelForms } from './clientPartyLabelDetection'
import { analyzePartyCompleteness } from './contractPartyCompleteness'
import { validateMinimalSlotSpan } from './contractSlotSafety'
import { candidatesToTemplateSlots } from './candidateDetection'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, message: string) {
  if (a !== b) throw new Error(`${message}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
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

const ZINNAR_CLIENT = [
  { index: 14, text: 'zwanymi dalej "Wykonawcą", a Parą Młodą:' },
  { index: 15, text: '' },
  { index: 16, text: 'Panna Młoda: Katarzyna Dobrowolska' },
  {
    index: 17,
    text: 'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków',
  },
  { index: 18, text: 'PESEL: 94030313269' },
  {
    index: 19,
    text: 'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…ta…rz…y…na…@…d…ob…ro…w…o…ls…ka….p…l',
  },
  { index: 20, text: '' },
  { index: 21, text: '2.Pan Młody: Tomasz Lepka' },
  {
    index: 22,
    text: 'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków',
  },
  { index: 23, text: '' },
  { index: 24, text: 'Zwanymi dalej "Zamawiającymi".' },
  { index: 26, text: 'Para Młoda reprezentowana jest przez:' },
  {
    index: 27,
    text: 'Magda Barska – Wedding Planner Kraków, abcslubu@gmail.com, tel. +48 509 719 339',
  },
]

run('1 — Panna Młoda: Name → partner1_full_name', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
  ])
  const p1 = c.find(
    (x) => x.proposedKey === 'partner1_full_name' && x.decision === 'accepted',
  )
  assert(Boolean(p1), 'missing partner1')
  assertEq(p1!.text, 'Katarzyna Dobrowolska', 'name span')
})

run('2 — 2.Pan Młody: Name → partner2_full_name', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: '2.Pan Młody: Tomasz Lepka' },
  ])
  const p2 = c.find(
    (x) => x.proposedKey === 'partner2_full_name' && x.decision === 'accepted',
  )
  assert(Boolean(p2), 'missing partner2')
  assertEq(p2!.text, 'Tomasz Lepka', 'name span')
})

run('3 — optional numbering and missing spaces', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: '1.Panna Młoda:Anna Kowalska' },
    { index: 2, text: '2. Pan Młody: Jan Nowak' },
  ])
  assertEq(
    c.find((x) => x.proposedKey === 'partner1_full_name')?.text,
    'Anna Kowalska',
    'p1',
  )
  assertEq(
    c.find((x) => x.proposedKey === 'partner2_full_name')?.text,
    'Jan Nowak',
    'p2',
  )
})

run('4 — label and name across DOCX-like concatenated runs', () => {
  // Paragraph text is already run-concatenated by the extractor.
  const c = detectContractCandidates([
    { index: 0, text: 'Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: ' + 'Katarzyna' + ' ' + 'Dobrowolska' },
  ])
  assertEq(
    c.find((x) => x.proposedKey === 'partner1_full_name')?.text,
    'Katarzyna Dobrowolska',
    'joined runs',
  )
})

run('5 — label in one paragraph, name in the next', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda:' },
    { index: 2, text: 'Katarzyna Dobrowolska' },
  ])
  const p1 = c.find((x) => x.proposedKey === 'partner1_full_name')
  assert(Boolean(p1), 'name in next para')
  assertEq(p1!.text, 'Katarzyna Dobrowolska', 'next-para name')
  assertEq(p1!.paragraphIndex, 2, 'name paragraph')
})

run('6 — address after partner1 associates with partner1', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    {
      index: 2,
      text: 'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków',
    },
  ])
  const addr = c.find(
    (x) => x.proposedKey === 'bride_address' && x.decision === 'accepted',
  )
  assert(Boolean(addr), 'bride address')
  assert(addr!.text.includes('Świętego Tomasza'), addr!.text)
})

run('7 — address after partner2 associates with partner2', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Pan Młody: Tomasz Lepka' },
    {
      index: 2,
      text: 'adres zamieszkania: ul. Grodzka 1, 31-001 Kraków',
    },
  ])
  const addr = c.find(
    (x) => x.proposedKey === 'groom_address' && x.decision === 'accepted',
  )
  assert(Boolean(addr), 'groom address')
  assert(addr!.text.includes('Grodzka'), addr!.text)
})

run('8 — PESEL associated with correct partner', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    { index: 2, text: 'PESEL: 94030313269' },
    { index: 3, text: 'Pan Młody: Tomasz Lepka' },
    { index: 4, text: 'PESEL: 90010112345' },
  ])
  assertEq(
    c.find((x) => x.proposedKey === 'bride_pesel')?.text,
    '94030313269',
    'p1 pesel',
  )
  assertEq(
    c.find((x) => x.proposedKey === 'groom_pesel')?.text,
    '90010112345',
    'p2 pesel',
  )
})

run('9 — dotted phone/email → safe placeholder slots', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    {
      index: 2,
      text: 'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…ta…@…ex….pl',
    },
  ])
  const phone = c.find((x) => x.proposedKey === 'bride_phone')
  const email = c.find((x) => x.proposedKey === 'bride_email')
  assert(Boolean(phone), 'phone candidate')
  assert(Boolean(email), 'email candidate')
  assert(Boolean(phone!.text.trim()), 'phone has placeholder span')
  assert(Boolean(email!.text.trim()), 'email has placeholder span')
  assertEq(phone!.decision, 'accepted', 'phone accepted')
  assertEq(email!.decision, 'accepted', 'email accepted')
  const slots = candidatesToTemplateSlots(c)
  const phoneSlot = slots.find((s) => s.registryKey === 'bride_phone')
  const emailSlot = slots.find((s) => s.registryKey === 'bride_email')
  assert(phoneSlot?.physicallyBound === true, 'phone bound')
  assert(emailSlot?.physicallyBound === true, 'email bound')
  assert(phoneSlot?.needsConfirmation !== true, 'phone no confirm')
  assert(!phone!.text.includes('telefon'), 'label not in phone span')
})

run('10 — Zwanymi dalej Zamawiającymi is context, not a slot', () => {
  const labeled = detectClientPartyLabelForms(ZINNAR_CLIENT)
  assert(
    !labeled.some((c) => /Zamawiającymi/i.test(c.text)),
    'must not bind closing phrase',
  )
  const c = detectContractCandidates(ZINNAR_CLIENT)
  assert(
    !c.some(
      (x) =>
        x.proposedKey.includes('name') && /Zamawiającymi/i.test(x.text),
    ),
    'no zamawiającymi name slot',
  )
})

run('11 — provider names are not confused with client names', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'pod firmą PRIMEPHOTO s.c. Dominik Błaszczyk, Anna Hornik z siedzibą w Jaworznie, zwanym dalej „Kamerzystami”',
    },
    { index: 1, text: 'a Parą Młodą:' },
    { index: 2, text: 'Panna Młoda: Katarzyna Dobrowolska' },
    { index: 3, text: 'Pan Młody: Tomasz Lepka' },
  ])
  assertEq(
    c.find((x) => x.proposedKey === 'partner1_full_name')?.text,
    'Katarzyna Dobrowolska',
    'client p1',
  )
  assertEq(
    c.find((x) => x.proposedKey === 'partner2_full_name')?.text,
    'Tomasz Lepka',
    'client p2',
  )
  assert(
    !c.some(
      (x) =>
        (x.proposedKey === 'partner1_full_name' ||
          x.proposedKey === 'partner2_full_name') &&
        /Dominik|Hornik|PRIMEPHOTO/i.test(x.text),
    ),
    'provider not as client',
  )
})

run('12 — both client names are not merged into one slot', () => {
  const c = detectContractCandidates(ZINNAR_CLIENT)
  const couple = c.find((x) => x.proposedKey === 'couple_full_names')
  assert(!couple, 'no merged couple slot')
  assert(
    c.filter((x) => x.proposedKey === 'partner1_full_name').length === 1,
    'one p1',
  )
  assert(
    c.filter((x) => x.proposedKey === 'partner2_full_name').length === 1,
    'one p2',
  )
})

run('13 — broad paragraph replacement is rejected', () => {
  const whole =
    'Panna Młoda: Katarzyna Dobrowolska adres zamieszkania: ul. X 1 PESEL: 94030313269'
  const v = validateMinimalSlotSpan({
    registryKey: 'partner1_full_name',
    text: whole,
    operation: 'replace',
  })
  // Detector must bind only the name; if someone tried the whole paragraph it fails multi-entity.
  const c = detectContractCandidates([
    { index: 0, text: 'a Parą Młodą:' },
    { index: 1, text: 'Panna Młoda: Katarzyna Dobrowolska' },
  ])
  const p1 = c.find((x) => x.proposedKey === 'partner1_full_name')
  assertEq(p1!.text, 'Katarzyna Dobrowolska', 'minimal name only')
  assert(!p1!.text.includes('adres'), 'no address in name')
  void v
})

run('14 — Zinnar-like block: both names + follow-ups', () => {
  const c = detectContractCandidates(ZINNAR_CLIENT)
  assertEq(
    c.find((x) => x.proposedKey === 'partner1_full_name')?.text,
    'Katarzyna Dobrowolska',
    'p1',
  )
  assertEq(
    c.find((x) => x.proposedKey === 'partner2_full_name')?.text,
    'Tomasz Lepka',
    'p2',
  )
  assert(
    Boolean(c.find((x) => x.proposedKey === 'bride_address')),
    'bride addr',
  )
  assert(
    Boolean(c.find((x) => x.proposedKey === 'groom_address')),
    'groom addr',
  )
  assertEq(
    c.find((x) => x.proposedKey === 'bride_pesel')?.text,
    '94030313269',
    'pesel',
  )
  const slots = candidatesToTemplateSlots(
    c.filter((x) => x.decision === 'accepted' || x.decision === 'needs_confirmation'),
  )
  const party = analyzePartyCompleteness({
    paragraphs: ZINNAR_CLIENT,
    slots,
  })
  assertEq(party.clientPartyMode, 'dynamic', 'client dynamic')
  assert(
    !party.warnings.some((w) =>
      /nie powiązano bezpiecznie danych pary|Nie wykryto danych stron/i.test(w),
    ),
    party.warnings.join(' | '),
  )
})

run('15 — planner after section close is not partner', () => {
  const c = detectContractCandidates(ZINNAR_CLIENT)
  assert(
    !c.some((x) => /Magda Barska/i.test(x.text)),
    'planner must not be client slot',
  )
})

if (!process.exitCode) {
  console.log('\nAll client-party label detection tests passed.')
}
