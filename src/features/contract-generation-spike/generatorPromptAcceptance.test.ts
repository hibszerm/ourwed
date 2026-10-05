import assert from 'node:assert/strict'
import { GENERATION_INSTRUCTIONS, GENERIC_CONTRACT_PRODUCT_RULES, JOINTLY_APPLICABLE_FACTS_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './generator'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()

assert.match(instructions, /contracting parties and contractual roles represented by the source/)
assert.match(instructions, /crm participants are not automatically contracting parties/)
assert.match(instructions, /do not request their identity or contact facts unless the source requires them/)
assert.match(instructions, /use party associations supplied in normalized input/)
assert.match(instructions, /do not invent ownership for unowned facts/)
assert.match(instructions, /contract, correspondence, company, or venue address is not automatically a residential address/)
assert.match(instructions, /top-level contractaddress is the address explicitly designated for this contract and has no participant owner/)
assert.match(instructions, /do not ask for the same address again as a residential-address missinginput/)
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
assert.match(instructions, /including required case or other inflection/)
assert.match(instructions, /underlying identity and meaning/)
assert.match(instructions, /meaningful stored display name and formatted address/)
assert.match(instructions, /do not infer a name from an address, fetch or geocode a place/)
assert.match(instructions, /a fact associated with one participant describes only that participant/)
assert.match(instructions, /collective\/shared party fact unless authoritative input explicitly establishes/)
assert.match(instructions, /if the source requires a collective\/shared fact .* return missing_input for the unsupported requirement/)
// Case A: a source-established required fact missing from all authority asks for input.
assert.match(instructions, /return missing_input only when the source contract clearly establishes a fact required for this candidate/)
assert.match(instructions, /not safely available from normalized authority, authoritative user answers, or applicable generic product rules/)
assert.match(instructions, /if an established required fact is missing, request it through missing_input/)
// Case B: ambiguity or awkward source text alone must not manufacture a fact request.
assert.match(instructions, /a suspicious fragment or possible accidental template text is not evidence by itself that a factual value is required/)
assert.match(instructions, /fabricate a missinginput for source cleanup/)
assert.match(instructions, /preserve the source wording unchanged/)
assert.match(instructions, /do not invent a value or requirement/)
assert.match(instructions, /never claim ready when your adaptation introduces or leaves a clearly required transaction fact unresolved/)
// Cases A–G: singular/exclusive roles and unresolved required facts remain questions;
// any count of jointly applicable values is represented together when source meaning permits.
const jointFacts = JOINTLY_APPLICABLE_FACTS_INSTRUCTIONS.toLowerCase()
assert.match(jointFacts, /multiple authoritative values are all applicable/)
assert.match(jointFacts, /include all applicable values naturally/)
assert.match(jointFacts, /do not ask the user to choose among them/)
assert.match(jointFacts, /source requires one exclusive value or role/)
assert.match(jointFacts, /authoritative association is ambiguous/)
assert.match(jointFacts, /a required fact is absent/)
assert.match(jointFacts, /materially change the source meaning/)
assert.doesNotMatch(JOINTLY_APPLICABLE_FACTS_INSTRUCTIONS, /preparation|bride|groom|location|template/i, 'joint applicability rule has no domain-specific hardcoding')

const productRules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ').toLowerCase()
assert.match(productRules, /keep wedding-specific purchased extras distinct from the source-defined base-package scope/)
assert.match(productRules, /do not make them appear to be further numbered members/)

const review = REVIEW_INSTRUCTIONS.toLowerCase()
assert.match(review, /obviously ungrammatical insertion of a canonical value/)
assert.match(review, /place names and formatted addresses are both preserved/)
assert.match(review, /participant-specific address or phone cannot satisfy .* collective\/shared requirement/)
// Case C: unchanged source-template issues are not attributed to generation.
assert.match(review, /do not fail solely because questionable, awkward, incomplete-looking, stale, or possibly defective wording already existed in the source/)
assert.match(review, /source_template_issue for review\/audit purposes/)
assert.match(review, /do not repair it, delete it, invent data for it, or turn it into a fabricated missing_input/)
// Case D: generation-created or clearly required unresolved facts still fail.
assert.match(review, /fail when generation introduced or worsened the problem/)
assert.match(review, /source clearly requires a transaction-specific fact and the ready candidate leaves it unresolved/)
assert.match(review, /unavailable and not requested through missing_input/)

assert.doesNotMatch(instructions + productRules + review, /julia|jan nowicki|villa loft|case-05/i)

console.log('PASS source-party and authority semantics Generator instructions')
