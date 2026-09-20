import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildGoldenScenarios } from './goldenScenarios'
import { buildProtectedContractData } from '../protectedContractData'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { discoverFilledPartyEvidence } from '../quality/partyFilledIdentity'
import { textContainsNormalized } from '../quality/normalize'

async function main() {
  const scenario = buildGoldenScenarios().find((s) => s.caseId === 'G01')!
  const buf = readFileSync(
    'tmp/golden-contract-validation/SOURCE/' + scenario.sourceFile,
  )
  const blocks = await indexDocxForTransform(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  )
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-11-05',
  })
  const protectedData = buildProtectedContractData({ blocks })
  const changed = JSON.parse(
    readFileSync('tmp/golden-fix-1/G01_RAW_MODEL_CHANGED_BLOCKS.json', 'utf8'),
  ) as Array<{ blockId: string; modelOutput: string }>
  const transformed = blocks.map((b) => {
    const c = changed.find((x) => x.blockId === b.blockId)
    return { blockId: b.blockId, text: c ? c.modelOutput : b.text }
  })
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: blocks,
    transformedBlocks: transformed,
    dataset,
    protectedData,
    mode: 'full_ai',
  })
  const para2 = gate.blocks.find((b) => b.blockId === 'para-2')!
  const out = {
    downloadAllowed: gate.downloadAllowed,
    blocking: gate.report.blockingIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId}`,
    ),
    review: gate.report.reviewIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId}`,
    ),
    repairs: gate.report.repairs,
    partyEvidence: discoverFilledPartyEvidence(blocks).map((e) => e.blockId),
    para2: para2.text,
    providerNipPresent: /000-000-00-01|0000000001/.test(para2.text),
    providerEmailPresent: /kontakt@atelier-szept\.example/i.test(para2.text),
    customerAddressPresent: textContainsNormalized(
      para2.text,
      'ul. Kasztanowa 21/5, 60-214 Poznań',
    ),
    customerNamePresent: /Zofia|Kalendarzow/i.test(para2.text),
    staleAlicja: /Alicj/i.test(para2.text),
    note: 'Replay of forensic model changedBlocks through NEW postprocess/gate. Prevention of sending provider spans to the model is NOT proven by this replay.',
  }
  mkdirSync('tmp/golden-fix-1', { recursive: true })
  writeFileSync(
    join('tmp/golden-fix-1', 'G01_REPLAY_THROUGH_FIX.json'),
    JSON.stringify(out, null, 2),
  )
  console.log(JSON.stringify(out, null, 2))
}
main()
