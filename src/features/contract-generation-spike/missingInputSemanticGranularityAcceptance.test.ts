import assert from 'node:assert/strict'
import { GENERATION_INSTRUCTIONS } from './generator'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()

// Synthetic acceptance cases exercise the prompt contract without provider calls.
const genericPartySlot = {
  source: 'One party-level address slot; no separate participant slots are established.',
  authority: 'Participant A has a non-shared contract address; no shared authority exists.',
}
assert.match(genericPartySlot.source, /one party-level address slot/i)
assert.match(genericPartySlot.authority, /no shared authority/i)
assert.match(instructions, /source text defines both whether a fact is required and the maximum semantic specificity/)
assert.match(instructions, /each missing_input may ask only for the minimum unresolved fact clearly established by the source/)
assert.match(instructions, /do not refine a generic, collective, party-level, role-neutral, or ownership-ambiguous requirement into participant-specific ownership/)
assert.match(instructions, /if a broader source-established fact remains unresolved, request it at that broader level/)
assert.match(instructions, /a contract\/correspondence address is not automatically a residential address/)

// Explicit participant slots remain specific: an absent B fact can still be requested.
const separateParticipantSlots = 'The source explicitly requires distinct facts for participant A and participant B.'
assert.match(separateParticipantSlots, /distinct facts for participant A and participant B/)
assert.match(instructions, /when the source explicitly establishes separate participant-specific facts .* request a missing fact at that specificity/)

// A generic address cannot gain a subtype, while a source-established subtype remains valid.
const genericAddressType = 'The source requires an address but establishes no address subtype.'
const explicitResidentialType = 'The source explicitly requires a residential address.'
assert.match(genericAddressType, /establishes no address subtype/)
assert.match(explicitResidentialType, /explicitly requires a residential address/)
assert.match(instructions, /or a residential, correspondence, billing, or other semantic type unless the source itself establishes that specificity/)
assert.match(instructions, /when the source explicitly establishes separate participant-specific facts or a semantic type, request a missing fact at that specificity/)

// Defective ambiguity alone still does not establish a new factual requirement.
const ambiguousSource = 'The synthetic source phrase is defective and does not establish that an address is required.'
assert.match(ambiguousSource, /does not establish that an address is required/)
assert.match(instructions, /if ambiguity or a possible source defect does not establish a required fact, preserve the source wording unchanged/)
assert.match(instructions, /do not invent a value or requirement, fabricate a missinginput for source cleanup/)

// Participant A's authority stays scoped to A and cannot supply B or shared ownership.
assert.match(instructions, /a fact associated with one participant describes only that participant/)
assert.match(instructions, /a fact associated with one participant cannot satisfy another participant's or a collective\/shared requirement without explicit authority/)

// Existing genuine-missing behavior and batching remain in force.
assert.match(instructions, /return missing_input only when the source contract clearly establishes a fact required for this candidate/)
assert.match(instructions, /return all such gaps together; do not stop at the first/)
assert.match(instructions, /if an established required fact is missing, request it through missing_input/)
assert.match(instructions, /never claim ready when your adaptation introduces or leaves a clearly required transaction fact unresolved/)

console.log('PASS generic MissingInput semantic granularity acceptance (7 synthetic cases)')
