/**
 * Completeness quality gate — stale / missing / partial / mixed.
 * Run: npm run test:ai-contract-transform-completeness
 */

import { buildProtectedContractData } from '../protectedContractData'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { buildExpectationManifest } from '../quality/expectationManifest'
import {
  COMPLETENESS_DATASET,
  completenessFullyCorrected,
  completenessPartialUnsafe,
  completenessSourceBlocks,
} from '../fixtures/completenessFixture'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

async function main() {
  const source = completenessSourceBlocks()
  const protectedData = buildProtectedContractData({
    blocks: source,
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  const dataset = COMPLETENESS_DATASET

  const manifest = buildExpectationManifest({
    sourceBlocks: source,
    dataset,
    protectedData,
  })
  assert(manifest.sourceSpecificValues.length > 0, 'source inventory non-empty')
  assert(
    manifest.sourceSpecificValues.some((s) =>
      /Pałac Rydzyna/i.test(s.sourceValue),
    ),
    'Pałac Rydzyna inventoried',
  )
  assert(manifest.requiredReplacements.length > 0, 'requiredReplacements')
  assert(
    !manifest.sourceSpecificValues.some((s) =>
      /1234567890|Studio Foto Test/i.test(s.sourceValue),
    ),
    'provider not in source-specific inventory',
  )

  // Case A: safely repairable partial input. Deterministic repairs complete all
  // represented facts, including the total-only / one-time payment structure.
  const unsafe = completenessPartialUnsafe(source)
  const unsafeGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: unsafe,
    dataset,
    protectedData,
    mode: 'guarded',
  })
  assert(unsafeGate.downloadAllowed, 'repairable partial input becomes downloadable')
  assert(
    unsafeGate.report.blockingIssues.length === 0,
    'repairable partial input has no final blocking issues',
  )
  assert(
    unsafeGate.report.completeness.status === 'pass' &&
      unsafeGate.report.completeness.missingFields.length === 0 &&
      unsafeGate.report.completeness.staleSourceValues.length === 0 &&
      unsafeGate.report.completeness.partialApplications.length === 0 &&
      unsafeGate.report.completeness.mixedSourceTargetFields.length === 0,
    'deterministic repairs satisfy every represented canonical fact',
  )
  assert(
    !unsafeGate.report.blockingIssues.some(
      (i) => i.code === 'payment_structure_mismatch',
    ),
    'total-only one-time source does not force split-payment mismatch',
  )
  const caseABlob = unsafeGate.blocks.map((b) => b.text).join('\n')
  assert(
    !caseABlob.includes(dataset.finances.depositFormatted!) &&
      !caseABlob.includes(dataset.finances.remainingFormatted!),
    'total-only one-time source does not gain deposit/remaining obligations',
  )
  const repairedA = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: unsafe,
    dataset,
    protectedData,
    mode: 'full_ai',
  })
  assert(
    repairedA.report.blockingIssues.length === 0 && repairedA.downloadAllowed,
    'Mode A also accepts the completely repaired document',
  )
  assert(
    !repairedA.report.blockingIssues.some(
      (i) => i.code === 'payment_structure_mismatch',
    ),
    'Mode A respects total-only payment representation',
  )

  // Case B: the SOURCE represents ceremony location, but an empty transformed
  // ceremony cannot be recovered from an exact stale source surface.
  assert(
    manifest.representedConcepts?.ceremonyLocation === true,
    'unresolved ceremony source concept is represented',
  )
  assert(
    manifest.requiredFields.some(
      (f) => f.canonicalField === 'wedding.ceremonyLocation',
    ),
    'represented ceremony has a canonical requirement',
  )
  const unresolved = unsafe.map((b) =>
    b.blockId === 'para-22' ? { ...b, text: '' } : b,
  )
  const unresolvedGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: unresolved,
    dataset,
    protectedData,
    mode: 'guarded',
  })
  assert(
    unresolvedGate.report.completeness.status === 'fail' &&
      unresolvedGate.report.completeness.missingFields.includes(
        'wedding.ceremonyLocation',
      ),
    'represented ceremony remains materially unresolved',
  )
  assert(
    unresolvedGate.report.blockingIssues.some(
      (i) =>
        i.severity === 'blocking' &&
        i.canonicalField === 'wedding.ceremonyLocation',
    ),
    'unresolved represented ceremony remains blocking',
  )
  assert(
    !unresolvedGate.downloadAllowed,
    'Mode B blocks genuinely unresolved represented facts',
  )

  // Payment case: the SOURCE genuinely represents deposit + remaining. A transformed
  // one-time-payment clause contradicts that represented split structure.
  const splitSource = source.map((b) =>
    /płatne jednorazowo/i.test(b.text)
      ? {
          ...b,
          text: 'Zadatek 1 500 zł. Pozostała kwota 6 500 zł płatna przed wydarzeniem.',
        }
      : b,
  )
  const splitUnsafe = completenessPartialUnsafe(splitSource).map((b) =>
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
  const splitManifest = buildExpectationManifest({
    sourceBlocks: splitSource,
    dataset,
    protectedData: splitProtectedData,
  })
  assert(
    splitManifest.representedConcepts?.deposit === true &&
      splitManifest.representedConcepts.remaining === true,
    'split-payment source represents deposit and remaining',
  )
  const splitGate = runPostReconstructionQualityGate({
    sourceBlocks: splitSource,
    transformedBlocks: splitUnsafe,
    dataset,
    protectedData: splitProtectedData,
    mode: 'guarded',
  })
  assert(
    splitGate.report.blockingIssues.some(
      (i) =>
        i.code === 'payment_structure_mismatch' &&
        i.severity === 'blocking',
    ),
    'represented split payment blocks contradictory one-time structure',
  )

  // Fully corrected
  const good = completenessFullyCorrected(source)
  const goodGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: good,
    dataset,
    protectedData,
    mode: 'guarded',
  })
  const joined = good.map((b) => b.text).join('\n')
  assert(!/Pałac Rydzyna/i.test(joined), 'old venue gone')
  assert(!/Aleksandra Biłas/i.test(joined), 'old names gone')
  assert(!/603 306 423/.test(joined), 'old phone gone')
  assert(!/19\.06\.2025/.test(joined), 'old date gone')
  assert(/Ewa Nowak/.test(joined), 'new names')
  assert(/501 502 503/.test(joined), 'new phone')
  assert(/24\.07\.2027/.test(joined), 'new date')
  assert(/Izdebnik|Lwowska/i.test(joined), 'reception represented')
  assert(/Grażyńskiego|przygotowania/i.test(joined), 'preparation represented')
  assert(/Bazylika|ceremon/i.test(joined), 'ceremony represented')
  assert(/10 500 zł/.test(joined), 'total price')
  assert(!/1 000 zł/.test(joined) && !/9 500 zł/.test(joined), 'no unrepresented deposit+remaining')
  assert(/płatne jednorazowo/i.test(joined), 'one-time payment preserved')
  assert(/Studio Foto Test/.test(joined), 'provider preserved')
  assert(/1234567890/.test(joined), 'NIP preserved')
  assert(/12 3456 7890/.test(joined), 'bank preserved')
  assert(
    goodGate.report.protection.status === 'pass',
    'protection pass',
  )
  assert(
    goodGate.report.blockingIssues.filter(
      (i) => i.code !== 'possible_location_grammar_issue',
    ).length === 0 ||
      goodGate.report.blockingIssues.every(
        (i) =>
          i.severity !== 'blocking' ||
          i.code === 'expected_dataset_value_missing',
      ),
    `good doc blocking: ${goodGate.report.blockingIssues.map((i) => i.code).join(',')}`,
  )

  // Soften: allow download when no hard blocking (grammar review ok)
  const hard = goodGate.report.blockingIssues.filter(
    (i) => i.severity === 'blocking',
  )
  assert(hard.length === 0, `fully corrected has no blocking: ${hard.map((i) => i.code).join(',')}`)
  assert(goodGate.downloadAllowed, 'Mode B download allowed when clean')

  assert(
    goodGate.report.reviewIssues.some((i) => i.code === 'reference_year_mismatch') ||
      goodGate.report.businessConsistency.referenceNumberIssues.some(
        (i) => i.code === 'reference_year_mismatch',
      ),
    'reference year review',
  )

  assert(
    runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: good,
      dataset,
      protectedData,
      mode: 'full_ai',
    }).downloadAllowed,
    'Mode A quality gate allows download on clean',
  )

  assert(
    !runPostReconstructionQualityGate({
      sourceBlocks: source,
      transformedBlocks: unresolved,
      dataset,
      protectedData,
      mode: 'full_ai',
    }).downloadAllowed,
    'Mode A quality gate blocks unresolved represented location',
  )

  console.log('ok — ai-contract-transform-completeness')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
