/**
 * Relative payment warning must not block readiness.
 * Run: npm run test:experimental-relative-payment-warning
 */

import { approveAllValidMappings } from './experimentalMappingApproval'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import {
  minimalExperimentResult,
  nowiccyEightPendingMappings,
  nowiccyStructuredResponse,
} from './experimentalTestFixtures'
import { classifyMappingWarning } from './mappingWarningSeverity'
import { evaluateExperimentalMappingReadiness } from './mappingReadiness'
import { evaluateSourceFieldPresence } from './sourceFieldPresence'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const warnings = nowiccyStructuredResponse().warnings
  const classified = classifyMappingWarning(warnings[0])
  assertEq(classified.severity, 'info', '11 relative payment → info')

  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)
  const allApproved = approveAllValidMappings(mappings)
  const updated = applyReviewMappingsUpdate(result, allApproved)
  assertEq(updated.mappingReadiness, 'ready', '11 warning does not block')

  const presence = evaluateSourceFieldPresence({
    blocks: result.indexedBlocks,
    fieldKey: 'payment_due_date',
    warnings,
  })
  assertEq(presence.presence, 'present_unsupported_value', 'payment present_unsupported')

  const blocksWithConcreteDate = result.indexedBlocks.map((b) =>
    b.text.includes('14 dni przed')
      ? { ...b, text: 'Termin płatności: 01.06.2027 r.' }
      : b,
  )
  const concretePresence = evaluateSourceFieldPresence({
    blocks: blocksWithConcreteDate,
    fieldKey: 'payment_due_date',
    warnings: [],
  })
  assertEq(concretePresence.presence, 'present_supported_value', '12 concrete date supported')

  const withoutPaymentMapping = allApproved
  const readinessMissing = evaluateExperimentalMappingReadiness({
    blocks: blocksWithConcreteDate,
    response: {
      ...nowiccyStructuredResponse(),
      warnings: [],
    },
    mappings: withoutPaymentMapping,
  })
  assertEq(readinessMissing, 'incomplete', '12 concrete date missing mapping blocks')

  console.log('ok — relativePaymentWarningReadiness')
}

void main()
