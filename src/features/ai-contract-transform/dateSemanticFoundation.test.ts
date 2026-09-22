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

console.log('date semantic foundation tests: PASS')
