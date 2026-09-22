import { buildFullAiJsonSchemaForBlockIds, inspectGroundedDateEvidence } from './blockIdIntegrity'
import { parseSparseV2ModelPayload } from './sparseResponseSchema'
import { runFullAiRewrite } from './transformApi'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildProtectedContractData } from './protectedContractData'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const protectedData = { exactProtectedValues: [], protectedPatterns: [] }
const dataset = (): ContractTransformationDataset => ({
  clients: { displayNames: 'Klient Testowy', personCount: 1 },
  dates: { contractExecutionDate: '15.06.2026', weddingDate: '12.06.2027' },
  locations: {}, package: {},
  finances: { contractValueFormatted: '21 400 zł', contractValueWords: 'dwadzieścia jeden tysięcy czterysta złotych' },
})
const cell = (blockId: string, text: string, rowIndex: number, ownershipFamily: 'unknown' | 'wedding_date' = 'unknown'): TransformDocumentBlock => ({
  blockId, text, kind: 'tableCell', paragraphIndex: rowIndex, tableIndex: 0, rowIndex, cellIndex: 1,
  tableContext: { tableIndex: 0, rowIndex, cellIndex: 1, ownershipFamily, rowLabelText: 'Wartość', columnHeaderText: 'Termin', neighboringCellTexts: ['Wartość', text] },
})

async function invoke(blocks: TransformDocumentBlock[], response: Record<string, unknown>) {
  let calls = 0
  const result = await runFullAiRewrite({
    runId: 'grounded-date-evidence-test', documentBlocks: blocks, transformationDataset: dataset(),
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => { calls += 1; return { data: { ok: true, ...response }, error: null } },
  })
  assert(calls === 1, 'semantic evidence validation does not invoke/retry the provider again')
  assert(result.ok, 'simulated sparse response accepted')
  if (!result.ok) throw new Error(result.error.message)
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: blocks, transformedBlocks: result.transformedBlocks, dataset: dataset(), protectedData, mode: 'full_ai',
    financeEvidence: result.financeEvidence, financeEvidenceDiagnostics: result.financeEvidenceDiagnostics,
    dateEvidence: result.dateEvidence, dateEvidenceDiagnostics: result.dateEvidenceDiagnostics,
  })
  return { result, gate }
}

const requiredSchema = buildFullAiJsonSchemaForBlockIds(['w', 'e']).schema as Record<string, any>
assert(requiredSchema.required.includes('dateEvidence'), 'dateEvidence is required at top level')
assert(requiredSchema.additionalProperties === false, 'root remains strict')
const dateSchema = requiredSchema.properties.dateEvidence
assert(dateSchema.type.includes('null'), 'dateEvidence accepts null')
assert(dateSchema.items.additionalProperties === false, 'date evidence item is strict')
assert(dateSchema.items.required.join(',') === 'sourceBlockId,dateConcept', 'date evidence requires exactly its two metadata fields')
assert(dateSchema.items.properties.dateConcept.enum.join(',') === 'wedding_date,execution_date', 'date concepts are constrained')
const nullParsed = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: null, dateEvidence: null })
assert(nullParsed.ok && nullParsed.dateEvidence.length === 0, 'dateEvidence null normalizes to empty')
const validParsed = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'w', dateConcept: 'wedding_date' }] })
assert(validParsed.ok && validParsed.dateEvidence[0]?.dateConcept === 'wedding_date', 'valid date evidence parses')
assert(!parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'w', dateConcept: 'wedding_date', dateValue: '01.01.2000' }] }).ok, 'model cannot provide/override date values')
assert(!parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'w', dateConcept: 'delivery_date' }] }).ok, 'unsupported date concepts rejected')

const dateBlocks = [cell('wedding-value', '01.01.2025', 1), cell('execution-value', '02.02.2025', 2)]
const grounded = inspectGroundedDateEvidence({ dateEvidence: [
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
  { sourceBlockId: 'execution-value', dateConcept: 'execution_date' },
], sourceBlocks: dateBlocks })
assert(grounded.every((item) => item.outcome === 'accepted'), 'both distinct date roles ground to source value cells')
const invalidSurface = inspectGroundedDateEvidence({ dateEvidence: [{ sourceBlockId: 'execution-value', dateConcept: 'wedding_date' }], sourceBlocks: [{ blockId: 'execution-value', paragraphIndex: 0, kind: 'paragraph', text: 'Termin umowy' }] })
assert(invalidSurface[0]?.outcome === 'rejected_invalid', 'non-date source text is not treated as a date-value surface')
const ambiguousSurface = inspectGroundedDateEvidence({ dateEvidence: [{ sourceBlockId: 'two-dates', dateConcept: 'wedding_date' }], sourceBlocks: [{ blockId: 'two-dates', paragraphIndex: 0, kind: 'paragraph', text: 'Data umowy 01.01.2025; termin uroczystości 02.02.2025' }] })
assert(ambiguousSurface[0]?.outcome === 'rejected_ambiguous', 'multiple date values in one source block fail closed')
const emptyValueCell = inspectGroundedDateEvidence({ dateEvidence: [{ sourceBlockId: 'empty-date', dateConcept: 'wedding_date' }], sourceBlocks: [cell('empty-date', '', 4)] })
assert(emptyValueCell[0]?.outcome === 'accepted', 'structurally positioned empty table value cell may be grounded')
const both = await invoke(dateBlocks, { changedBlocks: [], financeEvidence: null, dateEvidence: [
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
  { sourceBlockId: 'execution-value', dateConcept: 'execution_date' },
] })
assert(both.gate.blocks.find((block) => block.blockId === 'wedding-value')?.text === '12.06.2027', 'wedding date repaired from CRM with source style')
assert(both.gate.blocks.find((block) => block.blockId === 'execution-value')?.text === '15.06.2026', 'execution date repaired from CRM with source style')
assert(both.gate.diagnostics.dateEvidence.length === 2 && both.gate.diagnostics.dateEvidence.every((item) => item.outcome === 'accepted' && item.evidenceSource === 'model_semantic' && item.repairApplied && item.postRepairClassification === 'canonical'), 'accepted date evidence and repair outcomes are traced')

const unknown = await invoke(dateBlocks, { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'unknown', dateConcept: 'wedding_date' }] })
assert(unknown.gate.diagnostics.dateEvidence[0]?.outcome === 'rejected_unknown_source', 'unknown ID rejected without retry')

const duplicate = await invoke(dateBlocks, { changedBlocks: [], financeEvidence: null, dateEvidence: [
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
] })
assert(duplicate.gate.diagnostics.dateEvidence.filter((item) => item.outcome === 'accepted').length === 1, 'identical duplicate semantic evidence coalesced')

const conflicting = await invoke(dateBlocks, { changedBlocks: [], financeEvidence: null, dateEvidence: [
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
  { sourceBlockId: 'wedding-value', dateConcept: 'execution_date' },
] })
assert(conflicting.gate.diagnostics.dateEvidence.every((item) => item.outcome === 'rejected_contradiction'), 'one source block with conflicting roles fails closed')
assert(conflicting.gate.report.blockingIssues.some((issue) => issue.code === 'date_evidence_conflict'), 'contradictory date roles block quality gate')

const competing = await invoke(dateBlocks, { changedBlocks: [], financeEvidence: null, dateEvidence: [
  { sourceBlockId: 'wedding-value', dateConcept: 'wedding_date' },
  { sourceBlockId: 'execution-value', dateConcept: 'wedding_date' },
] })
assert(competing.gate.diagnostics.dateEvidence.every((item) => item.outcome === 'rejected_ambiguous'), 'multiple source candidates for one date role fail closed')
assert(competing.gate.report.blockingIssues.some((issue) => issue.code === 'date_evidence_ambiguous'), 'ambiguous semantic date candidates block quality gate')

const lexicalWedding = [cell('lex-wedding', '03.03.2025', 1, 'wedding_date')]
const agreement = await invoke(lexicalWedding, { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'lex-wedding', dateConcept: 'wedding_date' }] })
assert(agreement.gate.diagnostics.dateEvidence[0]?.outcome === 'accepted', 'lexical and semantic date evidence agreeing is accepted')

const lexicalExecution = [{ blockId: 'lex-execution', paragraphIndex: 0, kind: 'paragraph' as const, text: 'Data zawarcia umowy: 10.10.2025' }]
const disagreement = await invoke(lexicalExecution, { changedBlocks: [], financeEvidence: null, dateEvidence: [{ sourceBlockId: 'lex-execution', dateConcept: 'wedding_date' }] })
assert(disagreement.gate.diagnostics.dateEvidence[0]?.outcome === 'rejected_contradiction', 'lexical/semantic conflict is not silently overridden')
assert(disagreement.gate.report.blockingIssues.some((issue) => issue.code === 'date_evidence_conflict'), 'lexical/semantic conflict is fail-closed')
assert(disagreement.gate.blocks[0]?.text === lexicalExecution[0]?.text, 'conflicting date role is not deterministically repaired')

const removed = await invoke([cell('removed-wedding', '04.04.2025', 1)], {
  changedBlocks: [{ blockId: 'removed-wedding', text: '—' }], financeEvidence: null,
  dateEvidence: [{ sourceBlockId: 'removed-wedding', dateConcept: 'wedding_date' }],
})
assert(removed.gate.blocks.find((block) => block.blockId === 'removed-wedding')?.text === '12.06.2027', 'semantic evidence restores date removed by model from CRM')

const noChangedBlock = await invoke([cell('unmodified-stale-wedding', '05.05.2025', 1)], {
  changedBlocks: [], financeEvidence: null,
  dateEvidence: [{ sourceBlockId: 'unmodified-stale-wedding', dateConcept: 'wedding_date' }],
})
assert(noChangedBlock.gate.blocks.find((block) => block.blockId === 'unmodified-stale-wedding')?.text === '12.06.2027', 'semantic evidence repairs stale source even without changedBlocks entry')

const noNetworkSparseChange = await invoke([cell('sparse', '06.06.2025', 1)], {
  changedBlocks: [{ blockId: 'sparse', text: '07.07.2025' }], financeEvidence: null,
  dateEvidence: [{ sourceBlockId: 'sparse', dateConcept: 'wedding_date' }],
})
assert(noNetworkSparseChange.result.changedBlockCount === 1, 'changedBlocks sparse count and application semantics remain unchanged')
assert(noNetworkSparseChange.gate.blocks.find((block) => block.blockId === 'sparse')?.text === '12.06.2027', 'date role selects location only; system supplies canonical value')

console.log('PASS grounded semantic date evidence')
