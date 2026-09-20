/**
 * Free U03 deterministic replay — no OpenAI.
 * Replays quality gate + repairs on U03 fixture (source-as-model + empty model).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyAdditionalServicesPlacement } from '../additionalServicesPlacement'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { buildExpectationManifest } from '../quality/expectationManifest'
import { discoverFilledLocationEvidence } from '../quality/locationFieldEvidence'
import { discoverFilledPartyEvidence } from '../quality/partyFilledIdentity'
import {
  findAtomicPaymentRegion,
  findPaymentStartIndex,
} from '../packageDeliverablesDetection'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildCg7Scenarios } from './cg7Scenarios'

async function main() {
  const root = process.cwd()
  const docxPath = join(root, 'tmp/cg7-fixtures/U03_SOURCE.docx')
  const bytes = readFileSync(docxPath)
  const sourceBlocks = await indexDocxForTransform(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
  const scenarios = buildCg7Scenarios()
  const scenario = scenarios.find((s) => s.caseId === 'U03')!
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
  } as any)
  const protectedData = {
    exactProtectedValues: [] as string[],
    protectedPatterns: [] as import('../types').ProtectedPattern[],
  }

  const locEv = discoverFilledLocationEvidence(sourceBlocks)
  const partyEv = discoverFilledPartyEvidence(sourceBlocks)
  const manifest = buildExpectationManifest({
    sourceBlocks,
    dataset,
    protectedData,
  })
  const placement = classifyAdditionalServicesPlacement(sourceBlocks)
  const paymentStart = findPaymentStartIndex(sourceBlocks)
  const paymentRegion = findAtomicPaymentRegion(sourceBlocks)

  // Free replay: source text as "model output" → deterministic repairs only
  const gate = runPostReconstructionQualityGate({
    sourceBlocks,
    transformedBlocks: sourceBlocks.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    })),
    dataset,
    protectedData,
    mode: 'full_ai',
  })

  const prepBlock = gate.blocks.find((b) => b.blockId === 'para-7')
  const partyBlock = gate.blocks.find((b) => b.blockId === 'para-2')
  const blocking = gate.report.blockingIssues.map(
    (i) => `${i.code}:${i.canonicalField ?? ''}:${i.blockId ?? ''}`,
  )

  const dualPrep =
    /Słoneczna/i.test(prepBlock?.text ?? '') &&
    /Wiosenna/i.test(prepBlock?.text ?? '')
      ? 'FIXED'
      : 'STILL_MODEL_DEPENDENT'
  const party =
    /Anna|Jan/i.test(partyBlock?.text ?? '') &&
    !/Olgą|Michałem/i.test(partyBlock?.text ?? '')
      ? 'FIXED'
      : 'STILL_MODEL_DEPENDENT'
  const providerRole = blocking.some((b) =>
    b.startsWith('unnecessary_provider_role_rewrite'),
  )
    ? 'STILL_POSSIBLE'
    : 'PREVENTED'
  const extrasPlacement = blocking.some((b) =>
    b.startsWith('ADDITIONAL_SERVICES_AFTER_PAYMENT'),
  )
    ? 'STILL_INVALID'
    : 'FIXED'

  const out = {
    dualPrep,
    party,
    providerRole,
    extrasPlacement,
    downloadAllowed: gate.downloadAllowed,
    blocking,
    locEv: locEv.map((e) => ({
      blockId: e.blockId,
      role: e.role,
      nonSem: e.nonSemanticSurface,
      src: e.sourceText.slice(0, 80),
    })),
    partyEv: partyEv.map((e) => ({
      blockId: e.blockId,
      surfaces: e.identitySurfaces,
    })),
    represented: manifest.representedConcepts,
    placement,
    paymentStart,
    paymentRegion,
    prepAfter: prepBlock?.text?.slice(0, 220),
    partyAfter: partyBlock?.text?.slice(0, 180),
    note: 'Free replay uses source-as-model + deterministic repairs; party grammar still requires model.',
  }

  writeFileSync(
    join(root, 'tmp/cg7-paid/U03.REPLAY.json'),
    JSON.stringify(out, null, 2),
  )
  console.log(JSON.stringify(out, null, 2))
  console.log('\nU03_FREE_REPLAY_WRITTEN')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
