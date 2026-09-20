/**
 * CG3 — payment completeness repair regression (deterministic, no OpenAI).
 *
 * Reproduces CG2 failure shapes:
 * - AI replaced total but left PLACEHOLDER_ZADATEK
 * - AI left "Pozostała kwota" without amount
 * - templates with deposit but no remaining slot
 * - minimal price-only finance block
 * - already-correct documents must be preserved
 * - forbidden legal sections must not receive payment injection
 */

import { runPostReconstructionQualityGate } from './buildQualityReport'
import { repairCanonicalPaymentAmounts } from './paymentAmountRepair'
import { verifyFinancialConsistency } from './financialConsistency'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import type { ProtectedContractData } from '../types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const FINANCES = {
  contractValueFormatted: '13 500 zł',
  contractValueWords: 'trzynaście tysięcy pięćset złotych',
  depositFormatted: '3 780 zł',
  depositWords: 'trzy tysiące siedemset osiemdziesiąt złotych',
  remainingFormatted: '9 720 zł',
  remainingWords: 'dziewięć tysięcy siedemset dwadzieścia złotych',
} as const

function dataset(): ContractTransformationDataset {
  return {
    clients: {
      personCount: 2,
      displayNames: 'Anna Testowa i Jan Próbny',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '19.06.2027 r.',
    },
    package: { name: 'Pakiet QA Premium' },
    finances: { ...FINANCES },
    locations: {},
    additionalServices: [
      { id: 'e1', name: 'dodatkowy operator' },
      { id: 'e2', name: 'ujęcie z drona' },
    ],
  }
}

function emptyProtected(): ProtectedContractData {
  return {
    exactProtectedValues: [],
    protectedPatterns: [],
  }
}

function blocksFrom(
  rows: Array<{ id: string; text: string }>,
): { source: TransformDocumentBlock[]; transformed: TransformedBlock[] } {
  // Use real blockId mapping via plain paragraphs, then remap ids for stability
  const source = rows.map((r, i) => ({
    blockId: r.id,
    paragraphIndex: i,
    text: r.text,
    kind: 'paragraph' as const,
  }))
  const transformed = rows.map((r) => ({ blockId: r.id, text: r.text }))
  return { source, transformed }
}

function runGate(
  source: TransformDocumentBlock[],
  transformed: TransformedBlock[],
) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: dataset(),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

function joined(blocks: TransformedBlock[]): string {
  return blocks.map((b) => b.text).join('\n')
}

// --- Shape A: total rewritten, deposit placeholder left (T02/T06/T09-like) ---
{
  const { source, transformed } = blocksFrom([
    { id: 'p1', text: 'Wynagrodzenie wynosi 13 500 zł.' },
    { id: 'p2', text: 'Zadatek PLACEHOLDER_ZADATEK zł.' },
    { id: 'rodo', text: 'Przetwarzanie danych osobowych wyłącznie w celu realizacji umowy.' },
    { id: 'sig', text: 'Podpisy stron.' },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'A: download allowed after deposit repair')
  assert(
    gate.blocks.some((b) => b.text.includes('3 780 zł')),
    'A: deposit present',
  )
  assert(
    gate.blocks.some((b) => b.text.includes('9 720 zł')),
    'A: remaining present',
  )
  assert(
    !gate.blocks.some((b) => /PLACEHOLDER_ZADATEK/i.test(b.text)),
    'A: placeholder gone',
  )
  assert(
    !/3 780|9 720/.test(
      gate.blocks.find((b) => b.blockId === 'rodo')?.text ?? '',
    ),
    'A: RODO untouched',
  )
  console.log('PASS  A: deposit placeholder + missing remaining repaired')
}

// --- Shape B: "Pozostała kwota" without amount (T01/T10-like after partial AI) ---
{
  const { source, transformed } = blocksFrom([
    { id: 'p1', text: 'Wynagrodzenie wynosi 13 500 zł brutto.' },
    {
      id: 'p2',
      text: 'Zadatek 3 780 zł. Pozostała kwota przed uroczystością.',
    },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'B: download allowed')
  assert(
    /Pozostała kwota 9 720 zł/.test(joined(gate.blocks)),
    'B: remaining injected into existing clause',
  )
  assert(
    (joined(gate.blocks).match(/3 780 zł/g) ?? []).length === 1,
    'B: deposit not duplicated',
  )
  console.log('PASS  B: remaining injected into istniejąca pozostała-kwota clause')
}

// --- Shape C: table cells with PLACEHOLDER_RESTA (T03-like partial) ---
{
  const { source, transformed } = blocksFrom([
    { id: 't-cena', text: '13 500 zł' },
    { id: 't-zad', text: 'PLACEHOLDER_ZADATEK zł' },
    { id: 't-rest', text: 'PLACEHOLDER_RESTA zł' },
  ])
  // mark table-ish via source text only — repair uses text heuristics
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'C: table placeholders repaired')
  assert(
    gate.blocks.find((b) => b.blockId === 't-zad')?.text.includes('3 780'),
    'C: deposit cell',
  )
  assert(
    gate.blocks.find((b) => b.blockId === 't-rest')?.text.includes('9 720'),
    'C: remaining cell',
  )
  console.log('PASS  C: table PLACEHOLDER_ZADATEK/RESTA substitution')
}

// --- Shape D: price-only block (T05-like) ---
{
  const { source, transformed } = blocksFrom([
    { id: 'p1', text: 'Cena: 13 500 zł.' },
    { id: 'sig', text: 'Podpis Zamawiającego' },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'D: price-only finance block gains deposit+remaining')
  const finance = gate.blocks.find((b) => b.blockId === 'p1')!.text
  assert(/13 500 zł/.test(finance), 'D: total preserved')
  assert(/3 780 zł/.test(finance), 'D: deposit in finance block')
  assert(/9 720 zł/.test(finance), 'D: remaining in finance block')
  assert(
    !/3 780|9 720/.test(
      gate.blocks.find((b) => b.blockId === 'sig')?.text ?? '',
    ),
    'D: signature untouched',
  )
  console.log('PASS  D: minimal price block receives canonical payment amounts')
}

// --- Shape E: already correct — no duplicate repairs ---
{
  const { source, transformed } = blocksFrom([
    { id: 'p1', text: 'Wynagrodzenie wynosi 13 500 zł.' },
    {
      id: 'p2',
      text: 'Zadatek 3 780 zł. Pozostała kwota 9 720 zł.',
    },
  ])
  const before = joined(transformed)
  const repaired = repairCanonicalPaymentAmounts({
    blocks: transformed,
    sourceBlocks: source,
    dataset: dataset(),
  })
  assert(repaired.repairs.length === 0, 'E: no repairs when already complete')
  assert(joined(repaired.blocks) === before, 'E: text unchanged')
  const fin = verifyFinancialConsistency({
    dataset: dataset(),
    transformedBlocks: repaired.blocks,
  })
  assert(fin.summary.depositMatches === true, 'E: deposit matches')
  assert(fin.summary.remainingMatches === true, 'E: remaining matches')
  console.log('PASS  E: already-correct payment blocks preserved')
}

// --- Shape F: combined cena+zadatek line (T07-like), no remaining ---
{
  const { source, transformed } = blocksFrom([
    {
      id: 'p1',
      text: 'Wynagrodzenie 13 500 zł. Zadatek PLACEHOLDER_ZADATEK zł.',
    },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'F: download allowed')
  assert(/3 780 zł/.test(joined(gate.blocks)), 'F: deposit')
  assert(/9 720 zł/.test(joined(gate.blocks)), 'F: remaining appended nearby')
  console.log('PASS  F: combined remuneration line repaired')
}

// --- Shape G: extras names stay without individual prices after gate ---
{
  const { source, transformed } = blocksFrom([
    { id: 'pkg', text: 'Zamawiający wybiera pakiet, który obejmuje film ślubny.' },
    { id: 'ex', text: 'Usługi dodatkowe' },
    { id: 'p1', text: 'Wynagrodzenie wynosi 13 500 zł.' },
    { id: 'p2', text: 'Zadatek PLACEHOLDER_ZADATEK zł.' },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'G: download allowed with extras')
  const blob = joined(gate.blocks)
  assert(/dodatkowy operator/i.test(blob), 'G: extras name present')
  assert(!/dodatkowy operator\s*[—\-–].*\d/i.test(blob), 'G: no extras price')
  console.log('PASS  G: extras I30 preserved alongside payment repair')
}

// --- Shape H: one-person party text not altered by payment repair ---
{
  const { source, transformed } = blocksFrom([
    {
      id: 'party',
      text: 'zawarta pomiędzy Anna Testowa, zwaną dalej Zamawiającą.',
    },
    { id: 'p1', text: 'Cena: 13 500 zł.' },
  ])
  const gate = runGate(source, transformed)
  assert(gate.downloadAllowed, 'H: one-person download allowed')
  assert(
    gate.blocks.find((b) => b.blockId === 'party')?.text ===
      'zawarta pomiędzy Anna Testowa, zwaną dalej Zamawiającą.',
    'H: party clause untouched',
  )
  assert(!/Jan Próbny/.test(joined(gate.blocks)), 'H: no invented partner2')
  console.log('PASS  H: one-person party clause preserved')
}

console.log('\nAll CG3 payment-completeness regressions passed.')
