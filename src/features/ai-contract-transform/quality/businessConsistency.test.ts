/**
 * Business consistency: reference year + package scope + Mode policies.
 * Run: npm run test:ai-contract-transform-business-consistency
 */

import { buildProtectedContractData } from '../protectedContractData'
import { verifyReferenceNumberConsistency } from './locationAndReferenceConsistency'
import { runPostReconstructionQualityGate } from './buildQualityReport'
import {
  COMPLETENESS_DATASET,
  completenessFullyCorrected,
  completenessPartialUnsafe,
  completenessSourceBlocks,
} from '../fixtures/completenessFixture'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function main() {
  const source = completenessSourceBlocks()
  const protectedData = buildProtectedContractData({
    blocks: source,
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  const good = completenessFullyCorrected(source)

  const ref = verifyReferenceNumberConsistency({
    sourceBlocks: source,
    transformedBlocks: good,
    weddingYear: '2027',
    executionYear: '2027',
  })
  assert(
    ref.some((i) => i.code === 'reference_year_mismatch'),
    'reference_year_mismatch',
  )
  assert(ref.every((i) => i.severity === 'review_required'), 'review severity')

  const noWarn = verifyReferenceNumberConsistency({
    sourceBlocks: source,
    transformedBlocks: good,
    weddingYear: '2027',
    executionYear: '2027',
    explicitNewReference: '2027/01/UM-99',
  })
  assert(noWarn.length === 0, 'explicit ref suppresses warning')

  const modeA = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: completenessPartialUnsafe(source),
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'full_ai',
  })
  const modeB = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: completenessPartialUnsafe(source),
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'guarded',
  })
  assert(
    modeA.report.blockingIssues.length > 0,
    'Mode A still lists blocking issues',
  )
  assert(!modeA.downloadAllowed, 'Mode A financial block')
  assert(!modeB.downloadAllowed, 'Mode B blocks all blocking')

  const cleanA = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'full_ai',
  })
  assert(cleanA.downloadAllowed, 'Mode A allows clean (review ok)')
  assert(
    cleanA.report.reviewIssues.some(
      (i) => i.code === 'reference_year_mismatch',
    ) ||
      cleanA.report.businessConsistency.referenceNumberIssues.length > 0,
    'review issues visible in Mode A',
  )

  const cleanB = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'guarded',
  })
  assert(cleanB.downloadAllowed, 'Mode B allows clean')
  assert(cleanB.report.blockingIssues.length === 0, 'no blocking on clean')

  console.log('ok — ai-contract-transform-business-consistency')
}

main()
