import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./SemanticMissingDataModal.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../../../pages/WeddingContractGenerationPage.tsx', import.meta.url), 'utf8')
const modalStyles = await readFile(new URL('./SemanticMissingDataModal.module.css', import.meta.url), 'utf8')

for (const required of [
  "from '@/components/ui/Modal'", 'title="Uzupełnij dane umowy"',
  'props.requirements.map', "requirement.kind === 'date' ? 'date' : 'email'",
  'required', 'props.errors[requirement.id]', "'Generuj'", 'cancelLabel="Anuluj"',
  'initialFocus="panel"', 'busy={props.busy}',
]) assert.ok(component.includes(required), `modal contains ${required}`)
assert.ok(modalStyles.includes('var(--space-'))
assert.ok(modalStyles.includes('var(--color-'))
assert.ok(page.includes('startContractGeneration'))
assert.ok(page.includes('continueContractGeneration'))
assert.ok(page.includes('finalizeContractGeneration'))
assert.ok(!page.includes('recoverContractGeneration'))
assert.ok(page.includes('<ContractGenerationMissingInputForm'))
assert.equal(/startSemanticContractGeneration|resumeSemanticContractGeneration|invokeSemanticMapProvider|buildSemanticContractProductionDataset/.test(page), false)
assert.equal(/customer(?:Service|Mutation)\.(?:update|upsert)|updateCustomer|updateWedding/.test(page), false)
for (const forbidden of ['WeddingSparseContractGenerationService', 'runSparseProductTransform', 'changedBlocks', 'applyDeterministicRepairs']) {
  assert.equal(page.includes(forbidden), false, `page excludes ${forbidden}`)
}
assert.equal(/WeddingContractGenerationService\.generate\s*\(/.test(page), false)
assert.ok(!page.includes('resolveEmptyValuesFromWedding: false'))
assert.ok(page.includes('saveGeneratedContract('))
assert.ok(page.includes('markContractGenerated('))
assert.ok(page.includes('ContractDocxPreview'))
assert.ok(page.includes('downloadAcceptedContractCandidate'))
assert.ok(page.includes('saveGeneratedContract('))
assert.ok(page.includes('markContractGenerated('))

console.log('PASS production missing-data flow uses the authenticated boundary and preserves explicit document save')
