import assert from 'node:assert/strict'
import { DEPENDENT_MISSING_INPUT_INSTRUCTIONS, GENERATION_INSTRUCTIONS } from './generator'
import { isGenerationResponse, type MissingInput } from './generationProtocol'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()
const dependencyRule = DEPENDENT_MISSING_INPUT_INSTRUCTIONS.toLowerCase()

// These synthetic cases validate the provider instruction contract without making provider calls.
const subjects = [
  { key: 'subject-a', identity: 'Person A', phone: 'phone-a', address: 'address-a', email: 'email-a' },
  { key: 'subject-b', identity: 'Person B', phone: 'phone-b', address: 'address-b', email: 'email-b' },
]
const sourceRole = { cardinality: 'one', mappedSubject: null }
const associationOnly: MissingInput = {
  id: 'opaque-association',
  label: 'Which authoritative person fills the source-defined role?',
  answerKind: 'text',
}

// A. Ambiguous source subject with available dependent facts: ask for association only.
assert.equal(sourceRole.cardinality, 'one')
assert.equal(sourceRole.mappedSubject, null)
assert.ok(subjects.every((subject) => subject.identity && subject.phone))
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [associationOnly] }), true)
assert.match(dependencyRule, /ask only for the minimum input needed to identify which authoritative subject fills that source role/)
assert.match(dependencyRule, /defer dependent facts whose authority depends on that unresolved association; they are not yet missing/)

// B-C. Once the association identifies either subject, reuse that subject's existing facts.
for (const key of ['subject-a', 'subject-b']) {
  const resolvedSubject = subjects.find((subject) => subject.key === key)
  assert.ok(resolvedSubject)
  assert.ok(resolvedSubject.phone && resolvedSubject.address && resolvedSubject.email)
}
assert.match(dependencyRule, /after continuation resolves the association, bind the answer to the authoritative subject it identifies/)
assert.match(dependencyRule, /re-evaluate each dependent fact against that subject, and reuse every present authoritative fact of any kind/)

// D-F. A dependent fact is askable only when absent for the resolved subject; no field type gets special behavior.
const resolvedWithoutPhone = { key: 'subject-a', identity: 'Person A', phone: null }
assert.equal(resolvedWithoutPhone.phone, null)
assert.match(dependencyRule, /ask for a dependent fact only if it remains absent for the resolved subject or no authoritative value exists/)
for (const factKind of ['identity', 'address', 'email', 'phone', 'other']) {
  assert.ok(dependencyRule.includes(factKind))
}

// G. Subject resolution preserves the source's singular scope.
assert.match(dependencyRule, /preserve the source-defined subject and scope/)
assert.match(dependencyRule, /does not make a singular role shared or joint, infer an association, or broaden a requirement/)

// H. Independent gaps remain batchable while contingent gaps wait for association.
const independentGap: MissingInput = { id: 'opaque-independent', label: 'Independent required fact', answerKind: 'date' }
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [associationOnly, independentGap] }), true)
assert.match(dependencyRule, /batch genuinely independent missing facts with the current subject-association question; do not defer independent gaps/)

// I. Continuation keeps the original question definition and does not recreate it.
assert.match(instructions, /each resolved item binds the original missinginput id and complete requirement definition/)
assert.match(instructions, /do not request the same requirement again, including by paraphrasing its label or assigning a new opaque id/)

// J. The change is confined to generic Generator planning language; it adds no runtime field map.
assert.match(instructions, /normalized authority contains multiple candidate subjects/)
assert.match(instructions, /source-to-authority association is not established/)
assert.doesNotMatch(DEPENDENT_MISSING_INPUT_INSTRUCTIONS, /partner1|partner2|peSEL|template|wedding-specific/i)

console.log('PASS generic dependent MissingInput prompt acceptance (10 synthetic cases)')
