/**
 * Render eligibility tests.
 * Run: npm run test:experimental-render-eligibility
 */

import { approveAllValidMappings } from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import { evaluateExperimentalRenderEligibility } from './experimentalRenderEligibility'
import {
  minimalExperimentResult,
  nowiccyEightPendingMappings,
} from './experimentalTestFixtures'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)

  const pending = evaluateExperimentalRenderEligibility({
    readiness: 'needs_review',
    mappings,
    sourceDocxAvailable: true,
  })
  assert(!pending.eligible, 'not eligible when needs_review')
  assert(pending.reasons.includes('mapping_not_ready'), 'mapping_not_ready')

  const allApproved = approveAllValidMappings(mappings)
  const updated = applyReviewMappingsUpdate(result, allApproved, {
    sourceDocxAvailable: true,
  })

  assertEq(updated.renderEligibility?.eligible, true, '19 eligible when ready')
  assert(
    updated.renderEligibility?.eligible === true &&
      updated.mappingReadiness === 'ready',
    '19 readiness and eligibility agree',
  )

  const noDocx = evaluateExperimentalRenderEligibility({
    readiness: 'ready',
    mappings: allApproved,
    sourceDocxAvailable: false,
  })
  assert(!noDocx.eligible, 'docx missing blocks render')
  assert(noDocx.reasons.includes('source_docx_missing'), 'source_docx_missing')

  console.log('ok — experimentalRenderEligibility')
}

void main()
