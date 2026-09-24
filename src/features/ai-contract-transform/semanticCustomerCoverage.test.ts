import assert from 'node:assert/strict'
import { resolveSemanticMappings } from './semanticMapping'
import { indexSemanticSourceTokens } from './semanticSourceTokens'
import { validateSemanticCustomerCoverage, type ParsedSemanticMapResponse } from './semanticMapModelContract'
import type { TransformDocumentBlock } from './types'

const block: TransformDocumentBlock = {
  blockId: 'party', paragraphIndex: 0, kind: 'paragraph',
  text: 'Anna Kowalska i Jan Nowak; Anna Kowalska',
}
const paragraph = { blockId: block.blockId, paragraphXml: `<w:p><w:r><w:t>${block.text}</w:t></w:r></w:p>` }
const tokens = indexSemanticSourceTokens(block)
function range(text: string, occurrence = 0) {
  let at = -1
  for (let count = 0; count <= occurrence; count++) at = block.text.indexOf(text, at + 1)
  assert(at >= 0)
  const start = tokens.find((token) => token.start === at)!
  const end = tokens.find((token) => token.end === at + text.length)!
  return { sourceBlockId: block.blockId, startTokenId: start.id, endTokenId: end.id }
}
const anna1 = range('Anna Kowalska')
const jan = range('Jan Nowak')
const anna2 = range('Anna Kowalska', 1)
const mapping = (surface: ReturnType<typeof range>, concept: 'customer_1_name' | 'customer_2_name') => {
  const start = tokens.find((token) => token.id === surface.startTokenId)!.start
  const end = tokens.find((token) => token.id === surface.endTokenId)!.end
  const anchor = block.text.slice(start, end)
  let occurrence = 0
  for (let at = block.text.indexOf(anchor); at >= 0 && at < start; at = block.text.indexOf(anchor, at + 1)) occurrence++
  return { sourceBlockId: surface.sourceBlockId, anchor, occurrence, concept, nameForm: 'BASE' as const }
}
const resolve = (mappings: ReturnType<typeof mapping>[]) => {
  const grounded = resolveSemanticMappings({ mappings, sourceBlocks: [paragraph] })
  assert(grounded.ok, JSON.stringify(grounded))
  return grounded.mappings
}
const coverage = (first: Array<ReturnType<typeof range>>, second: Array<ReturnType<typeof range>> = [jan]): ParsedSemanticMapResponse['customerCoverage'] => [
  { concept: 'customer_1_name', status: first.length ? 'complete' : 'absent', surfaces: first },
  { concept: 'customer_2_name', status: second.length ? 'complete' : 'absent', surfaces: second },
  { concept: 'customer_address', status: 'absent', surfaces: [] },
  { concept: 'customer_phone', status: 'absent', surfaces: [] },
  { concept: 'customer_email', status: 'absent', surfaces: [] },
]
const parsed = (customerCoverage: NonNullable<ParsedSemanticMapResponse['customerCoverage']>, semanticMappings: ParsedSemanticMapResponse['semanticMappings'] = []) => ({
  ok: true as const, semanticMappings, customerCoverage,
})
const validate = (customerCoverage: NonNullable<ParsedSemanticMapResponse['customerCoverage']>, mappings: ReturnType<typeof mapping>[]) =>
  validateSemanticCustomerCoverage({ parsed: parsed(customerCoverage), groundedMappings: resolve(mappings), sourceBlocks: [block], personCount: 2 })

const completeMappings = [mapping(anna1, 'customer_1_name'), mapping(anna2, 'customer_1_name'), mapping(jan, 'customer_2_name')]
assert.equal(validate(coverage([anna1, anna2]), completeMappings).ok, true, 'all declared identity occurrences have exact grounded mappings')
assert.equal(validate(coverage([anna1, anna2]), [mapping(anna1, 'customer_1_name'), mapping(jan, 'customer_2_name')]).ok, false, 'one omitted repeated occurrence fails closed')
assert.equal(validate(coverage([anna1]), [mapping({ ...anna1, endTokenId: anna1.startTokenId }, 'customer_1_name'), mapping(jan, 'customer_2_name')]).ok, false, 'partial token span cannot satisfy complete surface coverage')
assert.equal(validate(coverage([anna1]), [mapping(anna1, 'customer_1_name'), mapping(jan, 'customer_2_name')]).ok, true, 'genuinely absent optional email, phone, and address are allowed')

const stale = coverage([anna1])!
stale[0]!.surfaces = [{ ...anna1, startTokenId: 'stale-token' }]
assert.equal(validate(stale, [mapping(anna1, 'customer_1_name'), mapping(jan, 'customer_2_name')]).ok, false, 'stale token IDs fail closed')
const unresolved = coverage([anna1])!
unresolved[0]!.status = 'partial'
assert.equal(validate(unresolved, [mapping(anna1, 'customer_1_name'), mapping(jan, 'customer_2_name')]).ok, false, 'partial or ambiguous surfaces fail closed')
const missingRequiredName = coverage([])!
assert.equal(validate(missingRequiredName, [mapping(jan, 'customer_2_name')]).ok, false, 'required party identity cannot be declared absent')

const emailBlock: TransformDocumentBlock = { blockId: 'email', paragraphIndex: 1, kind: 'paragraph', text: 'jan@example.test' }
const emailToken = indexSemanticSourceTokens(emailBlock)[0]!
const emailCoverage = coverage([anna1])!
emailCoverage[4] = { concept: 'customer_email', status: 'complete', surfaces: [{ sourceBlockId: 'email', startTokenId: emailToken.id, endTokenId: indexSemanticSourceTokens(emailBlock).at(-1)!.id }] }
const emailGrounded = resolveSemanticMappings({ mappings: [mapping(anna1, 'customer_1_name'), mapping(jan, 'customer_2_name')], sourceBlocks: [paragraph] })
assert(emailGrounded.ok)
assert.equal(validateSemanticCustomerCoverage({ parsed: parsed(emailCoverage), groundedMappings: emailGrounded.mappings, sourceBlocks: [block, emailBlock], personCount: 2 }).ok, false, 'present but unmapped optional contact fails closed')

console.log('semantic customer surface coverage tests: PASS')
