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

  // Case A: repairable input finishes clean while business review warnings remain.
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
    modeA.report.blockingIssues.length === 0 && modeA.downloadAllowed,
    'Mode A allows safely repaired review-only document',
  )
  assert(
    modeB.report.blockingIssues.length === 0 && modeB.downloadAllowed,
    'Mode B allows safely repaired review-only document',
  )
  for (const gate of [modeA, modeB]) {
    assert(
      gate.report.reviewIssues.some(
        (i) => i.code === 'price_changed_without_explicit_service_scope',
      ) &&
        gate.report.reviewIssues.some(
          (i) => i.code === 'reference_year_mismatch',
        ),
      'business review issues remain visible after safe repair',
    )
  }

  // Case B: represented deposit + remaining obligations contradict a one-time
  // transformed payment clause and cannot be repaired from that output.
  const splitSource = source.map((b) =>
    /płatne jednorazowo/i.test(b.text)
      ? {
          ...b,
          text: 'Zadatek 1 500 zł. Pozostała kwota 6 500 zł płatna przed wydarzeniem.',
        }
      : b,
  )
  const splitTransformed = completenessPartialUnsafe(splitSource).map((b) =>
    /Zadatek 1 500 zł/i.test(b.text)
      ? {
          ...b,
          text: 'Wynagrodzenie płatne jednorazowo przelewem na rachunek Wykonawcy.',
        }
      : b,
  )
  const splitProtectedData = buildProtectedContractData({
    blocks: splitSource,
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  const hardA = runPostReconstructionQualityGate({
    sourceBlocks: splitSource,
    transformedBlocks: splitTransformed,
    dataset: COMPLETENESS_DATASET,
    protectedData: splitProtectedData,
    mode: 'full_ai',
  })
  const hardB = runPostReconstructionQualityGate({
    sourceBlocks: splitSource,
    transformedBlocks: splitTransformed,
    dataset: COMPLETENESS_DATASET,
    protectedData: splitProtectedData,
    mode: 'guarded',
  })
  assert(
    hardA.manifest.representedConcepts?.deposit === true &&
      hardA.manifest.representedConcepts.remaining === true,
    'hard financial case represents deposit and remaining',
  )
  for (const gate of [hardA, hardB]) {
    assert(
      gate.blocks.some((b) => /płatne jednorazowo/i.test(b.text)),
      'contradictory one-time payment remains after deterministic repair',
    )
    assert(
      gate.report.blockingIssues.some(
        (i) =>
          i.code === 'payment_structure_mismatch' &&
          i.severity === 'blocking',
      ),
      'represented financial contradiction remains blocking',
    )
  }
  assert(
    !hardA.downloadAllowed,
    'Mode A blocks unresolved hard financial defect',
  )
  assert(
    !hardB.downloadAllowed,
    'Mode B blocks unresolved hard financial defect',
  )

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
