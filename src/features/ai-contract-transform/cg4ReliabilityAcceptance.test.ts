/**
 * CG4 reliability regressions — party, blockId, payment heading (no OpenAI).
 */

import { applySparseBlockChanges } from './applySparseBlockChanges'
import {
  buildFullAiJsonSchemaForBlockIds,
  buildProtocolBlockIdRetryHint,
  partitionChangedBlocksBySourceIds,
} from './blockIdIntegrity'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import {
  isFinanceSectionHeading,
  repairCanonicalPaymentAmounts,
} from './quality/paymentAmountRepair'
import { repairCanonicalPartyPlaceholders } from './quality/partyPlaceholderRepair'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'
import type { ProtectedContractData } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function dataset(personCount: 1 | 2): ContractTransformationDataset {
  return {
    clients: {
      personCount,
      displayNames:
        personCount === 2 ? 'Anna Testowa i Jan Próbny' : 'Anna Testowa',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '19.06.2027 r.',
    },
    package: { name: 'Pakiet QA Premium' },
    finances: {
      contractValueFormatted: '13 500 zł',
      contractValueWords: 'trzynaście tysięcy pięćset złotych',
      depositFormatted: '3 780 zł',
      depositWords: 'trzy tysiące siedemset osiemdziesiąt złotych',
      remainingFormatted: '9 720 zł',
      remainingWords: 'dziewięć tysięcy siedemset dwadzieścia złotych',
    },
    locations: {},
    additionalServices: [{ id: 'e1', name: 'dodatkowy operator' }],
  }
}

function emptyProtected(): ProtectedContractData {
  return { exactProtectedValues: [], protectedPatterns: [] }
}

function blocksFrom(
  rows: Array<{ id: string; text: string }>,
): { source: TransformDocumentBlock[]; transformed: TransformedBlock[] } {
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
  personCount: 1 | 2 = 2,
) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: dataset(personCount),
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

// ========== A. PARTY ==========
{
  const { source, transformed } = blocksFrom([
    { id: 'p0', text: 'zawarta z PLACEHOLDER_STRONY.' },
    { id: 'p1', text: 'Wynagrodzenie wynosi 13 500 zł.' },
    { id: 'p2', text: 'Zadatek PLACEHOLDER_ZADATEK zł.' },
    { id: 'sig', text: 'Podpisy stron' },
  ])
  const gate = runGate(source, transformed, 1)
  assert(gate.downloadAllowed, 'A1: download allowed')
  assert(
    !gate.blocks.some((b) => b.text.includes('PLACEHOLDER_STRONY')),
    'A1: party placeholder resolved',
  )
  assert(
    gate.blocks.some((b) => b.text.includes('Anna Testowa')),
    'A1: person1 present',
  )
  assert(
    !gate.blocks.some((b) => b.text.includes('Jan Próbny')),
    'A1: no person2 invention for one-person',
  )
  assert(
    gate.blocks.find((b) => b.blockId === 'sig')?.text === 'Podpisy stron',
    'A1: signature preserved',
  )
  console.log('PASS  A1: one-person PLACEHOLDER_STRONY → displayNames')
}

{
  const { source, transformed } = blocksFrom([
    {
      id: 'p0',
      text: 'Umowę zawierają PLACEHOLDER_STRONY.',
    },
    { id: 'p1', text: 'Cena: 13 500 zł.' },
  ])
  const gate = runGate(source, transformed, 2)
  assert(gate.downloadAllowed, 'A2: two-person download')
  assert(
    gate.blocks.some((b) => b.text.includes('Anna Testowa i Jan Próbny')),
    'A2: both names via displayNames',
  )
  const party = gate.blocks.find((b) => b.blockId === 'p0')!.text
  assert(
    (party.match(/Anna Testowa/g) ?? []).length === 1,
    'A2: no duplicate person1',
  )
  console.log('PASS  A2: two-person placeholder')
}

{
  const { transformed } = blocksFrom([
    { id: 'legal', text: 'Prawa autorskie przysługują Wykonawcy.' },
    { id: 'p0', text: 'Zamawiający: PLACEHOLDER_STRONY.' },
  ])
  const repaired = repairCanonicalPartyPlaceholders({
    blocks: transformed,
    dataset: dataset(1),
  })
  assert(
    repaired.blocks.find((b) => b.blockId === 'legal')?.text ===
      'Prawa autorskie przysługują Wykonawcy.',
    'A3: unrelated legal untouched',
  )
  console.log('PASS  A3: party repair does not touch unrelated legal')
}

{
  // Gate fail-closed when placeholder remains (no displayNames)
  const { source, transformed } = blocksFrom([
    { id: 'p0', text: 'zawarta z PLACEHOLDER_STRONY.' },
  ])
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: {
      ...dataset(1),
      clients: { personCount: 1, displayNames: '' },
    },
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
  assert(!gate.downloadAllowed, 'A4: unresolved party placeholder blocks Mode A')
  assert(
    gate.report.blockingIssues.some((i) => i.code === 'unresolved_party_placeholder'),
    'A4: unresolved_party_placeholder code',
  )
  console.log('PASS  A4: Mode A blocks unresolved party placeholder')
}

// ========== B. BLOCK ID ==========
{
  const sourceIds = ['para-0', 'para-1', 'table-0-row-1-cell-1-p-0', 'para-12']
  const part = partitionChangedBlocksBySourceIds({
    sourceBlockIds: sourceIds,
    changedBlocks: [
      { blockId: 'para-0', text: 'ok' },
      { blockId: 'para-11', text: 'invented' },
      { blockId: 'para-12', text: 'ok2' },
    ],
  })
  assert(part.valid.map((v) => v.blockId).join(',') === 'para-0,para-12', 'B1: valid kept')
  assert(part.invalid.map((v) => v.blockId).join(',') === 'para-11', 'B1: invalid isolated')
  const applied = applySparseBlockChanges(
    sourceIds.map((id, i) => ({
      blockId: id,
      paragraphIndex: i,
      text: `src-${id}`,
      kind: 'paragraph' as const,
    })),
    part.valid,
  )
  assert(applied.ok, 'B1: apply valid only')
  if (applied.ok) {
    assert(
      applied.blocks.find((b) => b.blockId === 'para-1')?.text === 'src-para-1',
      'B1: untouched neighbor (no fuzzy para-11→para-12)',
    )
    assert(
      applied.blocks.find((b) => b.blockId === 'para-12')?.text === 'ok2',
      'B1: valid para-12 applied',
    )
  }
  console.log('PASS  B1: invalid para-11 cannot mutate; no neighbor remap')
}

{
  const schema = buildFullAiJsonSchemaForBlockIds(['para-0', 'para-12'])
  const props = schema.schema.properties as {
    changedBlocks: {
      items: { properties: { blockId: { enum?: string[] } } }
    }
  }
  const blockId = props.changedBlocks.items.properties.blockId
  assert(Array.isArray(blockId.enum), 'B2: enum present')
  assert(blockId.enum!.includes('para-0') && blockId.enum!.includes('para-12'), 'B2: ids')
  assert(!blockId.enum!.includes('para-11'), 'B2: invented id absent')
  const hint = buildProtocolBlockIdRetryHint({
    invalidBlockIds: ['para-11'],
    allowedBlockIds: ['para-0', 'para-12'],
  })
  assert(hint.includes('para-11') && hint.includes('para-0'), 'B2: retry hint')
  console.log('PASS  B2: schema enum + protocol retry hint')
}

{
  const part = partitionChangedBlocksBySourceIds({
    sourceBlockIds: ['para-0'],
    changedBlocks: [
      { blockId: 'para-0', text: 'a' },
      { blockId: 'para-0', text: 'b' },
    ],
  })
  assert(part.valid.length === 1 && part.invalid.length === 1, 'B3: duplicate handled')
  console.log('PASS  B3: duplicate changedBlock IDs')
}

{
  const source = [
    {
      blockId: 'para-0',
      paragraphIndex: 0,
      text: 'hello',
      kind: 'paragraph' as const,
    },
  ]
  const bad = applySparseBlockChanges(source, [
    { blockId: 'para-11', text: 'x' },
  ])
  assert(!bad.ok && bad.error.code === 'unknown_block_id', 'B4: fail-closed apply')
  console.log('PASS  B4: applySparseBlockChanges fail-closed on unknown id')
}

// ========== C. PAYMENT HEADING ==========
{
  assert(isFinanceSectionHeading('§6 Płatności'), 'C0: § heading')
  assert(isFinanceSectionHeading('§6 Płatności.'), 'C0: § heading dotted')
  assert(!isFinanceSectionHeading('Zadatek 3 780 zł.'), 'C0: body not heading')
  assert(
    !isFinanceSectionHeading('§6 Płatności. Pozostała kwota 9 720 zł.'),
    'C0: heading+amount not pure heading',
  )
  console.log('PASS  C0: heading detector')
}

{
  const { source, transformed } = blocksFrom([
    { id: 'h', text: '§6 Płatności' },
    { id: 'body', text: 'Zadatek PLACEHOLDER_ZADATEK zł.' },
    { id: 'price', text: 'Wynagrodzenie 13 500 zł.' },
  ])
  const repaired = repairCanonicalPaymentAmounts({
    blocks: transformed,
    sourceBlocks: source,
    dataset: dataset(2),
  })
  const heading = repaired.blocks.find((b) => b.blockId === 'h')!.text
  const body = repaired.blocks.find((b) => b.blockId === 'body')!.text
  assert(heading === '§6 Płatności', 'C1: heading unmodified')
  assert(body.includes('3 780 zł'), 'C1: deposit in body')
  // CG7.3: remaining not represented → do not invent onto body/heading
  assert(!body.includes('9 720 zł'), 'C1: remaining not invented')
  assert(!heading.includes('9 720'), 'C1: remaining not on heading')
  console.log('PASS  C1: T06 shape — deposit in body; remaining not invented')
}

{
  const { source, transformed } = blocksFrom([
    { id: 'h', text: '§6 Płatności' },
    { id: 'rodo', text: 'Przetwarzanie danych osobowych zgodnie z RODO.' },
  ])
  const repaired = repairCanonicalPaymentAmounts({
    blocks: transformed,
    sourceBlocks: source,
    dataset: dataset(2),
  })
  assert(
    repaired.blocks.every((b) => b.text === transformed.find((t) => t.blockId === b.blockId)!.text),
    'C2: heading-only neighborhood → fail closed (no mutation)',
  )
  console.log('PASS  C2: heading-only finance neighborhood fails closed')
}

{
  const { source, transformed } = blocksFrom([
    { id: 'p1', text: 'Wynagrodzenie 13 500 zł.' },
    { id: 'p2', text: 'Zadatek 3 780 zł. Pozostała kwota 9 720 zł.' },
  ])
  const repaired = repairCanonicalPaymentAmounts({
    blocks: transformed,
    sourceBlocks: source,
    dataset: dataset(2),
  })
  assert(repaired.repairs.length === 0, 'C3: already correct unchanged')
  console.log('PASS  C3: already-correct payment preserved')
}

console.log('\nAll CG4 reliability regressions passed.')
