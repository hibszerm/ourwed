import { buildFullAiJsonSchemaForBlockIds, inspectGroundedFinanceEvidence, validateGroundedFinanceEvidence } from './blockIdIntegrity'
import { parseSparseV2ModelPayload } from './sparseResponseSchema'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { runFullAiRewrite } from './transformApi'
import { safeProviderDiagnostic } from './cg2/localFullRewriteInvoke'
import type {
  ContractTransformationDataset,
  ProtectedContractData,
  TransformDocumentBlock,
} from './types'

const assert = (value: boolean, message: string) => {
  if (!value) throw new Error(message)
}

const protectedData: ProtectedContractData = { exactProtectedValues: [], protectedPatterns: [] }
const dataset = (): ContractTransformationDataset => ({
  clients: { displayNames: 'Klient Testowy', personCount: 1 },
  dates: { contractExecutionDate: '01.01.2027', weddingDate: '02.02.2027' },
  locations: {},
  package: {},
  finances: {
    contractValueFormatted: '21 400 zł',
    contractValueWords: 'dwadzieścia jeden tysięcy czterysta złotych',
    depositFormatted: '4 800 zł',
    remainingFormatted: '16 600 zł',
  },
})

function tableBlock(id: string, rowIndex: number, cellIndex: number, text: string): TransformDocumentBlock {
  const row = rowIndex === 1
    ? ['Łączna cena realizacji', 'zakres podstawowy', '16 800,00 zł']
    : rowIndex === 2
      ? ['Pierwsza płatność', 'płatna po zawarciu umowy', '3 500,00 zł']
      : rowIndex === 3
        ? ['Saldo', 'płatne przed wydarzeniem', '13 300,00 zł']
        : ['Inna kwota', 'pozycja pomocnicza', '1 000,00 zł']
  return {
    blockId: id, paragraphIndex: rowIndex * 3 + cellIndex, kind: 'tableCell', text,
    tableContext: { tableIndex: 5, rowIndex, cellIndex, ownershipFamily: 'unknown', rowLabelText: row[0], neighboringCellTexts: row },
  }
}

function source(withSecondCandidate = false): TransformDocumentBlock[] {
  return [
    { blockId: 'para-semantic', paragraphIndex: 0, kind: 'paragraph', text: 'Ta opłata potwierdza rezerwację terminu.' },
    tableBlock('total-label', 1, 0, 'Łączna cena realizacji'),
    tableBlock('total-detail', 1, 1, 'zakres podstawowy'),
    tableBlock('total-value', 1, 2, '16 800,00 zł'),
    tableBlock('payment-label', 2, 0, 'Pierwsza płatność'),
    tableBlock('payment-detail', 2, 1, 'płatna po zawarciu umowy'),
    tableBlock('payment-value', 2, 2, '3 500,00 zł'),
    tableBlock('remaining-label', 3, 0, 'Saldo'),
    tableBlock('remaining-detail', 3, 1, 'płatne przed wydarzeniem'),
    tableBlock('remaining-value', 3, 2, '13 300,00 zł'),
    ...(withSecondCandidate ? [tableBlock('other-value', 4, 2, '1 000,00 zł')] : []),
  ]
}

async function runModelStylePipeline(blocks: TransformDocumentBlock[], financeEvidence: unknown[]) {
  const result = await runFullAiRewrite({
    runId: 'grounded-finance-evidence-test',
    documentBlocks: blocks,
    transformationDataset: dataset(),
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => ({
      data: { ok: true, changedBlocks: [], financeEvidence, model: 'simulated' },
      error: null,
    }),
  })
  assert(result.ok, 'schema-valid simulated response accepted')
  if (!result.ok) throw new Error(result.error.message)
  return runPostReconstructionQualityGate({
    sourceBlocks: blocks,
    transformedBlocks: result.transformedBlocks,
    dataset: dataset(),
    protectedData,
    mode: 'full_ai',
    financeEvidence: result.financeEvidence,
    financeEvidenceDiagnostics: result.financeEvidenceDiagnostics,
  })
}

// A–F: parser/schema and grounding are independent from sparse mutations.
{
  const strictSchema = buildFullAiJsonSchemaForBlockIds(['source-a']).schema as Record<string, any>
  assert(strictSchema.required.includes('financeEvidence'), 'financeEvidence is top-level required')
  assert(Array.isArray(strictSchema.properties.financeEvidence.type) && strictSchema.properties.financeEvidence.type.includes('null'), 'financeEvidence accepts null')
  const validArray = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: [{ sourceBlockId: 'source-a', financeConcept: 'deposit' }] })
  assert(validArray.ok && validArray.financeEvidence.length === 1, 'valid finance evidence array accepted')
  const nullEvidence = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: null })
  assert(nullEvidence.ok && nullEvidence.financeEvidence.length === 0, 'null finance evidence normalizes to empty')
  const extraField = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: [{ sourceBlockId: 'source-a', financeConcept: 'deposit', amount: 4800 }] })
  assert(!extraField.ok, 'finance evidence amount is rejected')
  const badConcept = parseSparseV2ModelPayload('full_ai_trusted_rewrite', { changedBlocks: [], financeEvidence: [{ sourceBlockId: 'source-a', financeConcept: 'installment' }] })
  assert(!badConcept.ok, 'unsupported finance concept is rejected')
  const diagnostic = safeProviderDiagnostic(400, { error: { type: 'invalid_request_error', message: 'schema rejected; Authorization: secret' }, request: 'document text' })
  assert(diagnostic.includes('400') && diagnostic.includes('invalid_request_error'), 'safe 4xx diagnostic retains status/type')
  assert(!diagnostic.includes('Authorization') && !diagnostic.includes('document text'), 'safe 4xx diagnostic excludes secrets and payload')
}

{
  const blocks = source()
  const gate = await runModelStylePipeline(blocks, [{ sourceBlockId: 'para-semantic', financeConcept: 'deposit' }])
  assert(gate.blocks.some((b) => b.blockId === 'payment-value' && /4 800/.test(b.text)), 'semantic prose repairs only canonical CRM deposit')
  assert(gate.blocks.some((b) => b.blockId === 'total-value' && /21 400/.test(b.text)), 'total remains canonical')
  assert(gate.blocks.some((b) => b.blockId === 'remaining-value' && /16 600/.test(b.text)), 'remaining remains canonical')
  assert(gate.blocks.find((b) => b.blockId === 'payment-value')?.originSourceBlockId === 'payment-value', 'provenance reaches repair')
  assert(gate.diagnostics.groundedFinanceEvidence[0]?.outcome === 'accepted', 'accepted grounding diagnostic retained')
  assert(gate.diagnostics.crossSurfaceFinance[0]?.ownershipEstablished === true, 'cross-surface decision retained')
  assert(gate.diagnostics.financeRepairs.some((item) => item.canonicalRole === 'deposit' && item.applied), 'repair diagnostic retained')
  const diagnosticText = JSON.stringify(gate.diagnostics)
  assert(!/authorization|api[_-]?key|bearer|secret|token/i.test(diagnosticText), 'diagnostics contain no secret material')
}

{
  const invalid = parseSparseV2ModelPayload('full_ai_trusted_rewrite', {
    changedBlocks: [],
    financeEvidence: [{ sourceBlockId: 'source-a', financeConcept: 'installment' }],
  })
  assert(!invalid.ok, 'unsupported finance concept rejected by schema')
}

{
  const valid = validateGroundedFinanceEvidence({
    sourceBlockIds: ['source-a'],
    financeEvidence: [{ sourceBlockId: 'source-a', financeConcept: 'deposit' }],
  })
  assert(valid.length === 1, 'valid grounded evidence accepted')
  const unknown = validateGroundedFinanceEvidence({
    sourceBlockIds: ['source-a'],
    financeEvidence: [{ sourceBlockId: 'unknown', financeConcept: 'deposit' }],
  })
  assert(unknown.length === 0, 'unknown source fails closed')
  assert(inspectGroundedFinanceEvidence({ sourceBlockIds: ['source-a'], financeEvidence: [{ sourceBlockId: 'unknown', financeConcept: 'deposit' }] })[0]?.outcome === 'rejected_unknown_source', 'rejected grounding diagnostic retained')
  const contradictory = validateGroundedFinanceEvidence({
    sourceBlockIds: ['source-a'],
    financeEvidence: [
      { sourceBlockId: 'source-a', financeConcept: 'deposit' },
      { sourceBlockId: 'source-a', financeConcept: 'remaining' },
    ],
  })
  assert(contradictory.length === 0, 'contradictory source evidence fails closed')
}

{
  const blocks = source(true)
  const gate = await runModelStylePipeline(blocks, [{ sourceBlockId: 'para-semantic', financeConcept: 'deposit' }])
  assert(gate.blocks.find((b) => b.blockId === 'payment-value')?.text.includes('3 500'), 'two compatible candidates remain unknown')
}

console.log('PASS grounded finance semantic evidence')
