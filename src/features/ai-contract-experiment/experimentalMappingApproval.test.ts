/**
 * Experimental mapping approval workflow tests.
 * Run: npm run test:experimental-mapping-approval
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import {
  approveAllValidMappings,
  approveMapping,
  canContinueMappingReview,
  rejectMapping,
} from './experimentalMappingApproval'
import { computeMappingReadiness } from './mappingReadiness'
import { validateStructuredMapping } from './mappingValidator'
import { analyzeContractForStructuredMapping } from './mockAdapters'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

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
  const validated = validateStructuredMapping({ response, blocks })

  assertEq(
    computeMappingReadiness({ blocks, response, mappings: validated }),
    'needs_review',
    '6 all required pending → needs_review',
  )

  const allApproved = approveAllValidMappings(validated)
  assertEq(
    computeMappingReadiness({ blocks, response, mappings: allApproved }),
    'ready',
    '7 all required approved → ready',
  )
  assert(canContinueMappingReview(allApproved), 'can continue when ready')

  const rejected = rejectMapping(
    allApproved,
    'couple_full_names',
    allApproved.find((m) => m.fieldKey === 'couple_full_names')!.blockId,
  )
  assertEq(
    computeMappingReadiness({ blocks, response, mappings: rejected }),
    'incomplete',
    '8 required rejected → incomplete',
  )

  const numericOnly = approveMapping(
    validated,
    'contract_value_formatted',
    validated.find((m) => m.fieldKey === 'contract_value_formatted')!.blockId,
  )
  assert(
    !canContinueMappingReview(numericOnly),
    '9 paired numeric approved, words pending → not ready',
  )

  console.log('ok — experimentalMappingApproval')
}

void main()
