import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  elapsedStageCopy,
  formatElapsed,
  highestVisibleProgressStage,
  isOptionBProgressStage,
  pauseActiveProcessing,
  progressSupportingCopy,
  readActiveProcessing,
  OPTION_B_PROGRESS_STAGES,
  shouldAcceptProgressRow,
  startActiveProcessing,
} from './generationProgress.ts'

const migration = await readFile(new URL('../../../supabase/migrations/20261006165359_option_b_generation_progress_stage.sql', import.meta.url), 'utf8')
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
assert.match(page, /useOptionBGenerationProgress\(step === 'generating', connection\?\.requestId, progressRequestAttempt, progressGeneration\)/, 'polling stops when modal, conflict, failure or preview changes page state')
assert.match(page, /setStep\('waiting_for_user_input'\)/)
assert.match(page, /setStep\('conflict'\)/)
assert.match(page, /setStep\('failed'\)/)
assert.match(page, /setStep\('preview'\)/)
assert.match(page, /setProgressGeneration\(\(generation\) => generation \+ 1\)/, 'a new generation resets the presentation session')
assert.equal((page.match(/setProgressRequestAttempt\(\(attempt\) => attempt \+ 1\)/g) ?? []).length, 2, 'each request scopes its polling freshness')
assert.match(page, /progress\.beginContinuation\(\)/, 'continuation preserves visible progress and cumulative processing time')
assert.match(page, /progress\.beginContinuation\(\)[\s\S]*setProgressRequestAttempt[\s\S]*setStep\('generating'\)/, 'continuation begins without resetting the generation session')
assert.match(poller, /processingClockRef\.current = startActiveProcessing/, 'active processing resumes from accumulated time')
assert.match(poller, /processingClockRef\.current = pauseActiveProcessing[\s\S]*setElapsedState\(\{ generation,/, 'active processing pauses on modal, terminal state or unmount')

assert.equal(shouldAcceptProgressRow({ session_state: 'processing', generation_status: 'processing', progress_stage: 'analyzing', updated_at: '2026-01-01T00:00:01Z' }, Date.parse('2026-01-01T00:00:00Z')), true)
assert.equal(shouldAcceptProgressRow({ session_state: 'awaiting_input', generation_status: 'manual_input_required', progress_stage: 'analyzing', updated_at: '2026-01-01T00:00:01Z' }, 0), false, 'poll ignores a stopped MissingInput session')
assert.equal(shouldAcceptProgressRow({ session_state: 'processing', generation_status: 'processing', progress_stage: 'analyzing', updated_at: '2025-12-31T23:59:59Z' }, Date.parse('2026-01-01T00:00:00Z')), false, 'poll ignores a stage from a prior request')
assert.equal(formatElapsed(38_900), '00:38')
assert.equal(highestVisibleProgressStage('preparing', 'preparing'), 'preparing', 'initial PREPARING shows Dane')
assert.equal(highestVisibleProgressStage('preparing', 'analyzing'), 'analyzing', 'initial ANALYZING shows Analiza')
assert.equal(highestVisibleProgressStage('analyzing', 'preparing'), 'analyzing', 'continuation PREPARING cannot move the UI backwards')
assert.equal(highestVisibleProgressStage('analyzing', 'analyzing'), 'analyzing', 'continuation ANALYZING stays at Analiza')
assert.equal(highestVisibleProgressStage('analyzing', 'building_document'), 'building_document', 'document stage advances normally')
assert.equal(highestVisibleProgressStage('building_document', 'analyzing'), 'building_document', 'visible progress never regresses within a generation')
assert.equal(highestVisibleProgressStage('preparing', 'preparing'), 'preparing', 'a new generation resets the visible step to Dane')
assert.equal(progressSupportingCopy('analyzing', 0, true), 'Uwzględniam uzupełnione dane i kontynuuję przygotowanie dokumentu.')
assert.equal(progressSupportingCopy('analyzing', 0, false), 'Porównuję treść dokumentu z danymi zlecenia.')

let clock = { accumulatedMs: 0, activeSinceMs: null as number | null }
clock = startActiveProcessing(clock, 100)
assert.equal(readActiveProcessing(clock, 18_100), 18_000, 'initial request accumulates active time')
clock = pauseActiveProcessing(clock, 18_100)
assert.equal(readActiveProcessing(clock, 58_100), 18_000, 'MissingInput waiting time is excluded')
clock = startActiveProcessing(clock, 58_100)
assert.equal(readActiveProcessing(clock, 79_100), 39_000, 'continuation resumes from the accumulated value')
clock = pauseActiveProcessing(clock, 79_100)
assert.equal(readActiveProcessing(clock, 119_100), 39_000, 'a second MissingInput pause does not add modal time')
clock = startActiveProcessing(clock, 119_100)
assert.equal(readActiveProcessing(clock, 133_100), 53_000, 'multiple MissingInput rounds accumulate processing intervals')
const newGenerationClock = { accumulatedMs: 0, activeSinceMs: null }
assert.equal(readActiveProcessing(newGenerationClock, 133_100), 0, 'a new generation resets cumulative time')
assert.equal(elapsedStageCopy('analyzing', 19_999), 'Porównuję treść dokumentu z danymi zlecenia.')
assert.equal(elapsedStageCopy('analyzing', 20_000), 'Analiza nadal trwa. Bardziej rozbudowane dokumenty mogą wymagać więcej czasu.')
assert.equal(elapsedStageCopy('building_document', 90_000), 'Wprowadzam potrzebne zmiany i sprawdzam dokument.', 'elapsed time never advances the backend stage or changes another stage copy')
assert.doesNotMatch(`${progressUi}\n${poller}`, /progressbar|percentage|estimated completion|pozostały czas/i)
assert.match(progressCss, /prefers-reduced-motion: reduce[\s\S]*animation: none/)
assert.match(progressUi, /aria-busy="true"/)
assert.match(progressUi, /aria-live="polite"/)
assert.match(progressUi, /aria-current=\{active \? 'step' : undefined\}/)
assert.match(progressUi, /Czas pracy/)
assert.doesNotMatch(progressUi, /aria-live=.{0,20}timer/i, 'timer updates are not announced live')
assert.doesNotMatch(poller, /missing_inputs_json|user_answers_json|resolved_values_json|quality_summary_json|source_sha256|authority_fingerprint|intermediate_docx_path|storage_path/)
assert.doesNotMatch(page, /progress_stage:|setProgressStage|progress_stage\s*=/, 'the presentation refinement does not change backend progress semantics')

console.log('Option B generation progress acceptance: PASS')
