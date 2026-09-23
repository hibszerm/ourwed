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
assert.ok(page.includes('useState<SemanticContractGenerationPendingState | null>'))
assert.ok(page.includes('startSemanticContractGeneration'))
assert.ok(page.includes('resumeSemanticContractGeneration'))
assert.ok(page.includes('onCancel={discardSemanticRequirements}'))
assert.equal((page.match(/startSemanticContractGeneration\s*\(/g) ?? []).length, 1, 'page has one initial semantic start call site')
assert.equal((page.match(/<SemanticMissingDataModal\b/g) ?? []).length, 1, 'page renders one aggregate missing-data modal')
const resumeHandler = page.slice(page.indexOf('async function resumeSemanticGeneration()'), page.indexOf('function semanticFailureMessage('))
assert.ok(resumeHandler.includes('resumeSemanticContractGeneration('))
assert.equal(resumeHandler.includes('invokeSemanticMapProvider'), false, 'resume cannot invoke provider transport')
const cancelHandler = page.slice(page.indexOf('function discardSemanticRequirements()'), page.indexOf('async function resumeSemanticGeneration()'))
assert.ok(cancelHandler.includes('setSemanticPendingState(null)'))
assert.ok(cancelHandler.includes("setStep('verify')"))
assert.equal(/localStorage|sessionStorage|indexedDB/i.test(page), false)
assert.equal(/customer(?:Service|Mutation)\.(?:update|upsert)|updateCustomer|updateWedding/.test(page), false)
for (const forbidden of ['WeddingSparseContractGenerationService', 'runSparseProductTransform', 'changedBlocks', 'applyDeterministicRepairs']) {
  assert.equal(page.includes(forbidden), false, `page excludes ${forbidden}`)
}
assert.equal(/WeddingContractGenerationService\.generate\s*\(/.test(page), false)
assert.ok(page.includes('resolveEmptyValuesFromWedding: false'))
assert.ok(page.includes('saveGeneratedContract('))
assert.ok(page.includes('markContractGenerated('))
assert.ok(page.includes('ContractDocxPreview'))
assert.ok(page.includes('detectPaymentSchedule('), 'existing manual payment completion is retained for semantic output')
assert.ok(page.includes("setStep('manual_payment')"))

console.log('PASS semantic missing-data modal and page boundary: one modal, ephemeral state, semantic-only generation, existing save path')
