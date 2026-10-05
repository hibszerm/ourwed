import assert from 'node:assert/strict'
import { isCandidateReviewResponse, isGenerationResponse, isReviewResponse, REVIEWER_FINDING_RULE_IDS, safeReviewerFindingSummary, type CandidateReviewResponse, type MissingInput } from './generationProtocol'

const replace = { kind: 'replace', blockId: 'word/document.xml#p2', text: 'Updated paragraph.' }
const insert = { kind: 'insert_after', blockId: 'word/document.xml#p3', text: 'Additional service paragraph.' }

assert.equal(isGenerationResponse({ status: 'READY', edits: [replace] }), true)
assert.equal(isGenerationResponse({ status: 'READY', edits: [insert] }), true)
assert.equal(isGenerationResponse({ status: 'READY', edits: [replace, insert] }), true)
assert.equal(isGenerationResponse({ status: 'READY' }), false, 'READY requires edits')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, kind: 'patch' }] }), false, 'unknown edit kind is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, blockId: '' }] }), false, 'empty block ID is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, blockId: '   ' }] }), false, 'blank block ID is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, text: '' }] }), false, 'empty replacement is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...insert, text: '  ' }] }), false, 'empty insertion is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, quote: 'source text' }] }), false, 'extra span/provenance fields are rejected')

const missingA: MissingInput = { id: 'opaque:req-1', label: 'Required fact A', answerKind: 'text' }
const missingB: MissingInput = { id: 'opaque/req-2', label: 'Required fact B', answerKind: 'multiline', subject: { participantKey: 'participant-9', displayName: 'Lena' } }
const choice: MissingInput = { id: 'opaque-choice', kind: 'choice', label: 'Select a contracting person', options: [
  { id: 'opaque-option-a', label: 'Candidate A' }, { id: 'opaque-option-b', label: 'Candidate B' },
] }
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [missingA, missingB] }), true, 'multiple structured requirements are accepted together')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [choice] }), true, 'choice requirements have opaque selectable options')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, id: 'partner1.pesel' }] }), true, 'IDs remain opaque; protocol does not parse field-like strings')
for (const answerKind of ['text', 'multiline', 'date', 'number', 'email', 'phone']) {
  assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, answerKind }] }), true, `${answerKind} answer kind is allowed`)
}
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, answerKind: 'pesel' }] }), false, 'field-specific answer kinds are rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, id: '  ' }] }), false, 'blank IDs are rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, label: '  ' }] }), false, 'blank labels are rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, unexpected: true }] }), false, 'unknown requirement fields are rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [missingB] }, new Set(['participant-9'])), true, 'subject participant is checked against supplied identities')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [missingB] }, new Set(['participant-other'])), false, 'unknown subject participant is rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...missingA, subject: { participantKey: 'x', inferredRole: 'client' } }] }), false, 'subject does not accept inferred role metadata')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [] }), false, 'missing-input list must be non-empty')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [missingA, { ...missingA, label: 'Another fact' }] }), false, 'duplicate IDs are rejected')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [missingA], edits: [] }), false, 'MISSING_INPUT cannot contain edits')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...choice, options: [choice.options[0]!, choice.options[0]!] }] }), false, 'choice option IDs are unique')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...choice, options: [{ ...choice.options[0]!, bindingRef: 'crm-id' }, choice.options[1]!] }] }), false, 'choice options cannot expose internal entity references')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...choice, kind: 'choice', options: [{ id: 'only', label: 'One' }] }] }), false, 'choice requires at least two candidates')
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] }), true)
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: [] }), false, 'conflict list must be non-empty')
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: ['Conflict'], edits: [] }), false, 'CONFLICT_INPUT cannot contain edits')
assert.equal(isGenerationResponse({ status: 'READY', edits: [], missingInputs: [] }), false, 'status branches cannot be mixed')

assert.equal(isReviewResponse({ status: 'PASS' }), true)
assert.equal(isReviewResponse({ status: 'PASS', findings: [] }), false, 'PASS cannot contain findings')
assert.equal(isReviewResponse({ status: 'FAIL', findings: ['A material payment term changed.'] }), true)
assert.equal(isReviewResponse({ status: 'FAIL' }), false, 'FAIL requires findings')
assert.equal(isReviewResponse({ status: 'FAIL', findings: [] }), false, 'FAIL findings cannot be empty')
assert.equal(isReviewResponse({ status: 'FAIL', findings: ['   '] }), false, 'FAIL findings cannot be blank')

assert.equal(isCandidateReviewResponse({ status: 'PASS' }), true, 'candidate Reviewer PASS remains minimal')
assert.equal(isCandidateReviewResponse({ status: 'PASS', findings: [] }), false, 'candidate Reviewer PASS has no finding field')
const privateMessage = 'sensitive generated/source detail must never enter safe telemetry'
const privateSource = 'SYNTHETIC_PRIVATE_SOURCE'
const privateCandidate = 'SYNTHETIC_PRIVATE_CANDIDATE'
const privateAnswer = 'SYNTHETIC_PRIVATE_ANSWER'
const candidateFail = { status: 'FAIL', findings: [
  { category: 'unsupported_addition', ruleId: 'unsupported_invention', message: `${privateMessage} ${privateSource}` },
  { category: 'authoritative_fact_mismatch', ruleId: 'payment_amounts', message: `${privateCandidate} ${privateAnswer}` },
  { category: 'unsupported_addition', ruleId: 'unsupported_invention', message: 'duplicate category' },
] }
assert.equal(isCandidateReviewResponse(candidateFail), true, 'candidate FAIL requires structured allowed categories, rule IDs, and messages')
assert.equal(isCandidateReviewResponse({ status: 'FAIL', findings: [{ category: 'unsupported_addition', ruleId: 'unsupported_invention', message: 'safe test' }] }), true, 'known rule IDs are accepted')
assert.equal(isCandidateReviewResponse({ status: 'FAIL', findings: [{ category: 'unsupported_addition', ruleId: 'private_field_name', message: 'not allowed' }] }), false, 'unknown rule IDs are rejected')
assert.equal(isCandidateReviewResponse({ status: 'FAIL', findings: [{ category: 'unsupported_addition', ruleId: privateMessage, message: 'not allowed' }] }), false, 'arbitrary free text is rejected as a rule ID')
assert.equal(isCandidateReviewResponse({ status: 'FAIL', findings: [{ category: 'private_field_name', ruleId: 'unsupported_invention', message: 'not allowed' }] }), false, 'unrecognized finding categories are rejected')
assert.equal(isCandidateReviewResponse({ status: 'FAIL', findings: [{ category: 'unsupported_addition', ruleId: 'unsupported_invention', message: 'safe test', extra: privateAnswer }] }), false, 'unexpected private fields are rejected')
assert.ok(REVIEWER_FINDING_RULE_IDS.includes('contract_total'), 'closed taxonomy includes authoritative total family')
const safeSummary = safeReviewerFindingSummary(candidateFail as CandidateReviewResponse)
assert.deepEqual(safeSummary, {
  findingCount: 3,
  findingCategories: ['authoritative_fact_mismatch', 'unsupported_addition'],
  findingRuleIds: ['payment_amounts', 'unsupported_invention', 'unsupported_invention'],
})
assert.equal(JSON.stringify(safeSummary).includes(privateMessage), false, 'safe projection excludes free-text finding messages')
for (const privateValue of [privateSource, privateCandidate, privateAnswer]) {
  assert.equal(JSON.stringify(safeSummary).includes(privateValue), false, `safe projection excludes ${privateValue}`)
}
assert.equal(safeReviewerFindingSummary({ status: 'PASS' }), null, 'PASS produces no finding metadata')

// Protocol-shape guard: a whole-block handle and replacement text are the only edit coordinates.
const editKeys = Object.keys(replace).sort()
assert.deepEqual(editKeys, ['blockId', 'kind', 'text'])
for (const forbiddenKey of ['quote', 'sourceRef', 'occurrenceIndex', 'offset', 'start', 'end', 'spanId', 'factChange', 'inventoryDisposition', 'patch']) {
  assert.equal(Object.hasOwn(replace, forbiddenKey), false, `${forbiddenKey} is not part of the edit protocol`)
}
assert.deepEqual(Object.keys({ status: 'READY', edits: [replace] }).sort(), ['edits', 'status'])
assert.deepEqual(Object.keys({ status: 'MISSING_INPUT', missingInputs: [missingA] }).sort(), ['missingInputs', 'status'])
assert.deepEqual(Object.keys({ status: 'CONFLICT_INPUT', conflicts: ['Conflict'] }).sort(), ['conflicts', 'status'])

console.log('PASS simplified generation/reviewer protocol acceptance')
