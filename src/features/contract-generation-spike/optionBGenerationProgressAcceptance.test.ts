import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  elapsedStageCopy,
  formatElapsed,
  isOptionBProgressStage,
  OPTION_B_PROGRESS_STAGES,
  shouldAcceptProgressRow,
} from './generationProgress.ts'

const migration = await readFile(new URL('../../../supabase/migrations/20261006163552_option_b_generation_progress_stage.sql', import.meta.url), 'utf8')
const edge = await readFile(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url), 'utf8')
const boundary = await readFile(new URL('./serverBoundary.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('../../pages/WeddingContractGenerationPage.tsx', import.meta.url), 'utf8')
const poller = await readFile(new URL('./useOptionBGenerationProgress.ts', import.meta.url), 'utf8')
const progressUi = await readFile(new URL('./OptionBGenerationProgress.tsx', import.meta.url), 'utf8')
const progressCss = await readFile(new URL('./OptionBGenerationProgress.module.css', import.meta.url), 'utf8')

assert.deepEqual(OPTION_B_PROGRESS_STAGES, ['preparing', 'analyzing', 'building_document', 'verifying', 'preparing_preview'])
assert.match(migration, /add column progress_stage text/)
assert.match(migration, /check \(progress_stage is null or progress_stage in \([\s\S]*'preparing',[\s\S]*'analyzing',[\s\S]*'building_document',[\s\S]*'verifying',[\s\S]*'preparing_preview'/)
assert.equal((migration.match(/add column/gi) ?? []).length, 1, 'migration adds exactly one progress column')
assert.equal((migration.match(/create table|create index|add column/gi) ?? []).length, 1, 'migration contains only the single progress metadata addition')
assert.equal(isOptionBProgressStage('building_document'), true)
assert.equal(isOptionBProgressStage('reviewer_thinking'), false, 'stage enum rejects non-allowlisted names')

assert.match(edge, /if \(result\.status === 'READY'\) await reportStage\?\.\('building_document'\)/, 'document stage begins only after a valid READY protocol result')
assert.match(boundary, /await reportStage\('analyzing'\)[\s\S]*await deps\.generate/)
assert.match(boundary, /await reportStage\('verifying'\)[\s\S]*deps\.verifyConflict/)
assert.match(boundary, /await reportStage\('verifying'\)[\s\S]*deps\.review/)
assert.match(edge, /session_state: 'processing',[\s\S]*progress_stage: 'preparing'/, 'a new continuation returns to PREPARING')
assert.match(edge, /session_state: 'completed', generation_status: 'ready'[\s\S]*progress_stage: 'preparing_preview'/)
assert.match(edge, /\.eq\('id', input\.sessionId\)\.eq\('execution_id', input\.executionId\)\.eq\('session_kind', 'option_b'\)\.eq\('session_state', 'processing'\)/, 'progress updates require the current run, execution and processing state')
assert.match(edge, /current\.or\('progress_stage\.is\.null,progress_stage\.eq\.preparing'\)/)
assert.match(edge, /current\.eq\('progress_stage', 'analyzing'\)/)
assert.match(edge, /current\.in\('progress_stage', \['analyzing', 'building_document'\]\)/, 'compare-and-set guards prevent a late stage write moving progress backwards')

assert.match(poller, /\.select\('session_state,generation_status,progress_stage,updated_at'\)/)
assert.doesNotMatch(poller, /\.select\('\*'\)/)
assert.match(poller, /\.eq\('session_kind', 'option_b'\)[\s\S]*\.eq\('idempotency_key', requestId\)/, 'poll uses the known request ID and authenticated owner RLS')
assert.match(poller, /VISIBLE_POLL_MS = 2_000/)
assert.match(poller, /HIDDEN_POLL_MS = 5_000/)
assert.match(poller, /visibilitychange/)
assert.match(poller, /return \(\) => \{[\s\S]*disposed = true[\s\S]*clearInterval\(timer\)[\s\S]*clearTimeout\(timeout\)/)
assert.match(page, /useOptionBGenerationProgress\(step === 'generating', connection\?\.requestId, progressAttempt\)/, 'polling stops when modal, conflict, failure or preview changes page state')
assert.match(page, /setStep\('waiting_for_user_input'\)/)
assert.match(page, /setStep\('conflict'\)/)
assert.match(page, /setStep\('failed'\)/)
assert.match(page, /setStep\('preview'\)/)
assert.equal((page.match(/setProgressAttempt\(\(attempt\) => attempt \+ 1\)/g) ?? []).length, 2, 'both start and continuation reset the local timer')

assert.equal(shouldAcceptProgressRow({ session_state: 'processing', generation_status: 'processing', progress_stage: 'analyzing', updated_at: '2026-01-01T00:00:01Z' }, Date.parse('2026-01-01T00:00:00Z')), true)
assert.equal(shouldAcceptProgressRow({ session_state: 'awaiting_input', generation_status: 'manual_input_required', progress_stage: 'analyzing', updated_at: '2026-01-01T00:00:01Z' }, 0), false, 'poll ignores a stopped MissingInput session')
assert.equal(shouldAcceptProgressRow({ session_state: 'processing', generation_status: 'processing', progress_stage: 'analyzing', updated_at: '2025-12-31T23:59:59Z' }, Date.parse('2026-01-01T00:00:00Z')), false, 'poll ignores a stage from a prior request')
assert.equal(formatElapsed(38_900), '00:38')
assert.equal(elapsedStageCopy('analyzing', 19_999), 'Porównuję treść dokumentu z danymi zlecenia.')
assert.equal(elapsedStageCopy('analyzing', 20_000), 'Analiza nadal trwa. Bardziej rozbudowane dokumenty mogą wymagać więcej czasu.')
assert.equal(elapsedStageCopy('building_document', 90_000), 'Wprowadzam potrzebne zmiany i sprawdzam dokument.', 'elapsed time never advances the backend stage or changes another stage copy')
assert.doesNotMatch(`${progressUi}\n${poller}`, /progressbar|percentage|estimated completion|pozostały czas/i)
assert.match(progressCss, /prefers-reduced-motion: reduce[\s\S]*animation: none/)
assert.match(progressUi, /aria-busy="true"/)
assert.match(progressUi, /aria-live="polite"/)
assert.match(progressUi, /aria-current=\{active \? 'step' : undefined\}/)
assert.doesNotMatch(poller, /missing_inputs_json|user_answers_json|resolved_values_json|quality_summary_json|source_sha256|authority_fingerprint|intermediate_docx_path|storage_path/)

console.log('Option B generation progress acceptance: PASS')
