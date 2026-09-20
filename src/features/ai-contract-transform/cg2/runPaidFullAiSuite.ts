/**
 * CG2 paid full-AI suite — production-equivalent rewrite + postprocess + DOCX.
 *
 * Opt-in:
 *   CG2_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg2-contract-paid-eval
 *
 * CRM-clean: synthetic fixtures only. No Edge auth / no production DB.
 */

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSparseProductTransform } from '../transformService'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { analyzeExtrasPlacement, reopenParses, snapshotDocx } from '../cg1/docxInspect'
import { buildCg1ScenarioMatrix, type Cg1Scenario } from '../cg1/scenarios'
import {
  TORTURE_TEMPLATE_META,
  buildTortureTemplate,
  type TortureTemplateId,
} from '../cg1/tortureTemplates'
import { normalizeForMatch } from '../quality/normalize'
import {
  createLocalFullRewriteInvoke,
  createUsageTracker,
  type Cg2InvokeUsage,
} from './localFullRewriteInvoke'
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import { textLooksLikeServicePriceOrQuantity } from '../contractAdditionalServices'

/** Prioritized paid cases — max structural coverage, ~10–12 calls. */
const PAID_CASE_IDS = [
  'T01_EXTRAS',
  'T02_EXTRAS',
  'T03_EXTRAS',
  'T04_EXTRAS',
  'T05_BASE',
  'T06_EXTRAS',
  'T07_EXTRAS',
  'T08_EXTRAS',
  'T09_EXTRAS',
  'T10_EXTRAS',
  'T02_BASE',
  'T05_EXTRAS',
] as const

export type Cg2CaseResult = {
  scenarioId: string
  templateId: TortureTemplateId
  parties: 1 | 2
  extrasMode: string
  llm: 'PASS' | 'FAIL'
  docx: 'PASS' | 'FAIL'
  data: 'PASS' | 'FAIL' | 'PARTIAL'
  placement: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A'
  structure: 'PASS' | 'FAIL'
  extrasPricesAbsent: 'PASS' | 'FAIL' | 'N/A'
  hallucination: 'PASS' | 'FAIL'
  minimalEdit: 'PASS' | 'PARTIAL' | 'FAIL'
  overall: 'PASS' | 'PARTIAL' | 'FAIL'
  model?: string
  durationMs?: number
  blocksTotal: number
  blocksChanged: number
  why: string
  outputPath?: string
  reviewName?: string
}

function commercialTotalFor(scenario: Cg1Scenario): number {
  const extrasSum = scenario.extras.reduce(
    (n, e) => n + (e.priceSnapshot ?? 0) * (e.quantity ?? 1),
    0,
  )
  // Base package portion so wedding.price = canonical total including extras names' commercial truth
  return 10000 + extrasSum
}

function withCommercialTruth(scenario: Cg1Scenario): Cg1Scenario {
  const total = commercialTotalFor(scenario)
  const deposit = Math.round(total * 0.28)
  return {
    ...scenario,
    wedding: {
      ...scenario.wedding,
      price: total,
      depositAmount: deposit,
    } as typeof scenario.wedding,
  }
}

function hasIndividualExtraPrices(
  texts: string[],
  expectedNames: string[],
): boolean {
  if (expectedNames.length === 0) return false
  for (const name of expectedNames) {
    for (const text of texts) {
      for (const line of text.split('\n')) {
        if (
          normalizeForMatch(line).includes(normalizeForMatch(name)) &&
          textLooksLikeServicePriceOrQuantity(line)
        ) {
          return true
        }
      }
    }
  }
  return false
}

function hallucinationCheck(input: {
  texts: string[]
  scenario: Cg1Scenario
}): { ok: boolean; detail: string } {
  const blob = input.texts.join('\n')
  const forbiddenPeople = [
    'Anna Kowalska',
    'Jan Kowalski',
    'Jan Nowak',
    'PLACEHOLDER_STRONY',
  ]
  // Template placeholders should be replaced when AI touches party blocks;
  // leftover PLACEHOLDER_* in party-intro context after rewrite is a miss, not hallucination.
  const invented = [
    'Maria Wiśniewska',
    'Piotr Zieliński',
    'ul. Nieistniejąca',
    'Kościół Mariacki',
  ]
  for (const name of invented) {
    if (blob.includes(name)) {
      return { ok: false, detail: `invented:${name}` }
    }
  }
  // Fake partner for one-person
  if (input.scenario.partyMode === 'one' && /jan\s+pr[oó]bny/i.test(blob)) {
    return { ok: false, detail: 'fake_second_person' }
  }
  for (const name of forbiddenPeople) {
    if (blob.includes(name) && !input.scenario.wedding.couple?.partner1?.includes('Kowalska')) {
      // only flag if not our synthetic - our synthetics are Anna Testowa / Jan Próbny
      if (/Anna Kowalska|Jan Kowalski/.test(name) && blob.includes(name)) {
        return { ok: false, detail: `stale_template_person:${name}` }
      }
    }
  }
  return { ok: true, detail: 'ok' }
}

function reviewFileName(scenario: Cg1Scenario, index: number): string {
  const party = scenario.partyMode === 'one' ? 'ONE_PERSON' : 'TWO_PEOPLE'
  const extras = scenario.extrasMode === 'none' ? 'NO_EXTRAS' : 'EXTRAS'
  const n = String(index + 1).padStart(2, '0')
  return `${n}_${scenario.templateId}_${party}_${extras}.docx`
}

export async function runCg2PaidSuite(input: {
  apiKey: string
  artifactDir?: string
  reviewDir?: string
}): Promise<{
  results: Cg2CaseResult[]
  usage: Cg2InvokeUsage
  summary: { total: number; pass: number; partial: number; fail: number }
}> {
  const artifactDir = input.artifactDir ?? 'tmp/cg2-artifacts/current-model'
  const reviewDir = input.reviewDir ?? 'tmp/cg2-owner-review'
  mkdirSync(artifactDir, { recursive: true })
  mkdirSync(reviewDir, { recursive: true })

  const usage = createUsageTracker()
  const invoke = createLocalFullRewriteInvoke({
    apiKey: input.apiKey,
    usage,
  })

  const all = buildCg1ScenarioMatrix().map(withCommercialTruth)
  const selected = PAID_CASE_IDS.map((id) => {
    const s = all.find((x) => x.scenarioId === id)
    if (!s) throw new Error(`missing scenario ${id}`)
    return s
  })

  const templateCache = new Map<TortureTemplateId, ArrayBuffer>()
  const results: Cg2CaseResult[] = []

  for (let i = 0; i < selected.length; i++) {
    const scenario = selected[i]!
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

    const started = Date.now()
    const transform = await runSparseProductTransform({
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke,
    })
    const durationMs = Date.now() - started

    if (!transform.ok) {
      results.push({
        scenarioId: scenario.scenarioId,
        templateId: scenario.templateId,
        parties: scenario.partyMode === 'one' ? 1 : 2,
        extrasMode: scenario.extrasMode,
        llm: 'FAIL',
        docx: 'FAIL',
        data: 'FAIL',
        placement: 'FAIL',
        structure: 'FAIL',
        extrasPricesAbsent: 'N/A',
        hallucination: 'FAIL',
        minimalEdit: 'FAIL',
        overall: 'FAIL',
        model: transform.model,
        durationMs,
        blocksTotal: sourceBlocks.length,
        blocksChanged: 0,
        why: `${transform.reason}:${transform.message}`,
      })
      continue
    }

    const reopenOk = await reopenParses(transform.outputBytes)
    const outPath = join(artifactDir, `${scenario.scenarioId}.docx`)
    writeFileSync(outPath, Buffer.from(transform.outputBytes))
    const reviewName = reviewFileName(scenario, i)
    copyFileSync(outPath, join(reviewDir, reviewName))

    const snap = await snapshotDocx(transform.outputBytes)
    const expectedNames = (dataset.additionalServices ?? []).map((s) => s.name)
    const expanded = expandBlocksWithParagraphInsertions({
      sourceBlocks,
      blocks: transform.transformedBlocks,
      insertions: transform.paragraphInsertions ?? [],
    })
    const { classifyAdditionalServicesPlacement } = await import(
      '../additionalServicesPlacement'
    )
    const classy = classifyAdditionalServicesPlacement(sourceBlocks)
    const placement = analyzeExtrasPlacement({
      blocks: expanded,
      expectedNames,
      placementMode: classy.mode,
      targetBlockId:
        classy.mode === 'safe_placement_not_found'
          ? undefined
          : classy.targetBlockId,
    })

    const pricesPresent = hasIndividualExtraPrices(snap.texts, expectedNames)
    const hallu = hallucinationCheck({ texts: snap.texts, scenario })

    const changed = transform.qualityReport
      ? // changed count from edge diagnostics if present
        (transform as { changedBlockCount?: number }).changedBlockCount
      : undefined
    // Prefer API-reported changed count via model path — use transformed vs source diff
    let blocksChanged = 0
    for (const src of sourceBlocks) {
      const t = transform.transformedBlocks.find((b) => b.blockId === src.blockId)
      if (t && t.text !== src.text) blocksChanged += 1
    }
    void changed

    const changeRatio = blocksChanged / Math.max(1, sourceBlocks.length)
    const minimalEdit: 'PASS' | 'PARTIAL' | 'FAIL' =
      changeRatio > 0.85
        ? 'FAIL'
        : changeRatio > 0.55
          ? 'PARTIAL'
          : 'PASS'

    // Data checks
    const needName = scenario.wedding.couple?.partner1 ?? ''
    const hasPartner1 = snap.texts.some((t) => t.includes(needName))
    const partner2 = scenario.wedding.couple?.partner2
    const hasPartner2 = partner2
      ? snap.texts.some((t) => t.includes(partner2))
      : true
    const totalStr = String(scenario.wedding.price ?? '')
    const hasTotalHint =
      !totalStr ||
      snap.texts.some((t) => t.includes(totalStr) || t.includes(totalStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')))

    let data: 'PASS' | 'FAIL' | 'PARTIAL' = 'PASS'
    if (!hasPartner1) data = 'FAIL'
    else if (scenario.partyMode === 'two' && !hasPartner2) data = 'FAIL'
    else if (scenario.partyMode === 'one' && partner2 && snap.texts.some((t) => t.includes(partner2)))
      data = 'FAIL'
    else if (!hasTotalHint && scenario.extrasMode !== 'none') data = 'PARTIAL'

    const extrasPricesAbsent: 'PASS' | 'FAIL' | 'N/A' =
      expectedNames.length === 0 ? 'N/A' : pricesPresent ? 'FAIL' : 'PASS'

    const placementResult: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A' =
      expectedNames.length === 0
        ? placement.placementValid
          ? 'PASS'
          : 'FAIL'
        : placement.placementValid && placement.extrasComplete
          ? 'PASS'
          : placement.extrasPresent
            ? 'PARTIAL'
            : 'FAIL'

    const llm: 'PASS' | 'FAIL' = 'PASS'
    const docx: 'PASS' | 'FAIL' = reopenOk ? 'PASS' : 'FAIL'
    const structure: 'PASS' | 'FAIL' = reopenOk ? 'PASS' : 'FAIL'
    const hallucination: 'PASS' | 'FAIL' = hallu.ok ? 'PASS' : 'FAIL'

    const placementForOverall: 'PASS' | 'FAIL' | 'PARTIAL' =
      placementResult === 'FAIL'
        ? 'FAIL'
        : placementResult === 'PARTIAL'
          ? 'PARTIAL'
          : 'PASS'
    const extrasPricesForOverall: 'PASS' | 'FAIL' | 'PARTIAL' =
      extrasPricesAbsent === 'FAIL' ? 'FAIL' : 'PASS'
    const flags: Array<'PASS' | 'FAIL' | 'PARTIAL'> = [
      llm,
      docx,
      data,
      placementForOverall,
      structure,
      extrasPricesForOverall,
      hallucination,
      minimalEdit,
    ]
    const overall: 'PASS' | 'PARTIAL' | 'FAIL' = flags.includes('FAIL')
      ? 'FAIL'
      : flags.includes('PARTIAL')
        ? 'PARTIAL'
        : 'PASS'

    const whyParts = [
      placement.why,
      hallu.detail,
      pricesPresent ? 'extras_prices_shown' : null,
      `changed=${blocksChanged}/${sourceBlocks.length}`,
    ].filter(Boolean)

    writeFileSync(
      join(artifactDir, `${scenario.scenarioId}.json`),
      JSON.stringify(
        {
          scenarioId: scenario.scenarioId,
          meta: meta.title,
          model: transform.model,
          durationMs,
          blocksTotal: sourceBlocks.length,
          blocksChanged,
          blockingIssues: transform.blockingIssues,
          reviewIssues: transform.reviewIssues,
          placement,
          extrasPricesAbsent,
          hallucination: hallu,
          snapshotTexts: snap.texts.slice(0, 50),
        },
        null,
        2,
      ),
    )

    results.push({
      scenarioId: scenario.scenarioId,
      templateId: scenario.templateId,
      parties: scenario.partyMode === 'one' ? 1 : 2,
      extrasMode: scenario.extrasMode,
      llm,
      docx,
      data,
      placement: placementResult,
      structure,
      extrasPricesAbsent,
      hallucination,
      minimalEdit,
      overall,
      model: transform.model,
      durationMs,
      blocksTotal: sourceBlocks.length,
      blocksChanged,
      why: whyParts.join(';'),
      outputPath: outPath,
      reviewName,
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
    JSON.stringify({ summary, usage, results }, null, 2),
  )

  // Owner README
  const readme = [
    '# CG2 Owner review — current model outputs',
    '',
    `Model: ${usage.model}`,
    `Prompt: ${usage.promptVersion}`,
    '',
    'Synthetic QA documents only. No real customer data.',
    '',
    'Product rule: extras show NAMES only — no individual prices.',
    '',
    '| File | Case | Notes |',
    '|------|------|-------|',
    ...results.map((r) => {
      const meta = TORTURE_TEMPLATE_META.find((m) => m.id === r.templateId)!
      return `| ${r.reviewName} | ${r.scenarioId} (${r.overall}) | ${meta.structure}; parties=${r.parties}; extras=${r.extrasMode} |`
    }),
    '',
  ].join('\n')
  writeFileSync(join(reviewDir, 'README.md'), readme)

  return { results, usage, summary }
}

function estimatePlan() {
  return {
    PLANNED_PAID_CALLS: PAID_CASE_IDS.length,
    EXPECTED_RETRY_MAX: PAID_CASE_IDS.length * 2,
    APPROX_INPUT_TOKENS: PAID_CASE_IDS.length * 4500,
    APPROX_OUTPUT_TOKENS: PAID_CASE_IDS.length * 1200,
    APPROX_COST_USD: Number(
      ((PAID_CASE_IDS.length * 4500 * 0.4 + PAID_CASE_IDS.length * 1200 * 1.6) /
        1_000_000).toFixed(3),
    ),
    cases: [...PAID_CASE_IDS],
    model: 'gpt-4.1-mini (default)',
    note: 'Cost is rough gpt-4.1-mini order-of-magnitude; actual tracked after run.',
  }
}

async function main() {
  const paid = process.env.CG2_PAID_EVAL === '1'
  const key = process.env.OPENAI_API_KEY?.trim()

  console.log('CG2_PLAN', JSON.stringify(estimatePlan(), null, 2))

  if (!paid) {
    console.log(
      JSON.stringify({
        status: 'SKIPPED',
        reason: 'CG2_PAID_EVAL not set to 1',
        command:
          'CG2_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg2-contract-paid-eval',
      }),
    )
    process.exit(0)
  }

  if (!key) {
    console.log('CG2_BLOCKED_SAFE_OPENAI_CREDENTIAL_REQUIRED')
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'OPENAI_API_KEY absent',
        command:
          'CG2_PAID_EVAL=1 OPENAI_API_KEY=sk-… npm run test:cg2-contract-paid-eval',
        note: 'Inject key via environment only. Do not commit. Do not pull Edge secrets automatically.',
      }),
    )
    process.exitCode = 2
    return
  }

  const { results, usage, summary } = await runCg2PaidSuite({ apiKey: key })
  console.log('\nCG2 PAID MATRIX')
  for (const r of results) {
    console.log(
      [
        r.scenarioId,
        r.parties,
        r.extrasMode,
        r.llm,
        r.docx,
        r.data,
        r.placement,
        r.extrasPricesAbsent,
        r.overall,
        r.why,
      ].join(' | '),
    )
  }
  console.log('\nSUMMARY', summary)
  console.log('USAGE', {
    model: usage.model,
    calls: usage.calls,
    retries: usage.retries,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    medianLatencyMs:
      usage.latenciesMs.length === 0
        ? null
        : [...usage.latenciesMs].sort((a, b) => a - b)[
            Math.floor(usage.latenciesMs.length / 2)
          ],
    maxLatencyMs:
      usage.latenciesMs.length === 0 ? null : Math.max(...usage.latenciesMs),
  })
  if (summary.fail > 0) process.exitCode = 1
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('runPaidFullAiSuite')

if (isDirect) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
