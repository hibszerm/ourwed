/**
 * Run view-model selector tests.
 * Run: npm run test:experimental-run-view-model
 */

import {
  approveAllValidMappings,
  ignoreMappingAsImmutable,
} from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import {
  minimalExperimentResult,
  nowiccyEightPendingMappings,
  TEST_RUN_ID,
} from './experimentalTestFixtures'
import { selectExperimentalRunViewModel } from './experimentalRunViewModel'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)

  const pendingVm = selectExperimentalRunViewModel({
    result,
    sourceDocxAvailable: true,
  })
  assert(pendingVm !== null, 'vm exists')
  assertEq(pendingVm!.readiness, 'incomplete', 'pending readiness')
  assertEq(pendingVm!.renderEligibility.eligible, false, 'not eligible pending')

  const allApproved = approveAllValidMappings(mappings)
  const blocked = applyReviewMappingsUpdate(result, allApproved)
  const blockedVm = selectExperimentalRunViewModel({
    result: blocked,
    sourceDocxAvailable: true,
  })!
  assertEq(blockedVm.readiness, 'needs_review', '12 blocked by prose occurrence')

  const proseOccurrence = (blocked.validatedMappings ?? []).find(
    (m) =>
      m.fieldKey === 'reception_location' &&
      m.occurrenceReplacementMode === 'manual_review_required',
  )
  const resolved = ignoreMappingAsImmutable({
    experimentRunId: TEST_RUN_ID,
    mappings: blocked.validatedMappings ?? [],
    mappingId: proseOccurrence!.id!,
  })
  const updated = applyReviewMappingsUpdate(result, resolved)
  const vm = selectExperimentalRunViewModel({
    result: updated,
    sourceDocxAvailable: true,
  })!

  assertEq(vm.readiness, 'ready', '13 snapshot reflects approvals')
  assertEq(vm.metrics.approvedMappings, 8, 'metrics in vm')
  assert(vm.renderEligibility.eligible, '17 eligibility when docx available')
  assertEq(vm.renderEligibility.reasons.length, 0, 'no blockers')

  const missingDocx = selectExperimentalRunViewModel({
    result: updated,
    sourceDocxAvailable: false,
  })!
  assertEq(missingDocx.readiness, 'ready', '18 readiness stays ready')
  assert(!missingDocx.renderEligibility.eligible, '18 render blocked by docx')
  assert(
    missingDocx.renderEligibility.reasons.includes('source_docx_missing'),
    '18 source_docx_missing reason',
  )

  console.log('ok — experimentalRunViewModel')
}

void main()
