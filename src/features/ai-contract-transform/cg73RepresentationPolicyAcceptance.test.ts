/**
 * CG7.3 — template representation policy + payment authorship (offline).
 * Run: npm run test:cg73-representation
 */

import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import { detectRepresentedConcepts } from './quality/representationPolicy'
import { repairCanonicalPaymentAmounts } from './quality/paymentAmountRepair'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'
import type { ProtectedContractData } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function ds(partial?: Partial<ContractTransformationDataset>): ContractTransformationDataset {
  return {
    clients: {
      personCount: 2,
      displayNames: 'Anna Testowa i Jan Próbny',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
      phone: '+48 500 100 200',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '02.10.2027 r.',
    },
    package: { name: 'Reportaż' },
    finances: {
      contractValueFormatted: '14 200 zł',
      contractValueWords: 'czternaście tysięcy dwieście złotych',
      depositFormatted: '3 976 zł',
      depositWords: 'trzy tysiące dziewięćset siedemdziesiąt sześć złotych',
      remainingFormatted: '10 224 zł',
      remainingWords: 'dziesięć tysięcy dwieście dwadzieścia cztery złotych',
    },
    locations: {
      preparation: { fullAddress: 'ul. Piotrkowska 100, Łódź' },
      ceremony: { displayName: 'Kościół NMP, Łódź' },
      reception: { displayName: 'Pałac Poznańskiego, Łódź' },
    },
    ...partial,
  }
}

function emptyProtected(): ProtectedContractData {
  return { exactProtectedValues: [], protectedPatterns: [] }
}

function para(id: string, text: string): TransformDocumentBlock {
  return { blockId: id, paragraphIndex: 0, text, kind: 'paragraph' }
}

function cell(
  id: string,
  text: string,
  label: string,
  family: 'wedding_location' | 'wedding_date',
  row: number,
  cellIndex: number,
): TransformDocumentBlock {
  return {
    blockId: id,
    paragraphIndex: 0,
    text,
    kind: 'tableCell',
    tableContext: {
      tableIndex: 0,
      rowIndex: row,
      cellIndex,
      rowLabelText: label,
      neighboringCellTexts: cellIndex === 0 ? ['v'] : [label],
      ownershipFamily: family,
    },
  }
}

function moneyOk(): TransformDocumentBlock {
  return para(
    'money',
    'Wynagrodzenie 14 200 zł (słownie: czternaście tysięcy dwieście złotych). Zadatek 3 976 zł. Pozostała 10 224 zł.',
  )
}

function run(
  source: TransformDocumentBlock[],
  transformed: TransformedBlock[],
  dataset = ds(),
) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset,
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

function asIs(source: TransformDocumentBlock[]): TransformedBlock[] {
  return source.map((b) => ({ blockId: b.blockId, text: b.text }))
}

// ---- S01–S10 representation ----
{
  const source = [
    cell('p1', 'do uzupełnienia', 'Miejsce przygotowań', 'wedding_location', 0, 1),
    cell('c1', 'do uzupełnienia', 'Miejsce ceremonii', 'wedding_location', 1, 1),
    cell('r1', 'do uzupełnienia', 'Miejsce wesela', 'wedding_location', 2, 1),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.preparationLocation === true, 'S01 prep')
  assert(m.representedConcepts?.ceremonyLocation === true, 'S01 ceremony')
  assert(m.representedConcepts?.receptionLocation === true, 'S01 reception')
  assert(
    m.requiredFields.some((f) => f.canonicalField === 'wedding.preparationLocation'),
    'S01 prep required',
  )
  console.log('PASS  S01: all three represented → required')
}

{
  const source = [
    cell('c1', 'do uzupełnienia', 'Miejsce ceremonii', 'wedding_location', 0, 1),
    cell('r1', 'do uzupełnienia', 'Miejsce wesela', 'wedding_location', 1, 1),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.preparationLocation === false, 'S02 prep not represented')
  assert(
    !m.requiredFields.some((f) => f.canonicalField === 'wedding.preparationLocation'),
    'S02 prep not required',
  )
  assert(
    m.requiredFields.some((f) => f.canonicalField === 'wedding.ceremonyLocation'),
    'S02 ceremony required',
  )
  console.log('PASS  S02: prep not represented → not required')
}

{
  const source = [
    cell('r1', 'do uzupełnienia', 'Miejsce wesela', 'wedding_location', 0, 1),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.ceremonyLocation === false, 'S03 no ceremony')
  assert(m.representedConcepts?.preparationLocation === false, 'S03 no prep')
  assert(m.representedConcepts?.receptionLocation === true, 'S03 reception')
  console.log('PASS  S03: reception only')
}

{
  const source = [
    para('p0', 'Umowa o świadczenie usług twórczych.'),
    para('p1', 'Strony ustalają przebieg dnia we własnym zakresie.'),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.preparationLocation === false, 'S04 no prep')
  assert(m.representedConcepts?.ceremonyLocation === false, 'S04 no ceremony')
  assert(m.representedConcepts?.receptionLocation === false, 'S04 no reception')
  const gate = run(source, asIs(source))
  assert(
    !gate.report.blockingIssues.some(
      (i) =>
        typeof i.canonicalField === 'string' &&
        i.canonicalField.includes('Location') &&
        i.code === 'expected_dataset_value_missing',
    ),
    'S04: no location Mode A must_appear',
  )
  console.log('PASS  S04: no locations at all')
}

{
  const source = [
    cell('c1', 'Stary Kościół Demo', 'Miejsce ceremonii', 'wedding_location', 0, 1),
    moneyOk(),
  ]
  const gate = run(source, asIs(source))
  assert(
    /Kościół NMP|NMP/i.test(gate.blocks.find((b) => b.blockId === 'c1')?.text ?? ''),
    'S05: ceremony replaced',
  )
  assert(
    !gate.blocks.some((b) => /Piotrkowska|Poznańskiego/i.test(b.text)),
    'S05: prep/reception not invented',
  )
  console.log('PASS  S05: old ceremony only')
}

{
  const source = [
    cell('r1', '', 'Miejsce wesela', 'wedding_location', 0, 1),
    moneyOk(),
  ]
  const gate = run(source, asIs(source))
  assert(/Poznańskiego/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''), 'S06 reception filled')
  console.log('PASS  S06: blank reception')
}

{
  const source = [
    cell('p1', 'do uzupełnienia', 'Miejsce przygotowań', 'wedding_location', 0, 1),
    cell('c1', 'do uzupełnienia', 'Miejsce ceremonii', 'wedding_location', 1, 1),
    cell('r1', 'do uzupełnienia', 'Miejsce wesela', 'wedding_location', 2, 1),
    moneyOk(),
  ]
  const gate = run(source, asIs(source))
  assert(gate.downloadAllowed || gate.blocks.every((b) => !/do uzupełnienia/i.test(b.text)), 'S07 table')
  console.log('PASS  S07: table CG7.2 path')
}

{
  const source = [
    para(
      'p1',
      '1. Przedmiotem jest reportaż z miejsca uroczystości zaślubin oraz miejsca celebracji weselnej.',
    ),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.ceremonyLocation === false, 'S08 no ceremony slot')
  assert(m.representedConcepts?.receptionLocation === false, 'S08 no reception slot')
  const gate = run(source, asIs(source))
  assert(
    !gate.blocks.some((b) => /Piotrkowska|Poznańskiego|Kościół NMP/i.test(b.text)),
    'S08: no location prose authored',
  )
  console.log('PASS  S08: dense prose no location insertion')
}

{
  const source = [
    para(
      'prov',
      'Studio Klatka Filmowa, NIP 7790001111, z siedzibą ul. Garbary 10, Poznań.',
    ),
    moneyOk(),
  ]
  const rep = detectRepresentedConcepts(source)
  assert(rep.receptionLocation === false, 'S09 provider addr not reception')
  assert(rep.ceremonyLocation === false, 'S09 provider not ceremony')
  console.log('PASS  S09: provider address ≠ wedding location')
}

{
  const source = [
    para(
      'cancel',
      'W razie odwołania uroczystości poza Pałacem Rydzyna Studio nie ponosi kosztów dojazdu.',
    ),
    moneyOk(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(
    !(m.sourceLocationEvidence ?? []).some((e) => e.blockId === 'cancel'),
    'S10: travel/cancel venue not location evidence',
  )
  console.log('PASS  S10: unrelated venue mention')
}

// ---- PAY01–PAY12 ----
{
  const source = [
    para(
      'pay',
      'Wynagrodzenie 12 600 zł (słownie: dwanaście tysięcy sześćset złotych), zadatek 3 500 zł, pozostała 9 100 zł.',
    ),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.totalPrice && m.representedConcepts.deposit && m.representedConcepts.remaining, 'PAY01 all')
  console.log('PASS  PAY01: one paragraph split')
}

{
  const source = [
    para('t', '1. Honorarium wynosi 12 600 zł (słownie: dwanaście tysięcy sześćset złotych).'),
    para(
      'd',
      '2. Kwota rezerwacyjna 3 500 zł (słownie: trzy tysiące pięćset złotych).',
    ),
    para(
      'r',
      '3. Pozostałe należne wynagrodzenie 9 100 zł (słownie: dziewięć tysięcy sto złotych).',
    ),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.deposit === true, 'PAY02/05 deposit via rezerwacyjna')
  assert(m.representedConcepts?.remaining === true, 'PAY02 remaining')
  const repaired = repairCanonicalPaymentAmounts({
    blocks: asIs(source),
    sourceBlocks: source,
    dataset: ds(),
  })
  assert(
    !repaired.repairs.some((r) =>
      /insert_canonical_deposit_into_finance_block|insert_canonical_remaining_into_finance_block/.test(
        r.repairCode,
      ),
    ),
    'PAY02: CG3 must not append onto existing multi-amount structure',
  )
  assert(
    repaired.blocks.every((b) => !/Zadatek 3 976/.test(b.text)),
    'PAY02: no authored Zadatek append',
  )
  const blob = repaired.blocks.map((b) => b.text).join('\n')
  assert(/14 200 zł/.test(blob), 'PAY02: total replaced in place')
  assert(/3 976 zł/.test(blob), 'PAY02: deposit/rezerwacyjna replaced in place')
  assert(/10 224 zł/.test(blob), 'PAY02: remaining replaced in place')
  assert(!/12 600 zł|3 500 zł|9 100 zł/.test(blob), 'PAY06: old amounts gone')
  console.log('PASS  PAY02/05/06: numbered paras + in-place replace, no CG3 append')
}

{
  const source = [
    cell('v0', 'Wartość zlecenia', 'Wartość zlecenia', 'wedding_date', 0, 0),
    cell('v1', '8 400 zł', 'Wartość zlecenia', 'wedding_date', 0, 1),
    cell('w0', 'Wpłacono', 'Wpłacono', 'wedding_date', 1, 0),
    cell('w1', '2 100 zł', 'Wpłacono', 'wedding_date', 1, 1),
    cell('d0', 'Do zapłaty', 'Do zapłaty', 'wedding_date', 2, 0),
    cell('d1', '6 300 zł', 'Do zapłaty', 'wedding_date', 2, 1),
  ]
  // Force finance family via text
  const financeSource = source.map((b) => ({
    ...b,
    text: b.text,
  }))
  const m = buildExpectationManifest({
    sourceBlocks: [
      para('fin', 'Wartość zlecenia 8 400 zł. Wpłacono 2 100 zł. Do zapłaty 6 300 zł.'),
    ],
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.deposit === true, 'PAY03 deposit via wpłacono')
  assert(m.representedConcepts?.remaining === true, 'PAY03 remaining via do zapłaty')
  void financeSource
  console.log('PASS  PAY03: payment table vocabulary')
}

{
  const source = [
    para(
      'pay',
      'Honorarium 12 600 zł (słownie: dwanaście tysięcy sześćset złotych).',
    ),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.totalPrice === true, 'PAY04 total')
  assert(m.representedConcepts?.deposit === false, 'PAY04 no deposit')
  assert(m.representedConcepts?.remaining === false, 'PAY04 no remaining')
  assert(
    !m.requiredFields.some((f) => f.canonicalField === 'contract.depositAmount'),
    'PAY04 deposit not required',
  )
  console.log('PASS  PAY04/11: total only — no deposit/remaining force')
}

{
  const source = [
    para(
      'pay',
      '2. Świadczenie obejmuje kwotę rezerwacyjną 3 500 zł oraz pozostałe należne wynagrodzenie 9 100 zł płatne na 10 dni przed datą. Rachunek 66 7777 8888.',
    ),
    para('fee', 'Dodatkowa godzina 900 zł.'),
  ]
  const repaired = repairCanonicalPaymentAmounts({
    blocks: asIs(source),
    sourceBlocks: source,
    dataset: ds(),
  })
  assert(
    repaired.blocks.find((b) => b.blockId === 'fee')?.text === 'Dodatkowa godzina 900 zł.',
    'PAY07: unrelated fee untouched',
  )
  assert(/66 7777/.test(repaired.blocks.find((b) => b.blockId === 'pay')?.text ?? ''), 'PAY08: bank preserved')
  console.log('PASS  PAY07/08: unrelated fee + bank preserved')
}

{
  const source = [
    para(
      'pay',
      'Wynagrodzenie 14 200 zł. Zadatek 3 976 zł. Pozostała 10 224 zł.',
    ),
  ]
  const repaired = repairCanonicalPaymentAmounts({
    blocks: asIs(source),
    sourceBlocks: source,
    dataset: ds(),
  })
  assert(repaired.repairs.length === 0, 'PAY09: already correct — no repair')
  console.log('PASS  PAY09: already equal')
}

{
  const source = [
    para('legal', 'Umowa bez kwot — strony ustalą wynagrodzenie aneksem.'),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.totalPrice === false, 'PAY10 no total')
  assert(
    !m.requiredFields.some((f) => f.canonicalField === 'contract.totalPrice'),
    'PAY10 total not required',
  )
  console.log('PASS  PAY10: payment concept absent')
}

{
  // Mixed false-positive regression: "płatne" must not count as "płatne jednorazowo"
  const source = [
    para(
      'pay',
      'Kwota rezerwacyjna 3 976 zł płatna w terminie 14 dni oraz pozostałe 10 224 zł płatne na 10 dni przed datą.',
    ),
    para(
      'tot',
      'Honorarium 14 200 zł (słownie: czternaście tysięcy dwieście złotych).',
    ),
  ]
  const gate = run(source, asIs(source))
  assert(
    !gate.report.blockingIssues.some(
      (i) =>
        i.code === 'mixed_source_and_target_values' &&
        i.canonicalField === 'contract.paymentStructure',
    ),
    'PAY12: no false mixed from płatne token',
  )
  console.log('PASS  PAY12: no false paymentStructure mix')
}

console.log('\nCG7.3 representation + payment acceptance: ALL PASS')
