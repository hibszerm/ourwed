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
import {
  applyLocalModeA,
  applyLocalModeB,
  createComparisonRunShell,
} from '../transformService'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, String(v))
    },
    removeItem: (k) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

async function main() {
  installLocalStorage()
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

  // Partial / mixed document
  const unsafe = completenessPartialUnsafe(source)
  const unsafeGate = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: unsafe,
    dataset,
    protectedData,
    mode: 'guarded',
  })
  assert(!unsafeGate.downloadAllowed, 'Mode B blocks mixed/partial')
  assert(
    unsafeGate.report.blockingIssues.some(
      (i) =>
        i.code === 'stale_source_value_remaining' ||
        i.code === 'mixed_source_and_target_values' ||
        i.code === 'partial_field_application',
    ),
    'stale/mixed/partial detected',
  )
  assert(
    unsafeGate.report.blockingIssues.some(
      (i) => i.code === 'payment_structure_mismatch',
    ),
    'one-time payment vs deposit blocked',
  )
  assert(
    unsafeGate.report.completeness.staleSourceValues.length > 0 ||
      unsafeGate.report.completeness.mixedSourceTargetFields.length > 0,
    'completeness summary populated',
  )

  // Mode A still reports same defects; may download unless financial block
  const unsafeA = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: unsafe,
    dataset,
    protectedData,
    mode: 'full_ai',
  })
  assert(
    unsafeA.report.blockingIssues.some((i) =>
      /stale|mixed|partial|payment_structure/i.test(i.code),
    ),
    'Mode A report exposes defects',
  )
  assert(
    !unsafeA.downloadAllowed,
    'Mode A blocks on payment_structure_mismatch',
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
  assert(/1 000 zł/.test(joined) && /9 500 zł/.test(joined), 'deposit+remaining')
  assert(!/płatne jednorazowo/i.test(joined), 'no one-time wording')
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

  const runShell = createComparisonRunShell({
    runId: 'completeness-local',
    sourceFileName: 'fixture.docx',
    blocks: source,
    dataset,
  })
  const modeA = await applyLocalModeA({
    run: runShell,
    sourceBytes: new ArrayBuffer(8),
    sourceBlocks: source,
    transformedBlocks: good,
    dataset,
  })
  assert(modeA.modeA.qualityReport != null, 'Mode A quality report attached')
  assert(
    modeA.modeA.qualityReport!.blockingIssues.filter((i) =>
      [
        'money_words_mismatch',
        'payment_structure_mismatch',
        'payment_arithmetic_mismatch',
        'deposit_missing',
        'remaining_payment_missing',
        'package_scope_mismatch',
      ].includes(i.code),
    ).length === 0,
    'Mode A has no financial blockers on clean doc',
  )
  // Fake ArrayBuffer is not a DOCX — download may fail write; quality gate still allows
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

  const modeB = await applyLocalModeB({
    run: modeA,
    sourceBytes: new ArrayBuffer(8),
    sourceBlocks: source,
    transformedBlocks: unsafe,
    dataset,
  })
  assert(!modeB.modeB.downloadAvailable, 'Mode B blocked on unsafe')
  assert(
    modeB.modeB.modeBVerification?.status === 'blocked',
    'Mode B verification blocked',
  )

  // Independent lifecycle: Mode A error does not prevent Mode B shell
  assert(modeA.modeA.status === 'success', 'A success independent')

  console.log('ok — ai-contract-transform-completeness')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
