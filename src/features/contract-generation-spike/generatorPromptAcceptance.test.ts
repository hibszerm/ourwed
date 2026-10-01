import assert from 'node:assert/strict'
import { GENERATION_INSTRUCTIONS } from './generator'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()

assert.match(instructions, /contracting parties and contractual roles represented by the source/)
assert.match(instructions, /crm participants are not automatically contracting parties/)
assert.match(instructions, /do not request their identity or contact facts unless the source requires them/)
assert.match(instructions, /use party associations supplied in normalized input/)
assert.match(instructions, /do not invent ownership for unowned facts/)
assert.match(instructions, /contract\/correspondence address is not automatically a residential address/)
assert.match(instructions, /before returning missing_input, inspect the complete source contract for every currently discoverable source-required fact not sufficiently established by current authority or user answers/)
assert.match(instructions, /return all such gaps together; do not stop at the first/)
assert.match(instructions, /do not request facts already sufficiently established/)
assert.match(instructions, /treat a compatible conditional source term as a missing input/)
assert.match(instructions, /list is expected to be complete for discoverable gaps, but is not guaranteed exhaustive/)
assert.match(instructions, /fresh full-context run must re-evaluate/)
assert.match(instructions, /opaque id, a concise user-facing label, and one generic answerkind/)
assert.match(instructions, /do not encode or imply a crm field, path, ontology, or mutation/)
assert.match(instructions, /participantkey is explicitly present in normalized authority/)
assert.match(instructions, /never infer participant ownership or map a participant to a source-contract role/)

console.log('PASS source-party and authority semantics Generator instructions')
