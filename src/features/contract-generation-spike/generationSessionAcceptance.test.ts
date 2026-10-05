import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { answersForContractGenerationInput, acceptSessionAnswers, authorizeMissingInputChoiceOptions, canResumeContractGenerationSession, choiceBindingMapMatchesHistory, isContractGenerationSession, resolveMissingInputAnswers, sessionMatchesScope, type ContractGenerationSession } from './generationSession'
import { isGenerationResponse } from './generationProtocol'
import { CHOICE_MISSING_INPUT_INSTRUCTIONS, GENERATION_INSTRUCTIONS } from './generator'

const first = { id: 'opaque:requirement/1', label: 'Agreement date', answerKind: 'date' as const }
const second = { id: 'opaque:requirement/2', label: 'Contact email', answerKind: 'email' as const, subject: { participantKey: 'partner2', displayName: 'Sam' } }
const prior = { id: 'prior:answer', label: 'Previously requested source fact', answerKind: 'text' as const }
const session: ContractGenerationSession = {
  id: 'session-id',
  ownerUserId: 'studio-id',
  weddingId: 'wedding-id',
  templateId: 'template-id',
  templateVersionId: 'template-version-id',
  sourceSha256: 'a'.repeat(64),
  state: 'awaiting_input',
  missingInputs: [first, second],
  missingInputHistory: [prior, first, second],
  answers: [{ missingInputId: 'prior:answer', value: 'Previously supplied fact' }],
  expiresAt: '2026-10-02T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:01:00.000Z',
}
const scope = {
  ownerUserId: session.ownerUserId,
  weddingId: session.weddingId,
  templateId: session.templateId,
  templateVersionId: session.templateVersionId,
  sourceSha256: session.sourceSha256,
}

assert.equal(isContractGenerationSession(session), true)
assert.deepEqual(JSON.parse(JSON.stringify(session)), session, 'pending requirements and accumulated answers survive persistence round-trip')
assert.equal(canResumeContractGenerationSession(session, scope, new Date('2026-10-01T12:00:00Z')), true)
assert.equal(canResumeContractGenerationSession(session, { ...scope, templateVersionId: 'different-version' }, new Date('2026-10-01T12:00:00Z')), false, 'version change blocks blind continuation')
assert.equal(canResumeContractGenerationSession(session, { ...scope, templateId: 'different-template' }, new Date('2026-10-01T12:00:00Z')), false, 'template change blocks blind continuation')
assert.equal(canResumeContractGenerationSession(session, { ...scope, weddingId: 'different-wedding' }, new Date('2026-10-01T12:00:00Z')), false, 'wedding change blocks answer reuse')
assert.equal(canResumeContractGenerationSession(session, { ...scope, ownerUserId: 'different-owner' }, new Date('2026-10-01T12:00:00Z')), false, 'owner change blocks answer reuse')
assert.equal(canResumeContractGenerationSession(session, { ...scope, sourceSha256: 'b'.repeat(64) }, new Date('2026-10-01T12:00:00Z')), false, 'source-byte change blocks answer reuse')
assert.equal(canResumeContractGenerationSession(session, scope, new Date('2026-10-03T00:00:00Z')), false, 'expired session cannot resume')
assert.equal(sessionMatchesScope(session, scope), true)

const submitted = [
  { missingInputId: first.id, value: '  2026-10-20 ' },
  { missingInputId: second.id, value: ' user@example.test ' },
]
const accepted = acceptSessionAnswers(session, submitted, new Date('2026-10-01T12:00:00Z'))
assert.equal(accepted.ok, true)
if (accepted.ok) {
  assert.deepEqual(accepted.answers, [
    { missingInputId: 'prior:answer', value: 'Previously supplied fact' },
    { missingInputId: first.id, value: '2026-10-20' },
    { missingInputId: second.id, value: 'user@example.test' },
  ], 'answers remain paired with opaque requirement IDs and accumulate')
  assert.deepEqual(answersForContractGenerationInput(accepted.answers), [
    { id: 'prior:answer', value: 'Previously supplied fact' },
    { id: first.id, value: '2026-10-20' },
    { id: second.id, value: 'user@example.test' },
  ], 'continuation can pass accumulated answers into normalized authority without CRM field mapping')
}
assert.deepEqual(acceptSessionAnswers(session, [{ missingInputId: 'unknown', value: 'x' }, submitted[1]!], new Date('2026-10-01T12:00:00Z')), { ok: false, reason: 'unknown_requirement' })
assert.deepEqual(acceptSessionAnswers(session, [submitted[0]!, submitted[0]!], new Date('2026-10-01T12:00:00Z')), { ok: false, reason: 'duplicate_answer' })
assert.deepEqual(acceptSessionAnswers(session, [{ ...submitted[0]!, value: '  ' }, submitted[1]!], new Date('2026-10-01T12:00:00Z')), { ok: false, reason: 'blank_answer' })
assert.deepEqual(acceptSessionAnswers(session, [submitted[0]!], new Date('2026-10-01T12:00:00Z')), { ok: false, reason: 'incomplete_answers' })
assert.deepEqual(acceptSessionAnswers({ ...session, state: 'processing' }, submitted, new Date('2026-10-01T12:00:00Z')), { ok: false, reason: 'session_not_awaiting_input' })

const rawChoice = { id: 'opaque-role-requirement', kind: 'choice' as const, label: 'Which person fills this role?', options: [
  { id: 'partner1', label: 'untrusted first label' }, { id: 'partner2', label: 'untrusted second label' },
] }
const authorizedChoice = authorizeMissingInputChoiceOptions([rawChoice], [
  { key: 'partner1', label: 'Authoritative Candidate One' }, { key: 'partner2', label: 'Authoritative Candidate Two' },
], (() => { let index = 0; return () => `option-token-${++index}` })())
assert.ok(authorizedChoice)
assert.deepEqual(authorizedChoice?.missingInputs, [{ id: rawChoice.id, kind: 'choice', label: rawChoice.label, options: [
  { id: 'option-token-1', label: 'Authoritative Candidate One' }, { id: 'option-token-2', label: 'Authoritative Candidate Two' },
] }], 'server replaces candidate keys and labels with opaque options and authoritative display labels')
assert.deepEqual(authorizedChoice?.choiceBindings, { [rawChoice.id]: { 'option-token-1': 'partner1', 'option-token-2': 'partner2' } })
const authorityCandidates = [
  { key: 'partner1', label: 'Authoritative Candidate One' }, { key: 'partner2', label: 'Authoritative Candidate Two' },
]
const authorizeWithIds = (choice: typeof rawChoice, prefix: string) => {
  let index = 0
  return authorizeMissingInputChoiceOptions([choice], authorityCandidates, () => `${prefix}-${++index}`)
}
const reversedModelChoice = { ...rawChoice, options: [...rawChoice.options].reverse() }
const reversedModelResult = authorizeWithIds(reversedModelChoice, 'reverse-token')
assert.deepEqual(reversedModelResult?.missingInputs[0]?.kind === 'choice' ? reversedModelResult.missingInputs[0].options.map(({ label }) => label) : [],
  ['Authoritative Candidate One', 'Authoritative Candidate Two'], 'model option order does not control authoritative option order')
assert.deepEqual(reversedModelResult?.choiceBindings, { [rawChoice.id]: { 'reverse-token-1': 'partner1', 'reverse-token-2': 'partner2' } })
const mismatchedModelChoice = { ...rawChoice, options: [
  { id: 'partner 1', label: 'model renamed candidate' }, { id: 'partner2', label: 'another model label' },
] }
const mismatchedModelResult = authorizeWithIds(mismatchedModelChoice, 'mismatch-token')
assert.deepEqual(mismatchedModelResult?.choiceBindings, { [rawChoice.id]: { 'mismatch-token-1': 'partner1', 'mismatch-token-2': 'partner2' } },
  'schema-valid model key formatting does not prevent authority-derived choices')
assert.deepEqual(mismatchedModelResult?.missingInputs[0]?.kind === 'choice' ? mismatchedModelResult.missingInputs[0].options.map(({ label }) => label) : [],
  ['Authoritative Candidate One', 'Authoritative Candidate Two'], 'model cannot rename authoritative candidates')
const inventedModelChoice = { ...rawChoice, options: [
  { id: 'unknown-party', label: 'invented candidate' }, ...rawChoice.options,
] }
const inventedResult = authorizeWithIds(inventedModelChoice, 'invented-token')
assert.equal(inventedResult?.missingInputs[0]?.kind === 'choice' ? inventedResult.missingInputs[0].options.length : 0, 2,
  'model-proposed extra candidates are ignored and cannot enter authority')
assert.deepEqual(inventedResult?.choiceBindings, { [rawChoice.id]: { 'invented-token-1': 'partner1', 'invented-token-2': 'partner2' } })
const omittedModelChoice = { ...rawChoice, options: [
  rawChoice.options[0]!, { id: 'unknown-party', label: 'unknown' },
] }
assert.equal(authorizeWithIds(omittedModelChoice, 'omitted-token')?.missingInputs[0]?.kind, 'choice',
  'omitting an authoritative candidate from model options does not hide it from the user')
assert.equal(choiceBindingMapMatchesHistory(authorizedChoice!.missingInputs, authorizedChoice!.choiceBindings), true)
assert.equal(choiceBindingMapMatchesHistory(authorizedChoice!.missingInputs, {}), false, 'choice history without its server binding is invalid')
assert.equal(choiceBindingMapMatchesHistory(authorizedChoice!.missingInputs, { ...authorizedChoice!.choiceBindings, stale: { 'old-option': 'partner1' } }), false, 'bindings for another requirement or run cannot be retained')
assert.equal(choiceBindingMapMatchesHistory(authorizedChoice!.missingInputs, { [rawChoice.id]: { 'option-token-1': 'partner1', 'option-token-2': 'partner2', extra: 'partner1' } }), false, 'extra stale options invalidate the exact server binding')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], [{ key: 'partner1', label: 'A' }], () => 'opaque'), null, 'a one-candidate set cannot be presented as a choice')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], [{ key: 'partner1', label: 'A' }, { key: 'partner1', label: 'duplicate' }], () => 'opaque'), null, 'duplicate authoritative candidate keys fail closed')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], [{ key: 'partner1', label: ' ' }, { key: 'partner2', label: 'B' }], () => 'opaque'), null, 'blank authoritative labels fail closed')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], [{ key: ' ', label: 'A' }, { key: 'partner2', label: 'B' }], () => 'opaque'), null, 'blank authoritative keys fail closed')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], authorityCandidates, () => ''), null, 'failed opaque ID generation fails closed')
assert.equal(authorizeMissingInputChoiceOptions([rawChoice], authorityCandidates, () => 'same-id'), null, 'duplicate server opaque IDs fail closed')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ ...rawChoice, options: [rawChoice.options[0]!, rawChoice.options[0]!] }] }), false,
  'duplicate model option IDs remain rejected by the protocol boundary')
assert.deepEqual(authorizeMissingInputChoiceOptions([{ id: 'scalar', label: 'Generic missing fact', answerKind: 'text' }], [], () => 'unused'),
  { missingInputs: [{ id: 'scalar', label: 'Generic missing fact', answerKind: 'text' }], choiceBindings: {} }, 'scalar MissingInput does not depend on party choices')

const choiceSession: ContractGenerationSession = {
  ...session,
  missingInputs: authorizedChoice!.missingInputs,
  missingInputHistory: authorizedChoice!.missingInputs,
  answers: [],
  choiceBindings: authorizedChoice!.choiceBindings,
}
assert.equal(isContractGenerationSession(choiceSession), true, 'pending option bindings validate against the session state')
assert.equal(isContractGenerationSession({ ...choiceSession, choiceBindings: {} }), false, 'a choice session without its authorized server options is rejected')
assert.deepEqual(acceptSessionAnswers(choiceSession, [{ missingInputId: rawChoice.id, optionId: 'tampered-option' }], new Date('2026-10-01T12:00:00Z')),
  { ok: false, reason: 'unknown_option' }, 'unknown or tampered option IDs fail closed')
assert.deepEqual(acceptSessionAnswers(choiceSession, [{ missingInputId: 'other-requirement', optionId: 'option-token-1' }], new Date('2026-10-01T12:00:00Z')),
  { ok: false, reason: 'unknown_requirement' }, 'option tokens cannot be moved to another requirement')
assert.deepEqual(acceptSessionAnswers(choiceSession, [{ missingInputId: rawChoice.id, value: 'Candidate One' }], new Date('2026-10-01T12:00:00Z')),
  { ok: false, reason: 'wrong_answer_kind' }, 'choice cannot be flattened back into typed text')
const acceptedChoice = acceptSessionAnswers(choiceSession, [{ missingInputId: rawChoice.id, optionId: 'option-token-1' }], new Date('2026-10-01T12:00:00Z'))
assert.equal(acceptedChoice.ok, true)
if (acceptedChoice.ok) {
  assert.deepEqual(acceptedChoice.answers, [{ missingInputId: rawChoice.id, optionId: 'option-token-1' }])
  assert.deepEqual(answersForContractGenerationInput(acceptedChoice.answers), [], 'entity selection is not converted into a user-provided fact')
  const resolved = resolveMissingInputAnswers(choiceSession.missingInputHistory, acceptedChoice.answers, choiceSession.choiceBindings)
  assert.deepEqual(resolved, [{ requirement: authorizedChoice!.missingInputs[0], answer: { optionId: 'option-token-1' }, selectedEntity: { partyKey: 'partner1' } }], 'choice restores an authoritative entity binding on continuation')
  const continued: ContractGenerationSession = { ...choiceSession, answers: acceptedChoice.answers, missingInputs: [{ id: 'next', label: 'A later absent fact', answerKind: 'text' }], missingInputHistory: [...choiceSession.missingInputHistory, { id: 'next', label: 'A later absent fact', answerKind: 'text' }] }
  assert.equal(isContractGenerationSession(continued), true, 'choice answer and binding survive later continuation history')
}
assert.equal(acceptSessionAnswers(choiceSession, [{ missingInputId: rawChoice.id, optionId: 'old-option-from-prior-run' }], new Date('2026-10-01T12:00:00Z')).ok, false,
  'stale or cross-run opaque IDs fail closed')
const acceptedSecondChoice = acceptSessionAnswers(choiceSession, [{ missingInputId: rawChoice.id, optionId: 'option-token-2' }], new Date('2026-10-01T12:00:00Z'))
assert.equal(acceptedSecondChoice.ok, true, 'second authoritative candidate option remains selectable')
if (acceptedSecondChoice.ok) assert.deepEqual(resolveMissingInputAnswers(choiceSession.missingInputHistory, acceptedSecondChoice.answers, choiceSession.choiceBindings)?.[0]?.selectedEntity,
  { partyKey: 'partner2' }, 'selecting option B binds authoritative entity B')

assert.match(GENERATION_INSTRUCTIONS, /return all such gaps together; do not stop at the first/i)
assert.match(GENERATION_INSTRUCTIONS, /never infer participant ownership/i)
assert.match(GENERATION_INSTRUCTIONS, /participantKey is explicitly present in normalized authority/i)
assert.match(CHOICE_MISSING_INPUT_INSTRUCTIONS, /exactly one authoritative candidate can fill a source role/i)
assert.match(CHOICE_MISSING_INPUT_INSTRUCTIONS, /selectedEntityBindings links the answered choice requirement/i)

const migration = await readFile(new URL('../../../supabase/migrations/20261001110000_option_b_generation_sessions.sql', import.meta.url), 'utf8')
assert.match(migration, /update public\.wedding_contract_generation_runs[\s\S]*?set owner_user_id = wedding\.user_id/i, 'existing payment runs receive their wedding owner')
assert.match(migration, /session_state in \([\s\S]*?'processing'[\s\S]*?'awaiting_input'[\s\S]*?'completed'[\s\S]*?'failed'[\s\S]*?'abandoned'/i)
assert.match(migration, /and owner_user_id = auth\.uid\(\)/i, 'session persistence remains owner-bound')
assert.match(migration, /version\.id = wedding_contract_generation_runs\.template_version_id/i, 'session RLS pins an owned template version')
assert.match(migration, /template\.id = wedding_contract_generation_runs\.template_id/i, 'session RLS pins the corresponding owned template')
assert.doesNotMatch(migration, /generation_status\s*=|drop constraint[^;]*generation_status/i, 'legacy payment status and checks are not rewritten')
assert.doesNotMatch(migration, /drop column|delete from public\.wedding_contract_generation_runs/i, 'migration does not remove or delete existing run data')

console.log('PASS generic generation session contract acceptance')
