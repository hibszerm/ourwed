/**
 * Golden Fix 2 — free replay of preserved Fix1 model response through corrected pipeline.
 *
 *   npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/cg7/replayG01Fix2Free.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildProtectedContractData } from '../protectedContractData'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { textContainsNormalized } from '../quality/normalize'
import { buildGoldenScenarios } from './goldenScenarios'

async function main() {
  const out = join(process.cwd(), 'tmp/golden-fix-2')
  mkdirSync(out, { recursive: true })
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

  const raw = JSON.parse(
    readFileSync('tmp/golden-fix-1/G01_RAW_MODEL_CHANGED_BLOCKS.json', 'utf8'),
  ) as Array<{ blockId: string; modelOutput: string }>
  const byModel = new Map(raw.map((r) => [r.blockId, r.modelOutput]))

  // Limitation: preserved RAW may predate Fix2 authorization of package/headline.
  const transformed = blocks.map((b) => ({
    blockId: b.blockId,
    text: byModel.get(b.blockId) ?? b.text,
  }))

  const gate = runPostReconstructionQualityGate({
    sourceBlocks: blocks,
    transformedBlocks: transformed,
    dataset,
    protectedData,
    mode: 'full_ai',
  })

  const byId = Object.fromEntries(gate.blocks.map((b) => [b.blockId, b.text]))
  const joined = gate.blocks.map((b) => b.text).join('\n')

  const checks = {
    para1Party: /Zofi[ai].*Kalendarzow/i.test(byId['para-1'] ?? ''),
    para1Date: /18 września 2027|18\.09\.2027/.test(byId['para-1'] ?? ''),
    para1NotStale: !/Alicj|Tomasz Modelow|12 czerwca 2027/.test(
      byId['para-1'] ?? '',
    ),
    mixedProvider:
      /Magdalena|Atelier Szept|000-000-00-01|000000001|kontakt@atelier-szept/.test(
        byId['para-2'] ?? '',
      ),
    customerAddress: textContainsNormalized(
      byId['para-2'] ?? '',
      'ul. Kasztanowa 21/5, 60-214 Poznań',
    ),
    package:
      /Reportaż Wieczorny/.test(joined) && !/Klasyczny Reportaż/.test(joined),
    total: /11 200 zł/.test(joined) && !/11 211 200/.test(joined),
    deposit: /2 500 zł/.test(joined) && !/1 500,\s*2 500/.test(joined),
    remaining: /8 700 zł/.test(joined) && !/6 900,\s*8 700/.test(joined),
    words: /jedenaście tysięcy dwieście złotych/.test(joined),
    unrelated1200: /1 200(?:,00)? zł/.test(joined),
    unrelated650: /650(?:,00)? zł/.test(joined),
    unrelated980: /980(?:,00)? zł/.test(joined),
    downloadAllowed: gate.downloadAllowed,
  }

  const pass = Object.values(checks).every((v) => v === true)

  const report = {
    pass,
    checks,
    blocking: gate.report.blockingIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId}`,
    ),
    review: gate.report.reviewIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId}`,
    ),
    repairs: gate.report.repairs.map((r) => `${r.repairCode}@${r.blockId}`),
    limitation:
      'Preserved Fix1 RAW model response may not include pre-model authorization changes for package/headline. Deterministic layer repairs those surfaces on replay.',
    para1: byId['para-1'],
    para2: byId['para-2'],
    para5: byId['para-5'],
    para12: byId['para-12'],
    para13: byId['para-13'],
    para14: byId['para-14'],
  }
  writeFileSync(join(out, 'G01_FREE_REPLAY.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!pass) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
