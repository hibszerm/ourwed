/**
 * Nowiccy readiness regression — stage labels must not block;
 * supplemental reception prose occurrence must block until resolved.
 * Run: npm run test:nowiccy-readiness-regression
 */

import {
  approveAllValidMappings,
  ignoreMappingAsImmutable,
} from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import { evaluateExperimentalRenderEligibility } from './experimentalRenderEligibility'
import { buildMappingReadinessTrace } from './mappingReadinessTrace'
import {
  installTestLocalStorage,
  minimalExperimentResult,
  nowiccyEightPendingMappings,
  TEST_RUN_ID,
} from './experimentalTestFixtures'
import { deriveEventLocationCapability } from './eventLocationCapability'
import { deriveExperimentalTemplateRequirements } from './templateShapeRequirements'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  installTestLocalStorage()
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)
  const allApproved = approveAllValidMappings(mappings)

  const traceBefore = buildMappingReadinessTrace({
    experimentRunId: TEST_RUN_ID,
    blocks: result.indexedBlocks,
    response: result.structuredMapping,
    mappings: allApproved,
  })

  const blockingBefore = traceBefore.final.blockingIssues.filter((issue) =>
    /preparation_location|ceremony_location/.test(issue),
  )
  assertEq(blockingBefore.length, 0, 'no stage location blockers')

  const requirements = deriveExperimentalTemplateRequirements({
    blocks: result.indexedBlocks,
    mappings: allApproved,
    response: result.structuredMapping,
  })
  assertEq(
    requirements.conditionalRequired.length + requirements.universallyRequired.length,
    8,
    '8 total requirements',
  )

  const locationCapability = deriveEventLocationCapability({
    blocks: result.indexedBlocks,
    mappings: allApproved,
  })
  assertEq(locationCapability.mode, 'single_general_location', 'single general location')
  assertEq(locationCapability.presentKeys.length, 1, 'one location key')
  assertEq(locationCapability.presentKeys[0], 'reception_location', 'reception only')

  const supplemented = supplementOccurrenceMappings({
    mappings: allApproved,
    blocks: result.indexedBlocks,
    generationInput: result.generationInput,
    experimentRunId: TEST_RUN_ID,
  })
  const receptionOccurrences = supplemented.filter(
    (m) => m.fieldKey === 'reception_location',
  )
  assertEq(receptionOccurrences.length, 2, 'reception has table + prose occurrence')

  const updated = applyReviewMappingsUpdate(result, allApproved, {
    sourceDocxAvailable: true,
  })

  assertEq(updated.mappingReadiness, 'needs_review', '13 readiness blocked by prose occurrence')
  assert(
    (updated.validatedMappings ?? []).some(
      (m) =>
        m.fieldKey === 'reception_location' &&
        m.occurrenceReplacementMode === 'manual_review_required',
    ),
    '14 prose occurrence needs manual review',
  )

  const proseOccurrence = (updated.validatedMappings ?? []).find(
    (m) =>
      m.fieldKey === 'reception_location' &&
      m.occurrenceReplacementMode === 'manual_review_required',
  )
  assert(!!proseOccurrence?.id, '15 prose occurrence has id')

  const resolved = ignoreMappingAsImmutable({
    experimentRunId: TEST_RUN_ID,
    mappings: updated.validatedMappings ?? [],
    mappingId: proseOccurrence!.id!,
  })

  const ready = applyReviewMappingsUpdate(updated, resolved, {
    sourceDocxAvailable: true,
  })

  assertEq(ready.mappingReadiness, 'ready', '16 readiness ready after ignore')
  assertEq(ready.metrics.approvedMappings, 8, '17 approved count unchanged')
  assert(ready.renderEligibility?.eligible === true, '18 render eligible with docx')

  const noDocx = evaluateExperimentalRenderEligibility({
    readiness: 'ready',
    mappings: resolved,
    sourceDocxAvailable: false,
  })
  assert(!noDocx.eligible, '19 not eligible without docx')
  assert(
    noDocx.reasons.length === 1 && noDocx.reasons[0] === 'source_docx_missing',
    '19 only source_docx_missing',
  )

  console.log('ok — nowiccyReadinessRegression')
}

void main()
