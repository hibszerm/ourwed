import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { answersForMissingInputs } from './missingInputAnswers'
import { advanceGenerationUiRun, type GenerationUiRun } from './generationConnection'
import type { MissingInput } from './generationProtocol'

const page = await readFile(new URL('../../pages/WeddingContractGenerationPage.tsx', import.meta.url), 'utf8')
const form = await readFile(new URL('./ContractGenerationMissingInputForm.tsx', import.meta.url), 'utf8')
const previewPage = await readFile(new URL('../../pages/WeddingContractPreviewPage.tsx', import.meta.url), 'utf8')

const acceptedCandidatePath = page.slice(
  page.indexOf('async function showAcceptedCandidate('),
  page.indexOf('async function applyBoundaryResult('),
)
assert.match(acceptedCandidatePath, /downloadAcceptedContractCandidate/)
assert.match(acceptedCandidatePath, /setStep\('preview'\)/)
assert.doesNotMatch(acceptedCandidatePath, /documentDraftService\.create/)

assert.doesNotMatch(page, /recoverContractGeneration|recoverConnection|readGenerationConnection|writeGenerationConnection|window\.localStorage/)
assert.doesNotMatch(page, /Sesja wygasła|Poprzedniej sesji generowania/)
assert.match(page, /const blocker = useBlocker\(Boolean\(connection\)\)/)
assert.match(page, /finalizeContractGeneration\(\{[\s\S]*?reason: 'abandoned'/)
const connectionLossPath = page.slice(page.indexOf('async function continueGeneration('), page.indexOf('async function discardGeneration('))
assert.match(connectionLossPath, /if \(!connection\?\.sessionId\)[\s\S]*?setStep\('resolve'\)/)
assert.doesNotMatch(connectionLossPath.slice(connectionLossPath.indexOf('if (!connection?.sessionId)'), connectionLossPath.indexOf('generateInFlightRef.current = true')), /continueContractGeneration/)

const savePath = page.slice(
  page.indexOf('async function save()'),
  page.indexOf('function downloadGeneratedDocx()'),
)
assert.match(savePath, /if \(!draftId\)[\s\S]*documentDraftService\.create/)
assert.match(savePath, /validateContractGenerationCandidate/)
assert.ok(savePath.indexOf('validateContractGenerationCandidate') < savePath.indexOf('documentDraftService.create'), 'candidate is server-validated before document creation')
assert.match(savePath, /saveGeneratedContract\(\{[\s\S]*draftId,/)

const pending: MissingInput[] = [
  { id: 'opaque-2', label: 'Termin', answerKind: 'date' },
  { id: 'opaque-1', label: 'Dodatkowe ustalenia', answerKind: 'multiline', subject: { displayName: 'Umowa' } },
  { id: 'opaque-choice', kind: 'choice', label: 'Wybierz osobę', options: [
    { id: 'opaque-option-1', label: 'Osoba pierwsza' }, { id: 'opaque-option-2', label: 'Osoba druga' },
  ] },
]
assert.deepEqual(answersForMissingInputs(pending, { 'opaque-2': '2026-10-01', 'opaque-1': '  tekst  ' }, { 'opaque-choice': 'opaque-option-2' }), [
  { missingInputId: 'opaque-2', value: '2026-10-01' },
  { missingInputId: 'opaque-1', value: 'tekst' },
  { missingInputId: 'opaque-choice', optionId: 'opaque-option-2' },
], 'the whole current batch is submitted in server order with opaque IDs')

assert.match(page, /startContractGeneration\(\{ weddingId: wedding\.id, requestId: connection\.requestId \}\)/)
assert.match(page, /continueContractGeneration\(\{ sessionId: connection\.sessionId, answers \}\)/)
const continuation = page.slice(page.indexOf('async function continueGeneration('), page.indexOf('async function save('))
assert.doesNotMatch(continuation, /weddingActionsService|saveGeneratedContract|documentDraftService|updateWedding/)
assert.match(page, /setMissingInputs\(result\.missingInputs\)/)
assert.match(page, /setStep\('waiting_for_user_input'\)/)
assert.match(page, /advanceGenerationUiRun\(generationUiRunRef\.current/)
assert.match(page, /setMissingInputs\(\[\]\)[\s\S]*?setStep\('generating'\)/)
assert.match(page, /downloadAcceptedContractCandidate\(\{[\s\S]*candidateId: result\.candidateId/)
assert.match(page, /saveGeneratedContract\(\{/)
for (const state of ['unresolved_conflict', 'precondition', 'stale', 'unauthorized', 'forbidden', 'generation_safety']) {
  assert.ok(page.includes(state), `production page handles ${state}`)
}
assert.match(page, /Wystąpił chwilowy problem/)
assert.match(page, /Spróbuj ponownie/)
assert.match(page, /Rozpocznij nowe generowanie/)
assert.match(page, /Wygeneruj ponownie/)
assert.doesNotMatch(page, /startSemanticContractGeneration|resumeSemanticContractGeneration|invokeSemanticMapProvider|buildSemanticContractProductionDataset/)
assert.doesNotMatch(page, /mayGenerateContract|isTravelFeeResolved/)
assert.match(form, /props\.requirements\.map\(/)
assert.match(form, /requirement\.label/)
assert.match(form, /requirement\.kind === 'choice'[\s\S]*?type="radio"[\s\S]*?option\.label/)
assert.match(form, /selectedOptions\[requirement\.id\]/)
assert.doesNotMatch(form, /translate|labelMap|missingInputLabel/i, 'semantic labels remain Generator-authored')
for (const kind of ['text', 'multiline', 'date', 'number', 'email', 'phone']) {
  assert.ok(form.includes(`'${kind}'`), `generic renderer supports ${kind}`)
}
assert.match(form, /requirement\.subject\?\.displayName/)
assert.match(form, /required/)
assert.match(page, /key=\{missingInputs\.map\(\(item\) => item\.id\)\.join\('\|'\)\}/)
assert.match(previewPage, /navigate\(`\/sluby\/\$\{wedding\.id\}\/umowy\/nowa`\)/)

const request = { requestId: 'run-1' }
let run: GenerationUiRun | null = { ...request, state: 'active' }
run = advanceGenerationUiRun(run, request, 'awaiting_input', 'session-1')
assert.deepEqual(run, { requestId: 'run-1', sessionId: 'session-1', state: 'active' }, 'L: current awaiting_input stays active')
run = advanceGenerationUiRun(run, request, 'processing', 'session-1')
assert.equal(run?.state, 'active', 'M: continuation processing clears old requirements in the page')
run = advanceGenerationUiRun(run, request, 'awaiting_input', 'session-1')
assert.equal(run?.state, 'active', 'M: a new MissingInput batch for the same run remains eligible')
run = advanceGenerationUiRun(run, request, 'ready', 'session-1')
assert.equal(run?.state, 'ready', 'N: ready advances the current run monotonically')
assert.equal(advanceGenerationUiRun(run, request, 'awaiting_input', 'session-1'), null, 'P: a late MissingInput cannot reopen after ready')
assert.equal(advanceGenerationUiRun(run, { requestId: 'run-2' }, 'awaiting_input', 'session-2'), null, 'Q: an old run cannot update the newer current run')
assert.equal(advanceGenerationUiRun({ requestId: 'run-3', state: 'active' }, { requestId: 'run-3' }, 'failed')?.state, 'terminal', 'R: failure is terminal')
console.log('Production contract generation UI integration acceptance passed.')
