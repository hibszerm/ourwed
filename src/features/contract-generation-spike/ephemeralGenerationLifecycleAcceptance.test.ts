import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../../pages/WeddingContractGenerationPage.tsx', import.meta.url), 'utf8')
const edge = await readFile(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../../supabase/migrations/20261002180000_option_b_ephemeral_lifecycle.sql', import.meta.url), 'utf8')
const boundary = await readFile(new URL('./serverBoundary.ts', import.meta.url), 'utf8')

// Browser connection is only mounted-component state; missing it starts fresh.
assert.match(page, /useState<GenerationConnection \| null>\(null\)/)
assert.doesNotMatch(page, /window\.localStorage|recoverContractGeneration|recoverConnection|setStep\('stale'\)/)
const missingConnection = page.slice(page.indexOf('if (!connection?.sessionId)'), page.indexOf('generateInFlightRef.current = true', page.indexOf('async function continueGeneration(')))
assert.match(missingConnection, /setStep\('resolve'\)/)
assert.doesNotMatch(missingConnection, /continueContractGeneration|validateContractGenerationCandidate/)
assert.match(page, /useBlocker\(Boolean\(connection\)\)/)
assert.match(page, /reason: 'abandoned'/)

// A fresh server-side start is serialized, request-idempotent, scoped to the
// authenticated owner/wedding, and only mutates Option B rows.
assert.match(migration, /pg_advisory_xact_lock/)
assert.match(migration, /idempotency_key = p_request_id/)
assert.match(migration, /idempotency scope mismatch/)
assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/)
assert.match(migration, /to service_role/)
assert.match(migration, /create or replace function public\.claim_option_b_generation_save[\s\S]*?pg_advisory_xact_lock/)
assert.match(migration, /claim_option_b_generation_save\(uuid, uuid, uuid, uuid, text\)[\s\S]*?to service_role/)
assert.match(migration, /weddings[\s\S]*?user_id = v_owner_id/)
assert.match(migration, /session_kind = 'option_b'[\s\S]*?session_state in \('processing', 'awaiting_input', 'completed'\)/)
assert.match(migration, /missing_inputs_json = '\[\]'::jsonb, user_answers_json = '\[\]'::jsonb/)
assert.match(migration, /insert into public\.wedding_contract_generation_runs/)
assert.match(migration, /interval '30 minutes'/)
assert.match(migration, /ephemeral_lifecycle_version = 1/)
assert.match(migration, /cron\.schedule/)
assert.doesNotMatch(migration, /delete from public\.wedding_contract_generation_runs/i)
assert.match(edge, /rpc\('begin_option_b_generation'/)
assert.match(edge, /rpc\('claim_option_b_generation_save'/)

// Valid transitions refresh the inactivity deadline. Terminal paths erase raw
// working data; candidate bytes are server-created after deterministic validation.
assert.match(edge, /expires_at: new Date\(Date\.now\(\) \+ OPTION_B_ACTIVE_TTL_MS\)\.toISOString\(\)/)
assert.match(edge, /user_answers_json: \[\]/)
assert.match(edge, /missing_inputs_json: \[\]/)
assert.match(edge, /resolved_values_json: \{\}/)
assert.match(edge, /\.eq\('ephemeral_lifecycle_version', 1\)/)
assert.ok(boundary.indexOf('await deps.review(latest, answers, {') < boundary.indexOf('await deps.persistAcceptedCandidate({'), 'candidate review precedes ephemeral candidate persistence')
assert.match(boundary, /status: 'ready',[\s\S]*?reviewer: review/, 'Reviewer findings travel with the ready Preview response')
assert.match(boundary, /review = \{ status: 'unavailable' \}/, 'Reviewer provider failure leaves the mechanically valid candidate eligible for Preview')
assert.match(edge, /storage\.from\('document-files'\)\.upload\(path/)
assert.match(edge, /cleanupExpiredOptionBRuns/)
assert.match(edge, /\.eq\('session_kind', 'option_b'\)\.eq\('ephemeral_lifecycle_version', 1\)/)
assert.match(edge, /temporaryCandidatePath\(ownerId, weddingId, sessionId\)/)
assert.match(edge, /parsed\.action === 'cleanup_expired'/)
assert.match(edge, /action: request\.reason/)
assert.match(edge, /validateOptionBCandidate/)
assert.match(migration, /storage\.filename\(name\) <> 'option-b-reviewed-candidate\.docx'/)

// Candidate validation happens before Save's durable draft/document writes.
const savePath = page.slice(page.indexOf('async function save()'), page.indexOf('function downloadGeneratedDocx()'))
assert.ok(savePath.indexOf('validateContractGenerationCandidate') >= 0)
assert.ok(savePath.indexOf('validateContractGenerationCandidate') < savePath.indexOf('documentDraftService.create'))
assert.ok(savePath.indexOf('validateContractGenerationCandidate') < savePath.indexOf('saveGeneratedContract({'))
assert.match(page, /Wygeneruj ponownie/)
assert.match(page, /reason: 'discarded'/)

// Continuation remains server-bound and answer-specific; no client authority is
// added by this lifecycle change.
assert.match(boundary, /acceptSessionAnswers\(current, request\.answers, now\(\)\)/)
assert.match(boundary, /resolveMissingInputAnswers\(session\.missingInputHistory, session\.answers, session\.choiceBindings/)
assert.match(boundary, /deps\.loadContext\(userId, current\.weddingId, accepted\.answers, resolvedInputs\.flatMap/)
assert.match(boundary, /await deps\.generate\(context, answers, resolvedInputs, reportStage\)/)
assert.doesNotMatch(boundary, /retry|repair/i)

console.log('PASS ephemeral Option B lifecycle acceptance')
