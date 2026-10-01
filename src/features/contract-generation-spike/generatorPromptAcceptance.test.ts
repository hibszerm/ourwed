import assert from 'node:assert/strict'
import { GENERATION_INSTRUCTIONS } from './generator'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()

assert.match(instructions, /contracting parties and contractual roles represented by the source/)
assert.match(instructions, /crm participants are not automatically contracting parties/)
assert.match(instructions, /do not request their identity or contact facts unless the source requires them/)
assert.match(instructions, /use party associations supplied in normalized input/)
assert.match(instructions, /do not invent ownership for unowned facts/)
assert.match(instructions, /contract\/correspondence address is not automatically a residential address/)
assert.match(instructions, /facts genuinely required by the source and unavailable or insufficiently established by authority/)

console.log('PASS source-party and authority semantics Generator instructions')
