import assert from 'node:assert/strict'
import { parseSemanticMapResponse } from './semanticMapModelContract'

const base = { sourceBlockId: 'p-1', anchor: '14 sierpnia 2027', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null, dateRole: 'payment_due_date' }
const dependent = { ...base, concept: 'dependent_date', baseDateConcept: 'wedding_date', relation: { direction: 'before', amount: 7, unit: 'calendar_days' } }
const fixed = { ...base, concept: 'fixed_date', anchor: '02.09.2027', baseDateConcept: null, relation: null }
const ambiguous = { ...base, concept: 'ambiguous_date', anchor: '22.09.2027', baseDateConcept: null, relation: null }

for (const mapping of [dependent, fixed, ambiguous]) {
  const result = parseSemanticMapResponse({ semanticMappings: [mapping] })
  assert.equal(result.ok, true)
}

const unsupported = parseSemanticMapResponse({ semanticMappings: [{ ...dependent, relation: { direction: 'before', amount: 1, unit: 'business_days' } }] })
assert.equal(unsupported.ok, false)
for (const concept of ['fixed_date', 'ambiguous_date'] as const) {
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, concept, dateRole: null, baseDateConcept: null, relation: null }] }).ok, true)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, concept, dateRole: null, baseDateConcept: 'wedding_date', relation: null }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...base, concept, dateRole: null, baseDateConcept: null, relation: { direction: 'before', amount: 1, unit: 'calendar_days' } }] }).ok, false)
}
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...dependent, dateRole: null }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...dependent, baseDateConcept: null }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...dependent, relation: null }] }).ok, false)

console.log('date semantic foundation tests: PASS')
