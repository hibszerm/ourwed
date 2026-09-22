import assert from 'node:assert/strict'
import { executeSemanticMappings } from '../semanticMappingExecutor'
import { resolveSemanticMappings } from '../semanticMapping'
import type { ContractTransformationDataset } from '../types'
import { GOLDEN_EVALUATION_NAME_FORM_PAIR_COUNT, resolveGoldenEvaluationNameForm } from './goldenNameFormEvaluationOracle'

const approved = [
  ['Zofia Kalendarzowa', 'GENITIVE', 'Zofii Kalendarzowej'],
  ['Zofia Kalendarzowa', 'INSTRUMENTAL', 'Zofią Kalendarzową'],
  ['Helena Mostowa', 'GENITIVE', 'Heleny Mostowej'],
  ['Adam Mostowy', 'GENITIVE', 'Adama Mostowego'],
  ['Natalia Brzegowa', 'INSTRUMENTAL', 'Natalią Brzegową'],
  ['Filip Brzegowy', 'INSTRUMENTAL', 'Filipem Brzegowym'],
  ['Barbara Atramentowa', 'INSTRUMENTAL', 'Barbarą Atramentową'],
] as const
assert.equal(GOLDEN_EVALUATION_NAME_FORM_PAIR_COUNT, 7)
for (const [canonicalIdentity, nameForm, resolvedIdentity] of approved) {
  assert.equal(resolveGoldenEvaluationNameForm({ canonicalIdentity, nameForm }), resolvedIdentity)
}
assert.equal(resolveGoldenEvaluationNameForm({ canonicalIdentity: 'Unknown Person', nameForm: 'GENITIVE' }), undefined)
assert.equal(resolveGoldenEvaluationNameForm({ canonicalIdentity: 'Zofia Kalendarzowa', nameForm: 'GENITIVE' }), 'Zofii Kalendarzowej')
assert.equal(resolveGoldenEvaluationNameForm({ canonicalIdentity: 'Helena Mostowa', nameForm: 'INSTRUMENTAL' }), undefined, 'known identity with an unapproved form also fails closed')

const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Zofia Kalendarzowa', personCount: 1, customers: [{ displayName: 'Zofia Kalendarzowa' }] },
  dates: { weddingDate: '', contractExecutionDate: '' },
  finances: { contractValueFormatted: '', contractValueWords: '' },
  locations: {},
  package: {},
}
const paragraphXml = '<w:p><w:r><w:t>Old Genitive</w:t></w:r></w:p>'
const sourceParagraphs = [{ blockId: 'name', paragraphXml }]
const grounded = resolveSemanticMappings({
  mappings: [{ sourceBlockId: 'name', concept: 'customer_1_name', anchor: 'Old Genitive', nameForm: 'GENITIVE' }],
  sourceBlocks: sourceParagraphs,
})
assert.equal(grounded.ok, true)
if (!grounded.ok) throw new Error(`test mapping failed to ground: ${grounded.code}`)
const defaultExecution = executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset: dataset, sourceParagraphs })
assert.equal(defaultExecution.ok, false)
if (!defaultExecution.ok) assert.equal(defaultExecution.code, 'unsupported_name_form', 'production/default execution remains fail-closed')
const injectedExecution = executeSemanticMappings({
  resolvedMappings: grounded.mappings,
  canonicalDataset: dataset,
  sourceParagraphs,
  evaluationNameFormResolver: resolveGoldenEvaluationNameForm,
})
assert.equal(injectedExecution.ok, true, 'known Golden name form executes only with explicit resolver injection')
if (injectedExecution.ok) assert.equal(injectedExecution.paragraphs[0]?.paragraphXml, '<w:p><w:r><w:t>Zofii Kalendarzowej</w:t></w:r></w:p>')

const baseGrounded = resolveSemanticMappings({
  mappings: [{ sourceBlockId: 'base', concept: 'customer_1_name', anchor: 'Zofia Kalendarzowa', nameForm: 'BASE' }],
  sourceBlocks: [{ blockId: 'base', paragraphXml: '<w:p><w:r><w:t>Zofia Kalendarzowa</w:t></w:r></w:p>' }],
})
assert.equal(baseGrounded.ok, true)
if (!baseGrounded.ok) throw new Error(`BASE test mapping failed to ground: ${baseGrounded.code}`)
const baseExecution = executeSemanticMappings({
  resolvedMappings: baseGrounded.mappings,
  canonicalDataset: dataset,
  sourceParagraphs: [{ blockId: 'base', paragraphXml: '<w:p><w:r><w:t>Zofia Kalendarzowa</w:t></w:r></w:p>' }],
})
assert.equal(baseExecution.ok, true, 'BASE behavior needs no evaluation resolver')
console.log('PASS closed seven-pair evaluation-only Golden name-form oracle')
