import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import {
  GENERATION_INSTRUCTIONS,
  GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION,
  SOURCE_OWNERSHIP_MISSING_INPUT_INSTRUCTION,
  applyOptionBGenerationResponse,
  createGenerationSourceView,
  readSource,
} from './generator'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { authorizeMissingInputChoiceOptions } from './generationSession'

const boundary = GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION.toLowerCase()
const missingInputRule = SOURCE_OWNERSHIP_MISSING_INPUT_INSTRUCTION.toLowerCase()
const instructions = GENERATION_INSTRUCTIONS.toLowerCase()

assert.match(boundary, /a source may contain sample wedding facts alongside source-owned stable service-provider or business identity/)
assert.match(boundary, /does not make every concrete source value a placeholder or stale/)
assert.match(boundary, /preserve unchanged concrete source-authored provider\/business identity and permanent business details/)
assert.match(boundary, /unless independent authoritative provider\/business data or an explicit product rule intentionally supersedes that same source fact/)
assert.match(boundary, /do not request those source-owned facts merely because normalized wedding authority does not contain them/)
assert.match(boundary, /current contracting-party identity, event date and locations/)
assert.match(boundary, /contracting-party contact details/)
assert.match(boundary, /a source-authored service-provider or business identity slot is not a wedding-party slot/)
assert.match(missingInputRule, /source-owned stable provider\/business content that should remain is already available/)
assert.match(missingInputRule, /do not request it merely because a wedding-authority field is absent/)
assert.match(instructions, /source-owned content that should remain, normalized authority, authoritative user answers/)
assert.match(instructions, /return missing_input only when the source contract clearly establishes a fact required for this candidate and that fact is not safely available from source-owned content that should remain/)

// The offline source deliberately mixes sample transaction values and stable
// provider content to make the ownership distinction explicit in the fixture.
const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const zip = new JSZip()
zip.file('[Content_Types].xml', '<Types/>')
zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('Client: Sample Client')}${paragraph('Provider name: PROVIDER_A; company: COMPANY_A; business address: ADDRESS_A; tax and registration identifiers: IDENTIFIERS_A; permanent email and phone: CONTACT_A; bank details: PAYMENT_ACCOUNT_A.')}${paragraph('Event: Sample date and locations.')}${paragraph('Ordinary source legal terms.') }<w:sectPr/></w:body></w:document>`)
const sourceBytes = await zip.generateAsync({ type: 'arraybuffer' })
const source = await readSource(sourceBytes, 'mixed-source-fixture.docx')
const view = createGenerationSourceView(source)

const fixture = JSON.parse(await readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json', import.meta.url), 'utf8')) as {
  authoritativeInput: ContractGenerationInputOptions
}
const authority = buildContractGenerationInput(fixture.authoritativeInput)
assert.equal(authority.parties.length, 2, 'fixture has two current party candidates for one source-defined client role')
assert.equal(Object.hasOwn(authority, 'provider'), false, 'current normalized wedding authority has no provider replacement')
assert.equal(Object.hasOwn(authority, 'business'), false, 'current normalized wedding authority has no business replacement')

const sourceClientRoleChoice = {
  status: 'MISSING_INPUT' as const,
  missingInputs: [{
    id: 'exclusive-client-role',
    kind: 'choice' as const,
    label: 'Which party fills the singular client role?',
    options: authority.parties.map((party) => ({ id: party.sourceKey, label: party.fullName!.value })),
  }],
}
const projected = await applyOptionBGenerationResponse(sourceBytes, source, authority, view.sourceBlockIds, sourceClientRoleChoice)
assert.equal(projected.status, 'MISSING_INPUT')
if (projected.status === 'MISSING_INPUT') {
  assert.deepEqual(projected.missingInputs, sourceClientRoleChoice.missingInputs, 'server does not derive additional provider requirements')
  assert.equal(projected.missingInputs.some((item) => item.label.toLowerCase().includes('provider')), false)
}

const enrichedChoice = authorizeMissingInputChoiceOptions(
  sourceClientRoleChoice.missingInputs,
  authority.parties.map((party) => ({ key: party.sourceKey, label: party.fullName!.value })),
  () => `opaque-${crypto.randomUUID()}`,
)
assert.ok(enrichedChoice)
assert.deepEqual(enrichedChoice?.missingInputs[0]?.kind === 'choice' ? enrichedChoice.missingInputs[0].options.map((option) => option.label) : [], authority.parties.map((party) => party.fullName!.value), 'choice enrichment exposes exactly normalized authoritative party candidates')
assert.equal(enrichedChoice?.missingInputs[0]?.kind === 'choice' ? enrichedChoice.missingInputs[0].options.every((option) => option.id.startsWith('opaque-')) : false, true, 'choice IDs are server-issued opaque IDs')

assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /source-authored service-provider or business identity slot is not a wedding-party slot/i)
assert.equal(source.blocks.some((block) => block.text.includes('PAYMENT_ACCOUNT_A')), true, 'the mixed source fixture contains populated stable provider/business details')
assert.equal(source.blocks.some((block) => /Sample date and locations/.test(block.text)), true, 'the same source fixture contains sample wedding transaction data')

console.log('PASS generic source-owned provider preservation policy acceptance (offline; no model inference)')
