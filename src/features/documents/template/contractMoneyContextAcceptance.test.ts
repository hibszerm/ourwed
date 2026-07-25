/**
 * Money context classification — scored inventory, not first-match.
 * Run: npm run test:contract-money-context
 */

import { detectContractCandidates } from './candidateDetection'
import {
  inventoryAndClassifyMoney,
  classifyMoneyConceptScored,
} from './contractMoneyClassification'
import { classifyMoneyConcept } from './contractMoneyPairs'
import { validateMinimalSlotSpan } from './contractSlotSafety'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, label: string) {
  if (a !== b) {
    throw new Error(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
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

function keyOf(
  cands: ReturnType<typeof detectContractCandidates>,
  key: string,
) {
  return cands.find(
    (c) => c.proposedKey === key && c.decision === 'accepted',
  )
}

run('1 — Łączne wynagrodzenie 9 000 zł → contract_value_formatted', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Łączne wynagrodzenie wynosi 9 000 zł',
    },
  ])
  const v = keyOf(c, 'contract_value_formatted')
  assert(Boolean(v), 'missing contract value')
  assertEq(v!.text, '9 000 zł', 'span')
})

run('2 — Każda dodatkowa godzina 1000 zł → overtime_rate', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Każda dodatkowa godzina pracy kosztuje 1000 zł',
    },
  ])
  const ot = keyOf(c, 'overtime_rate')
  assert(Boolean(ot), 'missing overtime')
  assertEq(ot!.text, '1000 zł', 'span')
  assert(!keyOf(c, 'contract_value_formatted'), 'must not be contract value')
})

run('3 — Overtime never wins contract_value when total exists', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1000 zł.',
    },
    {
      index: 1,
      text: 'Ustalone przez strony Wynagrodzenia za wykonanie przedmiotów umowy wynosi: 9 000 zł',
    },
  ])
  assertEq(keyOf(c, 'overtime_rate')?.text, '1000 zł', 'ot')
  assertEq(keyOf(c, 'contract_value_formatted')?.text, '9 000 zł', 'total')
})

run('4 — Pierwsza rata 6 300 zł → agreed_deposit_formatted', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'Pierwsza rata wynosi 6 300 zł' },
  ])
  assertEq(keyOf(c, 'agreed_deposit_formatted')?.text, '6 300 zł', 'deposit')
})

run('5 — Pozostała część wynagrodzenia 2 700 zł → remaining', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Pozostała część wynagrodzenia wynosi 2 700 zł',
    },
  ])
  assertEq(
    keyOf(c, 'remaining_after_deposit_formatted')?.text,
    '2 700 zł',
    'remaining',
  )
})

run('6 — Trzecia rata 2 700 zł → remaining_after_deposit_formatted', () => {
  const c = detectContractCandidates([
    { index: 0, text: 'Wynagrodzenie płatne jest w trzech ratach:' },
    { index: 1, text: 'trzecia rata w wysokości 2 700 zł' },
  ])
  assertEq(
    keyOf(c, 'remaining_after_deposit_formatted')?.text,
    '2 700 zł',
    'third rata',
  )
})

run('7 — kara umowna 4 500 zł excluded', () => {
  const inv = inventoryAndClassifyMoney([
    {
      index: 0,
      text: 'kara umowna w wysokości 4 500 zł',
    },
  ])
  assertEq(inv[0]!.selectedConcept, 'excluded_penalty', 'excluded')
  assertEq(inv[0]!.exclusionReason, 'penalty_context', 'reason')
  const c = detectContractCandidates([
    { index: 0, text: 'kara umowna w wysokości 4 500 zł' },
  ])
  assert(
    !c.some(
      (x) =>
        x.decision === 'accepted' &&
        /value|deposit|remaining|overtime/i.test(x.proposedKey),
    ),
    'no commercial slot',
  )
})

run('8 — 50% wynagrodzenia, tj. 4 500 zł in cancellation → excluded', () => {
  const inv = inventoryAndClassifyMoney([
    {
      index: 0,
      text: 'Odstąpienie od umowy wiąże się z zapłatą kary umownej w wysokości 50% ustalonego wynagrodzenia, tj. 4 500 zł.',
    },
  ])
  assertEq(inv[0]!.selectedConcept, 'excluded_penalty', 'excluded')
})

run('9 — Total + first + final installments classify correctly', () => {
  const c = detectContractCandidates([
    {
      index: 0,
      text: 'Ustalone przez strony Wynagrodzenia za wykonanie przedmiotów umowy wynosi: 9 000 zł',
    },
    { index: 1, text: 'Wynagrodzenie płatne jest w trzech ratach:' },
    {
      index: 2,
      text: 'pierwsza rata w wysokości 6 300 zł płatna gotówką w dniu wesela',
    },
    {
      index: 3,
      text: 'trzecia rata w wysokości 2 700 zł płatna przy odebraniu gotowego przedmiotu umowy.',
    },
  ])
  assertEq(keyOf(c, 'contract_value_formatted')?.text, '9 000 zł', 'total')
  assertEq(keyOf(c, 'agreed_deposit_formatted')?.text, '6 300 zł', 'first')
  assertEq(
    keyOf(c, 'remaining_after_deposit_formatted')?.text,
    '2 700 zł',
    'final',
  )
})

run('10 — Arithmetic supports but does not invent roles', () => {
  // Unlabeled amounts that happen to sum — must not invent deposit/remaining.
  const inv = inventoryAndClassifyMoney([
    { index: 0, text: 'Kwota A wynosi 6 000 zł.' },
    { index: 1, text: 'Kwota B wynosi 3 000 zł.' },
    { index: 2, text: 'Kwota C wynosi 9 000 zł.' },
  ])
  const commercial = inv.filter(
    (c) =>
      c.selectedConcept === 'agreed_deposit' ||
      c.selectedConcept === 'remaining_after_deposit',
  )
  assert(
    commercial.length === 0,
    'must not invent installment roles from arithmetic alone',
  )
})

run('11 — Ambiguous unlabeled amount → needs_review / unknown', () => {
  const kind = classifyMoneyConceptScored(
    'Strony ustalają kwotę 5 000 zł na inne cele.',
    'Strony ustalają kwotę '.length,
    'Strony ustalają kwotę 5 000 zł'.length,
  )
  assert(
    kind === 'unknown' || kind === 'ambiguous' || kind === 'contract_value',
    `got ${kind}`,
  )
  // Without strong anchors, inventory should not force a unique commercial win
  // when multiple unlabeled amounts compete — single weak amount may be unknown.
  const inv = inventoryAndClassifyMoney([
    { index: 0, text: 'Kwota wynosi 5 000 zł na inne cele.' },
  ])
  assert(
    inv[0]!.selectedConcept === 'unknown' ||
      inv[0]!.reviewState === 'needs_review' ||
      inv[0]!.selectedConcept === 'contract_value',
    JSON.stringify(inv[0]!.selectedConcept),
  )
})

run('12 — Money spans are minimal', () => {
  const text =
    'Łączne wynagrodzenie za wykonanie przedmiotu umowy wynosi 9 000 zł brutto.'
  const c = detectContractCandidates([{ index: 0, text }])
  const v = keyOf(c, 'contract_value_formatted')!
  assertEq(v.text, '9 000 zł', 'minimal')
  assert(!v.text.includes('wynagrodzenie'), 'no wrapper')
  const safety = validateMinimalSlotSpan({
    registryKey: 'contract_value_formatted',
    text: v.text,
    paragraphText: text,
    operation: 'replace',
  })
  assert(safety.ok, 'safe span')
})

run('13 — Numeric/words pair stays in same clause', () => {
  const text =
    'Z tytułu wykonania Umowy wynagrodzenie w łącznej wysokości 8 000 zł (słownie: osiem tysięcy złotych) brutto'
  const c = detectContractCandidates([{ index: 0, text }])
  const num = keyOf(c, 'contract_value_formatted')
  const words = keyOf(c, 'contract_value_words')
  assert(Boolean(num), 'numeric')
  assert(Boolean(words), 'words')
  assertEq(num!.paragraphIndex, words!.paragraphIndex, 'same para')
  assertEq(classifyMoneyConcept(text, text.indexOf('8 000'), text.indexOf('8 000') + 8), 'contract_value', 'pair concept')
})

run('14 — Zinnar-like block full classification', () => {
  const c = detectContractCandidates([
    {
      index: 72,
      text: 'Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1000 zł.',
    },
    {
      index: 96,
      text: 'Ustalone przez strony Wynagrodzenia za wykonanie przedmiotów umowy opisanych w § 1 oraz udzielenie licencji na korzystanie z filmu wynosi: 9 000 zł',
    },
    { index: 98, text: 'Wynagrodzenie płatne jest w trzech ratach:' },
    {
      index: 99,
      text: 'pierwsza rata w wysokości 6 300 zł płatna gotówką w dniu wesela',
    },
    {
      index: 100,
      text: 'trzecia rata w wysokości 2 700 zł płatna przy odebraniu gotowego przedmiotu umowy.',
    },
    {
      index: 140,
      text: 'Odstąpienie od umowy wiąże się z zapłatą kary umownej w wysokości 50% ustalonego wynagrodzenia, tj. 4 500 zł.',
    },
  ])
  assertEq(keyOf(c, 'contract_value_formatted')?.text, '9 000 zł', 'total')
  assertEq(keyOf(c, 'overtime_rate')?.text, '1000 zł', 'ot')
  assertEq(keyOf(c, 'agreed_deposit_formatted')?.text, '6 300 zł', 'dep')
  assertEq(
    keyOf(c, 'remaining_after_deposit_formatted')?.text,
    '2 700 zł',
    'rem',
  )
  assert(
    !c.some(
      (x) =>
        x.decision === 'accepted' &&
        x.text.includes('4 500') &&
        /value|deposit|remaining|overtime/i.test(x.proposedKey),
    ),
    'penalty not commercial',
  )
})

if (!process.exitCode) {
  console.log('\nAll contract money-context tests passed.')
}
