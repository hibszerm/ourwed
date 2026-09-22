import assert from 'node:assert/strict'
import { buildSemanticMapResponseSchema, buildSemanticMapRequest } from './semanticMapModelContract'
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
assert.ok(item.properties.dateRole)
assert.ok(item.properties.baseDateConcept)
assert.ok(item.properties.relation)
assert.ok(item.required.includes('dateRole') && item.required.includes('baseDateConcept') && item.required.includes('relation'))
assert.deepEqual(item.properties.relation.properties && Object.keys(item.properties.relation.properties).sort(), ['amount', 'direction', 'unit'])
assert.deepEqual(item.properties.relation.required, ['direction', 'amount', 'unit'])
assert.deepEqual(item.properties.dateRole.type, ['string', 'null'])
assert.deepEqual(item.properties.baseDateConcept.type, ['string', 'null'])
assert.deepEqual(item.properties.relation.type, ['object', 'null'])

const scenario = buildGoldenScenarios().find((entry) => entry.caseId === 'G02')!
const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-09-22' })
const request = buildSemanticMapRequest({ candidate: 'terra', sourceBlocks: [], dataset })
check(request.text.format.schema)
console.log('strict semantic-map schema tests: PASS')
