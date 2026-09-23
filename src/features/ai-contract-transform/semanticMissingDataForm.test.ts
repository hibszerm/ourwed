import assert from 'node:assert/strict'
import { semanticEmailRequirementLabel, validateSemanticMissingData } from './semanticMissingDataForm'
import type { SemanticGenerationRequirement } from './semanticContractGenerationService'

const requirements: SemanticGenerationRequirement[] = [
  { id: 'date-a', kind: 'date', valueType: 'DATE', label: 'Termin albumu', sourceBlockId: 'para-a', date: { unresolvedDateId: 'date-a', documentStateId: 'state', sourceBlockId: 'para-a', anchor: '12.07.2025', span: { start: 0, end: 10 }, role: 'album_due_date', label: 'Termin albumu', reason: 'unknown_date' } },
  { id: 'date-b', kind: 'date', valueType: 'DATE', label: 'Termin końcowy', sourceBlockId: 'para-b', date: { unresolvedDateId: 'date-b', documentStateId: 'state', sourceBlockId: 'para-b', anchor: '01.08.2025', span: { start: 0, end: 10 }, role: 'other_contractual_date', label: 'Termin końcowy', reason: 'unknown_date' } },
  { id: 'email', kind: 'customer_email', valueType: 'EMAIL', label: 'E-mail klienta', customerIndexes: [1], sourceBlockId: 'para-c' },
]

const emptyErrors = validateSemanticMissingData(requirements, {})
assert.deepEqual(Object.keys(emptyErrors).sort(), ['date-a', 'date-b', 'email'])
const invalidErrors = validateSemanticMissingData(requirements, {
  'date-a': '2027-02-29', 'date-b': '2027-03-04', email: 'not-an-email',
})
assert.deepEqual(Object.keys(invalidErrors), ['date-a', 'email'])
assert.deepEqual(validateSemanticMissingData(requirements, {
  'date-a': '2028-02-29', 'date-b': '2027-03-04', email: 'jan@example.test',
}), {})
assert.equal(semanticEmailRequirementLabel(requirements[2] as Extract<SemanticGenerationRequirement, { kind: 'customer_email' }>, [
  { displayName: 'Anna Kowalska' }, { displayName: 'Jan Nowak' },
]), 'E-mail — Jan Nowak')
assert.equal(semanticEmailRequirementLabel({ ...(requirements[2] as Extract<SemanticGenerationRequirement, { kind: 'customer_email' }>), customerIndexes: [9] }, [{ displayName: 'Anna Kowalska' }]), 'E-mail klienta')

console.log('PASS semantic missing-data form: aggregate required values, strict dates, local email validation, canonical owner labels')
