import assert from 'node:assert/strict'
import { DEPENDENT_MISSING_INPUT_INSTRUCTIONS, GENERATION_INSTRUCTIONS, GENERATOR_PAYMENT_SCHEDULE_INSTRUCTIONS, MISSING_INPUT_DECISION_ORDER_INSTRUCTIONS, generationInstructionsForLocale } from './generator'
import { isGenerationResponse, type MissingInput } from './generationProtocol'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()
const dependencyRule = DEPENDENT_MISSING_INPUT_INSTRUCTIONS.toLowerCase()
const decisionOrder = MISSING_INPUT_DECISION_ORDER_INSTRUCTIONS.toLowerCase()

// These synthetic cases validate the provider instruction contract without making provider calls.
const association: MissingInput = {
  id: 'opaque-association',
  kind: 'choice',
  label: 'Which authoritative person fills the source-defined role?',
  options: [
    { id: 'opaque-person-a', label: 'Person A' },
    { id: 'opaque-person-b', label: 'Person B' },
  ],
}
const roleFactA: MissingInput = {
  id: 'opaque-role-fact-a',
  label: 'Required identifier for the person filling the source-defined role',
  answerKind: 'text',
}
const roleFactB: MissingInput = {
  id: 'opaque-role-fact-b',
  label: 'Required date fact for the person filling the source-defined role',
  answerKind: 'date',
}

// A. Certain role-scoped gaps share the first batch with the choice; no synthetic subject key is needed.
const firstPass = [association, roleFactA, roleFactB]
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: firstPass }), true)
assert.ok(firstPass.slice(1).every((item) => item.kind !== 'choice' && item.subject === undefined))
assert.match(dependencyRule, /maximal safe set of remaining source-required unresolved facts/)
assert.match(dependencyRule, /do not defer a still-missing dependent fact solely because another missinginput in this same response will ask/)
assert.match(dependencyRule, /return both the role\/entity choice and the role-scoped fact missinginput together/)
assert.match(dependencyRule, /describe the source-defined role in the fact label/)
assert.match(dependencyRule, /bind that answer only to the entity selected for the source role when continuing/)
assert.match(dependencyRule, /use submitted role-scoped answers for their original requirement ids/)
assert.match(dependencyRule, /do not re-ask them under the same id, a new id, or a paraphrase/)

// B. If the first answer determines whether a later fact is required, that fact waits.
assert.match(dependencyRule, /if the choice changes whether the fact is required or missing, or if answering an earlier question genuinely determines whether the later fact is required, defer that fact/)
assert.match(dependencyRule, /answering an earlier question genuinely determines whether the later fact is required, defer that fact/)

// C-D. Do not ask when authority, source-owned content, resolved answers, or product rules already supply the fact.
assert.match(decisionOrder, /check all compatible current authoritative data for that slot/)
assert.match(decisionOrder, /first-pass completeness rule applies only to facts that remain unresolved after this order/)
assert.match(decisionOrder, /identify the exact semantic fact and its source slot and scope/)
assert.match(decisionOrder, /check all compatible current authoritative data for that slot/)
assert.match(decisionOrder, /including authority that is intentionally independent of a selected participant or role/)
assert.match(decisionOrder, /check resolved user answers/)
assert.match(decisionOrder, /valid deterministic derivations or arithmetic/)
assert.match(decisionOrder, /only a fact still unresolved after these checks may become a missinginput/)
assert.match(decisionOrder, /do not require participant ownership when the compatible authority is intentionally unowned or independent/)
assert.match(decisionOrder, /must never create a missinginput for a fact already supplied by compatible authority/)
assert.match(dependencyRule, /after applying the missing-input decision order/)
assert.match(dependencyRule, /a role-to-entity choice does not make compatible authority unavailable when that authority is intentionally independent of the candidate/)
assert.doesNotMatch(MISSING_INPUT_DECISION_ORDER_INSTRUCTIONS, /contractaddress|golden_03|partner1|partner2|installment ii/i)

// A second batch remains valid for facts whose need becomes knowable only after answers.
const genuinelyConditionalLaterFact: MissingInput = {
  id: 'opaque-conditional-later',
  label: 'Fact required only for the selected option',
  answerKind: 'text',
}
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [genuinelyConditionalLaterFact] }), true)
assert.match(instructions, /continue inspecting the complete source for other genuinely missing requirements/)

// Existing generic behavior still reaches the actual Generator prompt.
assert.ok(generationInstructionsForLocale('en').includes(DEPENDENT_MISSING_INPUT_INSTRUCTIONS))
assert.ok(generationInstructionsForLocale('pl').includes(DEPENDENT_MISSING_INPUT_INSTRUCTIONS))
for (const locale of ['en', 'pl']) {
  const prompt = generationInstructionsForLocale(locale)
  const orderIndex = prompt.indexOf(MISSING_INPUT_DECISION_ORDER_INSTRUCTIONS)
  const dependentIndex = prompt.indexOf(DEPENDENT_MISSING_INPUT_INSTRUCTIONS)
  assert.ok(orderIndex >= 0 && dependentIndex > orderIndex, `${locale} prompt must apply authority-first order before batching dependent MissingInputs`)
}
assert.match(GENERATOR_PAYMENT_SCHEDULE_INSTRUCTIONS.toLowerCase(), /request only the minimum genuinely unknown intermediate amount/)
assert.match(GENERATOR_PAYMENT_SCHEDULE_INSTRUCTIONS.toLowerCase(), /calculate it as contractvalue minus the authoritative deposit and all earlier installment amounts instead of asking for it/)
assert.match(instructions, /top-level contractaddress is the address explicitly designated for this contract and has no participant owner/)
assert.match(instructions, /do not ask for the same address again as a residential-address missinginput/)

// The rule stays generic and introduces no schema, role, participant, or template ontology.
assert.doesNotMatch(DEPENDENT_MISSING_INPUT_INSTRUCTIONS, /partner1|partner2|pesel|date of birth|golden_03|bride|groom|installment ii|template-specific/i)
assert.match(instructions, /include subject only when its participantkey is explicitly present in normalized authority/)
assert.match(instructions, /never infer participant ownership or map a participant to a source-contract role/)

console.log('PASS generic first-pass MissingInput completeness acceptance (Cases A-F; no provider calls)')
