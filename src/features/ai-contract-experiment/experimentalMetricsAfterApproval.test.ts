/**
 * Metrics after approval tests.
 * Run: npm run test:experimental-metrics-after-approval
 */

import { approveAllValidMappings } from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import {
  minimalExperimentResult,
  nowiccyEightPendingMappings,
} from './experimentalTestFixtures'
import { selectExperimentalRunViewModel } from './experimentalRunViewModel'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)

  const before = selectExperimentalRunViewModel({
    result: { ...result, validatedMappings: mappings },
    sourceDocxAvailable: true,
  })!
  assertEq(before.counts.approved, 0, 'before approval')
  assertEq(before.counts.plannedRendererOperations, 0, 'planned before approval')

  const allApproved = approveAllValidMappings(mappings)
  const updated = applyReviewMappingsUpdate(result, allApproved)
  const vm = selectExperimentalRunViewModel({
    result: updated,
    sourceDocxAvailable: true,
  })!

  assertEq(vm.counts.valid, 8, 'valid mappings')
  assertEq(vm.counts.approved, 8, 'approved mappings')
  assertEq(vm.metrics.approvedMappings, 8, 'metric approved')
  assertEq(vm.counts.plannedRendererOperations, 8, 'planned renderer ops')
  assertEq(vm.counts.executedRendererOperations, 0, 'executed before render')
  assertEq(vm.metrics.rendererOperations, 0, 'renderer ops not executed yet')

  console.log('ok — experimentalMetricsAfterApproval')
}

void main()
