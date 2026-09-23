import assert from 'node:assert/strict'
import { buildSemanticMapResponseSchema, buildSemanticMapRequest } from './semanticMapModelContract'
import { DATE_ROLES } from './semanticMapping'
import { buildGoldenScenarios } from './cg7/goldenScenarios'
import { buildContractTransformationDataset } from './transformationDataset'

function check(value: unknown, path = '$') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const row = value as Record<string, unknown>
  if (row.additionalProperties === false) {
    const properties = Object.keys((row.properties ?? {}) as object).sort()
    const required = [...((row.required ?? []) as string[])].sort()
    assert.deepEqual(properties, required, `${path}: properties must equal required`)
  }
  for (const [key, child] of Object.entries(row)) check(child, `${path}.${key}`)
}

const schema = buildSemanticMapResponseSchema()
check(schema)
const item = schema.schema.properties.semanticMappings.items
assert.equal(item.anyOf.length, 3)
for (const variant of item.anyOf) {
  assert.ok(variant.properties.dateRole)
  assert.ok(variant.properties.baseDateConcept)
  assert.ok(variant.properties.relation)
  assert.ok(variant.required.includes('dateRole') && variant.required.includes('baseDateConcept') && variant.required.includes('relation'))
}
const canonicalDateVariant = item.anyOf.find((variant) => variant.properties.concept.enum.includes('deposit_due_date'))!
assert.deepEqual(canonicalDateVariant.properties.dateRole.enum, [null])
assert.deepEqual(canonicalDateVariant.properties.baseDateConcept.enum, [null])
assert.deepEqual(canonicalDateVariant.properties.relation.enum, [null])
const ambiguousDateVariant = item.anyOf.find((variant) => variant.properties.concept.enum.includes('ambiguous_date'))!
assert.deepEqual(ambiguousDateVariant.properties.dateRole.enum, [...DATE_ROLES, null])
assert.deepEqual(ambiguousDateVariant.properties.baseDateConcept.enum, [null])
assert.deepEqual(ambiguousDateVariant.properties.relation.enum, [null])
assert.equal(item.anyOf.some((variant) => variant.properties.concept.enum.includes('dependent_date')), false)
assert.equal(item.anyOf.some((variant) => variant.properties.concept.enum.includes('fixed_date')), false)

const scenario = buildGoldenScenarios().find((entry) => entry.caseId === 'G02')!
const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-09-22' })
const request = buildSemanticMapRequest({ candidate: 'terra', sourceBlocks: [], dataset })
check(request.text.format.schema)
const extrasRequest = buildSemanticMapRequest({
  candidate: 'terra',
  sourceBlocks: [],
  dataset: { ...dataset, additionalServices: [{ name: 'opaque test service' }] },
  extrasAdmissibleRegion: {
    packageDescriptionRegion: { startParagraphIndex: 10, endParagraphIndex: 12 },
    mainContractualBodyRegion: { startParagraphIndex: 10, endParagraphIndex: 40 },
    signatureBoundaryParagraphIndex: 41,
    fallbackBoundaryParagraphIndex: 13,
  },
})
const userContext = JSON.parse(extrasRequest.input[1]!.content) as Record<string, unknown>
assert.deepEqual(userContext.extrasAdmissibleRegion, {
  packageDescriptionRegion: { startParagraphIndex: 10, endParagraphIndex: 12 },
  mainContractualBodyRegion: { startParagraphIndex: 10, endParagraphIndex: 40 },
  signatureBoundaryParagraphIndex: 41,
  fallbackBoundaryParagraphIndex: 13,
}, 'model receives only the explicit structural region metadata')
console.log('strict semantic-map schema tests: PASS')
