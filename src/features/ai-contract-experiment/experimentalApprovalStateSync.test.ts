/**
 * Approval state synchronization tests.
 * Run: npm run test:experimental-approval-state-sync
 */

import {
  approveAllValidMappings,
  approveMappingById,
  ignoreMappingAsImmutable,
  restoreMappingDecisionById,
} from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import {
  installTestLocalStorage,
  minimalExperimentResult,
  nowiccyEightPendingMappings,
  TEST_RUN_ID,
} from './experimentalTestFixtures'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { evaluateGraphReadiness } from './pipeline/planReadiness'
import { clearExperimentStore, getExperimentResult } from './experimentStorage'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  installTestLocalStorage()
  clearExperimentStore()
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)

  const pendingGraph = buildOccurrenceGraphFromMappings({
    experimentRunId: TEST_RUN_ID,
    mappings,
    blocks: result.indexedBlocks,
    generationInput: result.generationInput,
    supplement: true,
  })
  const pendingReadiness = evaluateGraphReadiness(pendingGraph)
  assertEq(pendingReadiness, 'incomplete', '1 pending required → incomplete')

  const couple = mappings.find((m) => m.fieldKey === 'couple_full_names')!
  const approvedOne = approveMappingById({
    experimentRunId: TEST_RUN_ID,
    mappings,
    mappingId: couple.id!,
  })
  assertEq(
    approvedOne.find((m) => m.id === couple.id)?.approvalStatus,
    'approved',
    '2 approve updates canonical status',
  )

  const allApproved = approveAllValidMappings(mappings)
  const updated = applyReviewMappingsUpdate(result, allApproved, {
    sourceDocxAvailable: true,
  })
  assertEq(updated.mappingReadiness, 'needs_review', '4 all approved → needs_review with prose occurrence')

  const proseOccurrence = (updated.validatedMappings ?? []).find(
    (m) =>
      m.fieldKey === 'reception_location' &&
      m.occurrenceReplacementMode === 'manual_review_required',
  )
  const resolved = ignoreMappingAsImmutable({
    experimentRunId: TEST_RUN_ID,
    mappings: updated.validatedMappings ?? [],
    mappingId: proseOccurrence!.id!,
  })
  const ready = applyReviewMappingsUpdate(result, resolved, {
    sourceDocxAvailable: true,
  })
  assertEq(ready.mappingReadiness, 'ready', '4b prose occurrence resolved → ready')
  assertEq(ready.metrics.approvedMappings, 8, '5 eight approved count')
  assertEq(ready.metrics.plannedRendererOperations, 8, '5 planned ops')

  const stored = getExperimentResult(TEST_RUN_ID)
  assert(stored !== null, '15 localStorage round trip')
  assertEq(stored!.metrics.approvedMappings, 8, '16 metrics match store')

  const numeric = allApproved.find((m) => m.fieldKey === 'contract_value_formatted')!
  const pairApproved = approveMappingById({
    experimentRunId: TEST_RUN_ID,
    mappings,
    mappingId: numeric.id!,
  })
  const words = pairApproved.find((m) => m.fieldKey === 'contract_value_words')!
  assertEq(words.approvalStatus, 'approved', '7 pair approved atomically')

  const restored = restoreMappingDecisionById({
    experimentRunId: TEST_RUN_ID,
    mappings: pairApproved,
    mappingId: numeric.id!,
  })
  const wordsPending = restored.find((m) => m.fieldKey === 'contract_value_words')!
  assertEq(wordsPending.approvalStatus, 'pending', '8 restore pair → both pending')

  const allAgain = approveAllValidMappings(mappings)
  let approveAllResult = applyReviewMappingsUpdate(result, allAgain)
  const prose = (approveAllResult.validatedMappings ?? []).find(
    (m) =>
      m.fieldKey === 'reception_location' &&
      m.occurrenceReplacementMode === 'manual_review_required',
  )
  approveAllResult = applyReviewMappingsUpdate(
    result,
    ignoreMappingAsImmutable({
      experimentRunId: TEST_RUN_ID,
      mappings: approveAllResult.validatedMappings ?? [],
      mappingId: prose!.id!,
    }),
  )
  assert(
    approveAllResult.validatedMappings!.every(
      (m) => m.validationStatus !== 'valid' || m.approvalStatus === 'approved' || m.approvalStatus === 'ignored_immutable',
    ),
    '6 approve all valid',
  )

  console.log('ok — experimentalApprovalStateSync')
}

void main()
