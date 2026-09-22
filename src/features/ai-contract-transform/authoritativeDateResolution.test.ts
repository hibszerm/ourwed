import assert from 'node:assert/strict'
import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { buildGoldenScenarios } from './cg7/goldenScenarios'
import { buildContractTransformationDataset } from './transformationDataset'
import { parseSemanticMapResponse } from './semanticMapModelContract'
import { resolveSemanticMappings, type SemanticMapping } from './semanticMapping'
import { executeSemanticMappings } from './semanticMappingExecutor'
import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const source = (blockId: string, text: string) => ({ blockId, paragraphXml: p(text) })
const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G02')!
const strictDateResponse = parseSemanticMapResponse({ semanticMappings: [{
  sourceBlockId: 'strict-date',
  concept: 'delivery_due_date',
  anchor: '01.12.2027',
  occurrence: null,
  customerIndex: null,
  customerIndexes: null,
  nameForm: null,
  dateRole: null,
  baseDateConcept: null,
  relation: null,
}] })
assert.equal(strictDateResponse.ok, true)
if (strictDateResponse.ok) {
  assert.equal(resolveSemanticMappings({ mappings: strictDateResponse.semanticMappings, sourceBlocks: [source('strict-date', '01.12.2027')] }).ok, true)
}
const wedding = {
  ...scenario.wedding,
  date: '2027-08-14',
  finalPaymentTerms: { mode: 'days_after_wedding', value: 24 } as const,
  finalPaymentDueDate: null,
  deliveryMonths: 3,
  deliveryDays: null,
  deliveryDueDate: null,
  deliveryDueSource: null,
}
const dataset = buildContractTransformationDataset({
  wedding,
  package: scenario.package,
  extras: scenario.extras,
  currentDate: '2027-05-10',
})

function execute(mappings: SemanticMapping[], sources: Array<{ blockId: string; paragraphXml: string }>, canonicalDataset = dataset) {
  const grounded = resolveSemanticMappings({ mappings, sourceBlocks: sources })
  if (!grounded.ok) return { grounding: grounded, execution: null }
  return {
    grounding: grounded,
    execution: executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset, sourceParagraphs: sources }),
  }
}

function outputText(result: ReturnType<typeof execute>, blockId: string): string {
  assert.ok(result.execution?.ok)
  const paragraph = result.execution.paragraphs.find((entry) => entry.blockId === blockId)
  assert.ok(paragraph)
  return extractCanonicalParagraphText(paragraph.paragraphXml)
}

function dateMapping(sourceBlockId: string, concept: SemanticMapping['concept'], anchor: string, dateRole?: string): SemanticMapping {
  return {
    sourceBlockId,
    concept,
    anchor,
    ...(['dependent_date', 'fixed_date', 'ambiguous_date'].includes(concept) ? { dateRole: dateRole as never } : {}),
  } as SemanticMapping
}

const weddingDate = execute([dateMapping('wedding', 'wedding_date', '02.10.2027')], [source('wedding', '02.10.2027')])
assert.equal(outputText(weddingDate, 'wedding'), '14.08.2027')

const executionDate = execute([dateMapping('execution', 'execution_date', '20.09.2026')], [source('execution', '20.09.2026')])
assert.equal(outputText(executionDate, 'execution'), '10.05.2027')

const finalPaymentDate = execute([dateMapping('final', 'final_payment_due_date', '20.09.2026')], [source('final', '20.09.2026')])
assert.equal(outputText(finalPaymentDate, 'final'), '07.09.2027')
const storedFinalPaymentDataset = buildContractTransformationDataset({
  wedding: { ...wedding, finalPaymentDueDate: '2027-09-11' },
  package: scenario.package,
  currentDate: '2027-05-10',
})
assert.equal(storedFinalPaymentDataset.dates.finalPaymentDueDate, '11.09.2027 r.')

const deliveryDate = execute([dateMapping('delivery', 'delivery_due_date', '20.09.2026')], [source('delivery', '20.09.2026')])
assert.equal(outputText(deliveryDate, 'delivery'), '14.11.2027')
const storedDeliveryDataset = buildContractTransformationDataset({
  wedding: { ...wedding, deliveryDueDate: '2027-12-01' },
  package: scenario.package,
  currentDate: '2027-05-10',
})
assert.equal(storedDeliveryDataset.dates.deliveryDueDate, '01.12.2027 r.')

const depositDate = execute([
  dateMapping('source-execution', 'execution_date', '20.09.2026'),
  dateMapping('source-execution-repeat', 'execution_date', '20.09.2026'),
  dateMapping('source-deposit', 'deposit_due_date', '27.09.2026'),
], [source('source-execution', '20.09.2026'), source('source-execution-repeat', '20.09.2026'), source('source-deposit', '27.09.2026')])
assert.equal(outputText(depositDate, 'source-deposit'), '17.05.2027')

const g02TargetDataset = buildContractTransformationDataset({
  wedding: scenario.wedding,
  package: scenario.package,
  extras: scenario.extras,
  currentDate: '2026-11-05',
})
const g02Deposit = execute([
  dateMapping('g02-execution', 'execution_date', '4 marca 2027 roku'),
  dateMapping('g02-deposit', 'deposit_due_date', 'do 7 marca 2027'),
], [
  source('g02-execution', 'Umowę zawarto 4 marca 2027 roku.'),
  source('g02-deposit', 'Zadatek należy wpłacić do 7 marca 2027.'),
], g02TargetDataset)
assert.equal(g02Deposit.execution?.ok, true)
assert.equal(outputText(g02Deposit, 'g02-deposit'), 'Zadatek należy wpłacić 8 listopada 2026.')
assert.equal(parseFlexibleDate('8 listopada 2026'), '2026-11-08')
if (g02Deposit.execution?.ok) {
  assert.equal('requiresUserInputDates' in g02Deposit.execution, false)
}

for (const [role, anchor] of [['brief_due_date', '02.09.2027'], ['album_due_date', '22.12.2027']] as const) {
  const unresolved = execute([dateMapping('unresolved', 'ambiguous_date', anchor, role)], [source('unresolved', anchor)])
  assert.equal(unresolved.execution?.ok, false)
  if (unresolved.execution && !unresolved.execution.ok) {
    assert.equal(unresolved.execution.code, 'requires_user_input')
    assert.equal(unresolved.execution.requiresUserInputDates[0]?.sourceBlockId, 'unresolved')
    assert.equal(unresolved.execution.requiresUserInputDates[0]?.anchor, anchor)
  }
}

const unknownDate = execute([dateMapping('unknown', 'ambiguous_date', '19.01.2028', 'other_contractual_date')], [source('unknown', '19.01.2028')])
assert.equal(unknownDate.execution?.ok, false)
if (unknownDate.execution && !unknownDate.execution.ok) {
  assert.equal(unknownDate.execution.code, 'requires_user_input')
  assert.equal(unknownDate.execution.requiresUserInputDates[0]?.role, 'other_contractual_date')
}

const multiple = execute([
  dateMapping('brief', 'ambiguous_date', '02.09.2027', 'brief_due_date'),
  dateMapping('album', 'ambiguous_date', '22.12.2027', 'album_due_date'),
], [source('brief', '02.09.2027'), source('album', '22.12.2027')])
assert.equal(multiple.execution?.ok, false)
if (multiple.execution && !multiple.execution.ok) {
  assert.equal(multiple.execution.code, 'requires_user_input')
  assert.deepEqual(multiple.execution.requiresUserInputDates.map((item) => item.sourceBlockId), ['brief', 'album'])
}

const unsupportedBusinessDay = execute([
  dateMapping('execution', 'execution_date', '20.09.2026'),
  dateMapping('deposit', 'ambiguous_date', '27.09.2026', 'payment_due_date'),
], [source('execution', '20.09.2026'), source('deposit', 'due within business days: 27.09.2026')])
assert.equal(unsupportedBusinessDay.execution?.ok, false)
if (unsupportedBusinessDay.execution && !unsupportedBusinessDay.execution.ok) assert.equal(unsupportedBusinessDay.execution.code, 'requires_user_input')

const missingExecution = execute([dateMapping('deposit', 'deposit_due_date', '27.09.2026')], [source('deposit', '27.09.2026')])
assert.equal(missingExecution.execution?.ok, false)
if (missingExecution.execution && !missingExecution.execution.ok) assert.equal(missingExecution.execution.code, 'requires_user_input')

const ungrounded = resolveSemanticMappings({
  mappings: [dateMapping('absent-source', 'ambiguous_date', '22.09.2027', 'schedule_confirmation_date')],
  sourceBlocks: [],
})
assert.equal(ungrounded.ok, false)
if (!ungrounded.ok) assert.equal(ungrounded.code, 'unknown_source')

const invalidProtocol = parseSemanticMapResponse({ semanticMappings: [], extra: true })
assert.equal(invalidProtocol.ok, false)

const fixedLiteral = execute([dateMapping('fixed', 'fixed_date', '02.09.2027', 'brief_due_date')], [source('fixed', '02.09.2027')])
assert.equal(fixedLiteral.execution?.ok, false)
if (fixedLiteral.execution && !fixedLiteral.execution.ok) assert.equal(fixedLiteral.execution.code, 'requires_user_input')

console.log('authoritative date resolution tests: PASS')
