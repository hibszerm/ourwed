/**
 * Readiness after approval tests.
 * Run: npm run test:experimental-readiness-after-approval
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import {
  approveAllValidMappings,
  ignoreMappingAsImmutable,
  rejectMappingById,
} from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import { createMappingId } from './mappingId'
import { validateStructuredMapping } from './mappingValidator'
import { evaluateExperimentalMappingReadiness } from './mappingReadiness'
import { minimalExperimentResult, TEST_RUN_ID } from './experimentalTestFixtures'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

async function main() {
  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
  const { response } = await analyzeContractForStructuredMapping({
    blocks,
    packageName: 'Video',
    packageId: 'pkg-1',
  })
  const validated = validateStructuredMapping({
    response,
    blocks,
    experimentRunId: TEST_RUN_ID,
  }).map((m) => ({
    ...m,
    id:
      m.id ??
      createMappingId({
        experimentRunId: TEST_RUN_ID,
        fieldKey: m.fieldKey,
        blockId: m.blockId,
        start: m.start,
        end: m.end,
      }),
  }))
  const result = minimalExperimentResult(validated, blocks)

  const allApproved = approveAllValidMappings(validated)
  const updated = applyReviewMappingsUpdate(result, allApproved)
  assertEq(
    updated.mappingReadiness,
    'needs_review',
    'all approved → needs_review until prose occurrence resolved',
  )

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
  const readyResult = applyReviewMappingsUpdate(result, resolved)
  assertEq(readyResult.mappingReadiness, 'ready', 'all approved + resolved occurrence → ready')

  const rejected = rejectMappingById({
    experimentRunId: TEST_RUN_ID,
    mappings: allApproved,
    mappingId: allApproved.find((m) => m.fieldKey === 'couple_full_names')!.id!,
  })
  const rejectedResult = applyReviewMappingsUpdate(result, rejected)
  assertEq(rejectedResult.mappingReadiness, 'incomplete', 'reject required → incomplete')

  const onlyRequiredApproved = approveAllValidMappings(validated)
  const ready = evaluateExperimentalMappingReadiness({
    blocks,
    response,
    mappings: onlyRequiredApproved,
  })
  assertEq(ready, 'ready', 'six-field set ready without optional contact fields')

  console.log('ok — experimentalReadinessAfterApproval')
}

void main()
