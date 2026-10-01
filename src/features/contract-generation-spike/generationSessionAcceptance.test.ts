import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { answersForContractGenerationInput, acceptSessionAnswers, canResumeContractGenerationSession, isContractGenerationSession, sessionMatchesScope, type ContractGenerationSession } from './generationSession'
import { GENERATION_INSTRUCTIONS } from './generator'

const first = { id: 'opaque:requirement/1', label: 'Agreement date', answerKind: 'date' as const }
const second = { id: 'opaque:requirement/2', label: 'Contact email', answerKind: 'email' as const, subject: { participantKey: 'partner2', displayName: 'Sam' } }
const session: ContractGenerationSession = {
  id: 'session-id',
  ownerUserId: 'studio-id',
  weddingId: 'wedding-id',
  templateId: 'template-id',
  templateVersionId: 'template-version-id',
  sourceSha256: 'a'.repeat(64),
  state: 'awaiting_input',
  missingInputs: [first, second],
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

assert.match(GENERATION_INSTRUCTIONS, /return all such gaps together; do not stop at the first/i)
assert.match(GENERATION_INSTRUCTIONS, /never infer participant ownership/i)
assert.match(GENERATION_INSTRUCTIONS, /participantKey is explicitly present in normalized authority/i)

const migration = await readFile(new URL('../../../supabase/migrations/20261001110000_option_b_generation_sessions.sql', import.meta.url), 'utf8')
assert.match(migration, /update public\.wedding_contract_generation_runs[\s\S]*?set owner_user_id = wedding\.user_id/i, 'existing payment runs receive their wedding owner')
assert.match(migration, /session_state in \([\s\S]*?'processing'[\s\S]*?'awaiting_input'[\s\S]*?'completed'[\s\S]*?'failed'[\s\S]*?'abandoned'/i)
assert.match(migration, /and owner_user_id = auth\.uid\(\)/i, 'session persistence remains owner-bound')
assert.match(migration, /version\.id = wedding_contract_generation_runs\.template_version_id/i, 'session RLS pins an owned template version')
assert.match(migration, /template\.id = wedding_contract_generation_runs\.template_id/i, 'session RLS pins the corresponding owned template')
assert.doesNotMatch(migration, /generation_status\s*=|drop constraint[^;]*generation_status/i, 'legacy payment status and checks are not rewritten')
assert.doesNotMatch(migration, /drop column|delete from public\.wedding_contract_generation_runs/i, 'migration does not remove or delete existing run data')

console.log('PASS generic generation session contract acceptance')
