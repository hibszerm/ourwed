import assert from 'node:assert/strict'
import { DATE_ROLES } from './semanticMapping'
import { SEMANTIC_MAP_SYSTEM_PROMPT, buildSemanticMapResponseSchema, parseSemanticMapResponse } from './semanticMapModelContract'
import { GOLDEN_SUPPLIED_DATE_VALUES } from './cg7/goldenSuppliedDateValues.fixture'

const schema = buildSemanticMapResponseSchema()
const variants = schema.schema.properties.semanticMappings.items.anyOf
assert.equal(variants.length, 3)
for (const variant of variants) {
  assert.equal(variant.additionalProperties, false)
  assert.deepEqual(Object.keys(variant.properties).sort(), [...variant.required].sort())
  for (const required of ['sourceBlockId', 'startTokenId', 'endTokenId', 'concept', 'customerIndex', 'customerIndexes', 'nameForm', 'dateRole', 'baseDateConcept', 'relation']) {
    assert(variant.required.includes(required))
  }
  assert.equal('anchor' in variant.properties, false)
  assert.equal('occurrence' in variant.properties, false)
}
const ambiguous = variants.find((variant) => variant.properties.concept.enum.includes('ambiguous_date'))!
assert.deepEqual(ambiguous.properties.dateRole.enum, [...DATE_ROLES, null])
assert(SEMANTIC_MAP_SYSTEM_PROMPT.includes('startTokenId and endTokenId are inclusive'))
assert(SEMANTIC_MAP_SYSTEM_PROMPT.includes('Never transcribe source text into the response'))
assert(SEMANTIC_MAP_SYSTEM_PROMPT.includes('use other_contractual_date only when no supported specific role fits'))
assert(DATE_ROLES.includes('album_due_date'))
assert.equal(GOLDEN_SUPPLIED_DATE_VALUES.find((item) => item.goldenId === 'G04' && item.sourceBlockId === 'table-4-row-5-cell-3-p-0')?.role, 'album_due_date')

const base = {
  sourceBlockId: 'p', startTokenId: 't0', endTokenId: 't1', concept: 'customer_1_name',
  customerIndex: 0, customerIndexes: null, nameForm: 'BASE', dateRole: null, baseDateConcept: null, relation: null,
}
const parsed = parseSemanticMapResponse({ semanticMappings: [base] })
assert(parsed.ok)
assert.equal(Object.hasOwn(parsed.semanticMappings[0]!, 'anchor'), false)
assert.equal(Object.hasOwn(parsed.semanticMappings[0]!, 'occurrence'), false)
assert.equal(Object.hasOwn(parsed.semanticMappings[0]!, 'customerIndex'), false, 'redundant matching name index normalizes')
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, customerIndex: 1 }] }).ok, false, 'contradictory name index rejects')
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, customerIndexes: [0, 1], customerIndex: null }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, anchor: 'source text' }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, occurrence: 0 }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, endTokenId: undefined }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, dateRole: 'album_due_date' }] }).ok, false, 'name date metadata rejects')

const date = { ...base, concept: 'ambiguous_date', customerIndex: null, nameForm: null, dateRole: 'album_due_date' }
assert.equal(parseSemanticMapResponse({ semanticMappings: [date] }).ok, true)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...date, dateRole: 'invented_role' }] }).ok, false)
console.log('semantic map V2 contract tests: PASS')
