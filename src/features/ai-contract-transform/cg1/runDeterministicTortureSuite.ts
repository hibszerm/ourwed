/**
 * CG1 deterministic torture suite — placement + insertion + DOCX roundtrip.
 * No paid OpenAI calls.
 *
 * Run: npm run test:cg1-contract-torture
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyAdditionalServicesPlacement } from '../additionalServicesPlacement'
import { insertAdditionalServicesIntoBlocks } from '../insertAdditionalServices'
import { writeTransformedDocx } from '../docxTransformWriter'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import type { TransformedBlock } from '../types'
import {
  analyzeExtrasPlacement,
  reopenParses,
  snapshotDocx,
} from './docxInspect'
import { buildCg1ScenarioMatrix } from './scenarios'
import {
  TORTURE_TEMPLATE_META,
  buildTortureTemplate,
  writeAllTortureTemplates,
  type TortureTemplateId,
} from './tortureTemplates'

export type Cg1CaseResult = {
  scenarioId: string
  templateId: TortureTemplateId
  structure: string
  parties: 1 | 2
  extrasMode: string
  explicitExtrasArea: boolean
  generation: 'PASS' | 'FAIL' | 'PARTIAL'
  placement: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A'
  data: 'PASS' | 'FAIL' | 'PARTIAL'
  structureResult: 'PASS' | 'FAIL'
  overall: 'PASS' | 'FAIL' | 'PARTIAL'
  placementMode: string
  extrasLocation: string
  why: string
  reopenOk: boolean
  outputPath?: string
}

function overallOf(parts: Array<'PASS' | 'FAIL' | 'PARTIAL' | 'N/A'>): 'PASS' | 'FAIL' | 'PARTIAL' {
  if (parts.includes('FAIL')) return 'FAIL'
  if (parts.includes('PARTIAL')) return 'PARTIAL'
  return 'PASS'
}

export async function runDeterministicTortureSuite(opts?: {
  artifactDir?: string
  writeTemplatesDir?: string
}): Promise<{
  results: Cg1CaseResult[]
  summary: { total: number; pass: number; partial: number; fail: number }
}> {
  const artifactDir = opts?.artifactDir ?? 'tmp/cg1-artifacts/deterministic'
  mkdirSync(artifactDir, { recursive: true })
  if (opts?.writeTemplatesDir) {
    await writeAllTortureTemplates(opts.writeTemplatesDir)
  }

  const scenarios = buildCg1ScenarioMatrix()
  const templateCache = new Map<TortureTemplateId, ArrayBuffer>()
  const results: Cg1CaseResult[] = []

  for (const scenario of scenarios) {
    const meta = TORTURE_TEMPLATE_META.find((m) => m.id === scenario.templateId)!
    let sourceBytes = templateCache.get(scenario.templateId)
    if (!sourceBytes) {
      sourceBytes = await buildTortureTemplate(scenario.templateId)
      templateCache.set(scenario.templateId, sourceBytes)
    }

    const sourceBlocks = await indexDocxForTransform(sourceBytes)
    const dataset = buildContractTransformationDataset({
      wedding: scenario.wedding,
      package: scenario.package,
      extras: scenario.extras,
    })

    const placement = classifyAdditionalServicesPlacement(sourceBlocks)
    const identityBlocks: TransformedBlock[] = sourceBlocks.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    }))

    const inserted = insertAdditionalServicesIntoBlocks({
      blocks: identityBlocks,
      sourceBlocks,
      dataset,
      placement,
    })

    const expanded = expandBlocksWithParagraphInsertions({
      blocks: inserted.blocks,
      sourceBlocks,
      insertions: inserted.paragraphInsertions,
    })

    let outputBytes: ArrayBuffer
    let reopenOk = false
    let outputPath: string | undefined
    try {
      outputBytes = await writeTransformedDocx({
        sourceBytes,
        sourceBlocks,
        transformedBlocks: inserted.blocks,
        paragraphInsertions: inserted.paragraphInsertions,
      })
      reopenOk = await reopenParses(outputBytes)
      outputPath = join(artifactDir, `${scenario.scenarioId}.docx`)
      writeFileSync(outputPath, Buffer.from(outputBytes))
    } catch (err) {
      results.push({
        scenarioId: scenario.scenarioId,
        templateId: scenario.templateId,
        structure: meta.structure,
        parties: scenario.partyMode === 'one' ? 1 : 2,
        extrasMode: scenario.extrasMode,
        explicitExtrasArea: meta.hasExplicitExtrasSection,
        generation: 'FAIL',
        placement: 'FAIL',
        data: 'FAIL',
        structureResult: 'FAIL',
        overall: 'FAIL',
        placementMode: placement.mode,
        extrasLocation: 'unknown',
        why: `docx_write_failed:${err instanceof Error ? err.message : String(err)}`,
        reopenOk: false,
      })
      continue
    }

    const expectedNames = (dataset.additionalServices ?? []).map((s) => s.name)
    const analysis = analyzeExtrasPlacement({
      blocks: expanded,
      expectedNames,
      placementMode: inserted.diagnostics.additionalServicesPlacementMode,
      targetBlockId: inserted.diagnostics.additionalServicesTargetBlockId,
    })

    // Mode expectation check
    let placementResult: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A' = 'N/A'
    if (scenario.extrasMode === 'none') {
      placementResult = analysis.placementValid ? 'PASS' : 'FAIL'
    } else if (placement.mode === 'safe_placement_not_found') {
      // Safe skip is acceptable for weak anchors (I27) — PARTIAL if no insert
      placementResult = analysis.extrasComplete ? 'PASS' : 'PARTIAL'
    } else if (!meta.expectedPlacementModes.includes(placement.mode as never)) {
      placementResult = analysis.placementValid ? 'PARTIAL' : 'FAIL'
    } else {
      placementResult = analysis.placementValid && analysis.extrasComplete ? 'PASS' : 'FAIL'
    }

    const partyOk =
      scenario.partyMode === 'one'
        ? dataset.clients.personCount === 1
        : dataset.clients.personCount === 2
    const dataResult: 'PASS' | 'FAIL' = partyOk ? 'PASS' : 'FAIL'
    const structureResult: 'PASS' | 'FAIL' = reopenOk ? 'PASS' : 'FAIL'
    const generation: 'PASS' | 'FAIL' = reopenOk ? 'PASS' : 'FAIL'

    const snap = await snapshotDocx(outputBytes)
    writeFileSync(
      join(artifactDir, `${scenario.scenarioId}.snapshot.json`),
      JSON.stringify(
        {
          scenario,
          placement,
          diagnostics: inserted.diagnostics,
          analysis,
          snapshot: { ...snap, texts: snap.texts.slice(0, 40) },
        },
        null,
        2,
      ),
    )

    const placementForOverall: 'PASS' | 'FAIL' | 'PARTIAL' =
      placementResult === 'FAIL'
        ? 'FAIL'
        : placementResult === 'PARTIAL'
          ? 'PARTIAL'
          : 'PASS'
    const overall = overallOf([
      generation,
      placementForOverall,
      dataResult,
      structureResult,
    ])

    results.push({
      scenarioId: scenario.scenarioId,
      templateId: scenario.templateId,
      structure: meta.structure,
      parties: scenario.partyMode === 'one' ? 1 : 2,
      extrasMode: scenario.extrasMode,
      explicitExtrasArea: meta.hasExplicitExtrasSection,
      generation,
      placement: placementResult,
      data: dataResult,
      structureResult,
      overall,
      placementMode: placement.mode,
      extrasLocation: analysis.extrasLocation,
      why: analysis.why,
      reopenOk,
      outputPath,
    })
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.overall === 'PASS').length,
    partial: results.filter((r) => r.overall === 'PARTIAL').length,
    fail: results.filter((r) => r.overall === 'FAIL').length,
  }

  writeFileSync(
    join(artifactDir, 'MATRIX.json'),
    JSON.stringify({ summary, results }, null, 2),
  )

  return { results, summary }
}

async function main() {
  const { results, summary } = await runDeterministicTortureSuite({
    artifactDir: 'tmp/cg1-artifacts/deterministic',
    writeTemplatesDir: 'tests/fixtures/contracts/templates',
  })
  console.log('\nCG1 DETERMINISTIC MATRIX')
  console.log(
    'ID | Parties | Extras | Explicit | Gen | Place | Data | Struct | Overall | Mode | Why',
  )
  for (const r of results) {
    console.log(
      [
        r.scenarioId,
        r.parties,
        r.extrasMode,
        r.explicitExtrasArea ? 'Y' : 'N',
        r.generation,
        r.placement,
        r.data,
        r.structureResult,
        r.overall,
        r.placementMode,
        r.why,
      ].join(' | '),
    )
  }
  console.log('\nSUMMARY', summary)
  if (summary.fail > 0) process.exitCode = 1
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('runDeterministicTortureSuite')

if (isDirect) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
