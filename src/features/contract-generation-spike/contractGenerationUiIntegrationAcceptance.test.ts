import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { answersForMissingInputs } from './missingInputAnswers'
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
]
assert.deepEqual(answersForMissingInputs(pending, { 'opaque-2': '2026-10-01', 'opaque-1': '  tekst  ' }), [
  { missingInputId: 'opaque-2', value: '2026-10-01' },
  { missingInputId: 'opaque-1', value: 'tekst' },
], 'the whole current batch is submitted in server order with opaque IDs')

assert.match(page, /startContractGeneration\(\{ weddingId: wedding\.id, requestId: connection\.requestId \}\)/)
assert.match(page, /continueContractGeneration\(\{ sessionId: connection\.sessionId, answers \}\)/)
const continuation = page.slice(page.indexOf('async function continueGeneration('), page.indexOf('async function save('))
assert.doesNotMatch(continuation, /weddingActionsService|saveGeneratedContract|documentDraftService|updateWedding/)
assert.match(page, /setMissingInputs\(result\.missingInputs\)/)
assert.match(page, /setStep\('waiting_for_user_input'\)/)
assert.match(page, /downloadAcceptedContractCandidate\(\{[\s\S]*candidateId: result\.candidateId/)
assert.match(page, /saveGeneratedContract\(\{/)
for (const state of ['unresolved_conflict', 'precondition', 'stale', 'unauthorized', 'forbidden', 'generation_safety']) {
  assert.ok(page.includes(state), `production page handles ${state}`)
}
assert.match(page, /Wystąpił chwilowy problem/)
assert.match(page, /Spróbuj ponownie/)
assert.match(page, /Rozpocznij nowe generowanie/)
assert.match(page, /Odrzuć i wygeneruj ponownie/)
assert.doesNotMatch(page, /startSemanticContractGeneration|resumeSemanticContractGeneration|invokeSemanticMapProvider|buildSemanticContractProductionDataset/)
assert.doesNotMatch(page, /mayGenerateContract|isTravelFeeResolved/)
assert.match(form, /props\.requirements\.map\(/)
for (const kind of ['text', 'multiline', 'date', 'number', 'email', 'phone']) {
  assert.ok(form.includes(`'${kind}'`), `generic renderer supports ${kind}`)
}
assert.match(form, /requirement\.subject\?\.displayName/)
assert.match(form, /required/)
assert.match(page, /key=\{missingInputs\.map\(\(item\) => item\.id\)\.join\('\|'\)\}/)
assert.match(previewPage, /navigate\(`\/sluby\/\$\{wedding\.id\}\/umowy\/nowa`\)/)
console.log('Production contract generation UI integration acceptance passed.')
