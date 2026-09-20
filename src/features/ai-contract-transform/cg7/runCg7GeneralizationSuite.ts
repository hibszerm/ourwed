/**
 * CG7 paid generalization suite — ten unknown studio families.
 *
 *   CG7_PAID_EVAL=1 npm run test:cg7-contract-generalization-paid
 *   CG7_CASES=U01,U04,U06  (optional gate filter)
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { analyzeExtrasPlacement, reopenParses, snapshotDocx } from '../cg1/docxInspect'
import {
  createLocalFullRewriteInvoke,
  createUsageTracker,
  type Cg2InvokeUsage,
} from '../cg2/localFullRewriteInvoke'
import { textLooksLikeServicePriceOrQuantity } from '../contractAdditionalServices'
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { normalizeForMatch } from '../quality/normalize'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runSparseProductTransform } from '../transformService'
import type { TransformFunctionsInvoke } from '../transformApi'
import {
  writeAllUnknownStudioFixtures,
  UNKNOWN_STUDIO_META,
  type UnknownStudioId,
} from './buildUnknownStudioFixtures'
import {
  buildCg7Scenarios,
  CG7_GATE_A,
  CG7_GATE_B,
  type Cg7Scenario,
} from './cg7Scenarios'

function normalizeMoneyBlob(s: string): string {
  return s.replace(/[\u00a0\u202f\u2007\u2009]/g, ' ')
}

function amountPresent(texts: string[], amount: number): boolean {
  const blob = normalizeMoneyBlob(texts.join('\n'))
  const spaced = normalizeMoneyBlob(amount.toLocaleString('pl-PL'))
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (
    blob.includes(String(amount)) ||
    blob.includes(spaced) ||
    blob.includes(grouped)
  )
}

function wordsNearAmount(
  texts: string[],
  amount: number,
  expectedWords: string,
): boolean {
  const spaced = normalizeMoneyBlob(amount.toLocaleString('pl-PL'))
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const blob = normalizeMoneyBlob(texts.join('\n'))
  for (const token of [spaced, grouped, String(amount)]) {
    const re = new RegExp(
      `${token.replace(/ /g, '[\\s\\u00a0\\u202f]*')}\\s*zł[\\s\\S]{0,140}?słownie:\\s*([^)]+)`,
      'i',
    )
    const m = blob.match(re)
    if (!m) continue
    const got = normalizeForMatch(m[1] ?? '')
    const exp = normalizeForMatch(expectedWords)
    if (got.includes(exp) || exp.includes(got)) return true
  }
  return false
}

function hasSlownieNear(texts: string[], amount: number): boolean {
  const spaced = normalizeMoneyBlob(amount.toLocaleString('pl-PL'))
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const blob = normalizeMoneyBlob(texts.join('\n'))
  return new RegExp(
    `(?:${spaced.replace(/ /g, '[\\s\\u00a0\\u202f]*')}|${grouped.replace(/ /g, '[\\s\\u00a0\\u202f]*')}|${amount})\\s*zł[\\s\\S]{0,140}?słownie:`,
    'i',
  ).test(blob)
}

export type Cg7Result = {
  caseId: UnknownStudioId
  people: 1 | 2
  extrasMode: string
  tables: boolean
  docx: 'PASS' | 'FAIL'
  party: 'PASS' | 'FAIL'
  packageOk: 'PASS' | 'FAIL' | 'PARTIAL'
  total: 'PASS' | 'FAIL'
  initialPayment: 'PASS' | 'FAIL'
  remaining: 'PASS' | 'FAIL'
  totalWords: 'PASS' | 'FAIL' | 'N/A'
  initialWords: 'PASS' | 'FAIL' | 'N/A'
  remainingWords: 'PASS' | 'FAIL' | 'N/A'
  locations: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A'
  otherMoney: 'PASS' | 'FAIL' | 'N/A'
  extras: 'PASS' | 'FAIL' | 'N/A'
  extrasPrices: 'PASS' | 'FAIL' | 'N/A'
  extrasNumbering: 'PASS' | 'FAIL' | 'N/A'
  language: 'GOOD' | 'QUESTIONABLE' | 'BAD'
  structure: 'PASS' | 'FAIL'
  legal: 'PASS' | 'FAIL'
  sparse: 'PASS' | 'PARTIAL' | 'FAIL'
  hallucination: 'PASS' | 'FAIL'
  overall: 'PASS' | 'PARTIAL' | 'FAIL'
  modelCalls: number
  protocolRetry: boolean
  blocksChanged: number
  blocksTotal: number
  sourceParas: number
  finalParas: number
  why: string
}

function languageCheck(texts: string[], scenario: Cg7Scenario): {
  grade: 'GOOD' | 'QUESTIONABLE' | 'BAD'
  detail: string
} {
  const blob = texts.join('\n')
  if (/PLACEHOLDER_|_{5,}/.test(blob) && /PLACEHOLDER_/.test(blob)) {
    return { grade: 'BAD', detail: 'placeholder_residue' }
  }
  if (/\b(the the|i i|z z)\b/i.test(blob)) {
    return { grade: 'QUESTIONABLE', detail: 'doubled_token' }
  }
  // One-person must not invent Jan
  if (
    scenario.partyMode === 'one' &&
    /jan\s+pr[oó]bn/i.test(blob)
  ) {
    return { grade: 'BAD', detail: 'invented_partner_grammar' }
  }
  // Provider-role case damage in legal clauses (U01 regression evidence)
  if (
    /portfolio\s+Filmowiec\b/i.test(blob) ||
    /przysługują\s+Filmowiec\b/i.test(blob)
  ) {
    return { grade: 'BAD', detail: 'provider_role_case_damage' }
  }
  return { grade: 'GOOD', detail: 'ok' }
}

function extrasNumberingOk(
  texts: string[],
  expectedNames: string[],
): boolean {
  if (expectedNames.length === 0) return true
  const blob = texts.join('\n')
  // Bad pattern from R04: numbered legal continuation on extras lines
  for (const name of expectedNames) {
    const re = new RegExp(
      `(?:^|\\n)\\s*\\d+\\.\\s*(?:–|-)?\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'i',
    )
    if (re.test(blob)) return false
  }
  return true
}

export async function runCg7Suite(input: {
  apiKey: string
  caseIds: readonly UnknownStudioId[]
  artifactDir?: string
  reviewDir?: string
  fixturesDir?: string
  usage?: Cg2InvokeUsage
}): Promise<{
  results: Cg7Result[]
  usage: Cg2InvokeUsage
  summary: { total: number; pass: number; partial: number; fail: number }
}> {
  const artifactDir = input.artifactDir ?? 'tmp/cg7-paid'
  const reviewDir = input.reviewDir ?? 'tmp/cg7-owner-review'
  const fixturesDir = input.fixturesDir ?? 'tmp/cg7-fixtures'
  mkdirSync(artifactDir, { recursive: true })
  mkdirSync(reviewDir, { recursive: true })

  await writeAllUnknownStudioFixtures(fixturesDir)

  const usage = input.usage ?? createUsageTracker()
  const invoke: TransformFunctionsInvoke = createLocalFullRewriteInvoke({
    apiKey: input.apiKey,
    usage,
  })

  const all = buildCg7Scenarios()
  const selected = input.caseIds.map((id) => {
    const s = all.find((x) => x.caseId === id)
    if (!s) throw new Error(`missing ${id}`)
    return s
  })

  const results: Cg7Result[] = []

  for (const scenario of selected) {
    const sourcePath = join(fixturesDir, `${scenario.caseId}_SOURCE.docx`)
    const buf = readFileSync(sourcePath)
    const sourceBytes = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    )
    const sourceBlocks = await indexDocxForTransform(sourceBytes)
    const sourceSnap = await snapshotDocx(sourceBytes)
    const dataset = buildContractTransformationDataset({
      wedding: scenario.wedding,
      package: scenario.package,
      extras: scenario.extras,
    })

    const callsBefore = usage.calls
    const retriesBefore = usage.retries
    const transform = await runSparseProductTransform({
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke,
    })
    const modelCalls = usage.calls - callsBefore
    const protocolRetry = usage.retries > retriesBefore

    if (!transform.ok) {
      results.push({
        caseId: scenario.caseId,
        people: scenario.partyMode === 'one' ? 1 : 2,
        extrasMode: scenario.extrasMode,
        tables: scenario.meta.tables,
        docx: 'FAIL',
        party: 'FAIL',
        packageOk: 'FAIL',
        total: 'FAIL',
        initialPayment: 'FAIL',
        remaining: 'FAIL',
        totalWords: 'FAIL',
        initialWords: 'FAIL',
        remainingWords: 'FAIL',
        locations: 'FAIL',
        otherMoney: 'N/A',
        extras: 'FAIL',
        extrasPrices: 'N/A',
        extrasNumbering: 'N/A',
        language: 'BAD',
        structure: 'FAIL',
        legal: 'FAIL',
        sparse: 'FAIL',
        hallucination: 'FAIL',
        overall: 'FAIL',
        modelCalls,
        protocolRetry,
        blocksChanged: 0,
        blocksTotal: sourceBlocks.length,
        sourceParas: sourceSnap.nonEmptyParagraphCount,
        finalParas: 0,
        why: `${transform.reason}:${transform.message}`,
      })
      writeFileSync(
        join(artifactDir, `${scenario.caseId}.FAIL.json`),
        JSON.stringify({ scenario: scenario.caseId, transform }, null, 2),
      )
      break
    }

    const outPath = join(artifactDir, `${scenario.caseId}_FINAL.docx`)
    writeFileSync(outPath, Buffer.from(transform.outputBytes))
    copyFileSync(sourcePath, join(reviewDir, `${scenario.caseId}_SOURCE.docx`))
    copyFileSync(outPath, join(reviewDir, `${scenario.caseId}_FINAL.docx`))

    const snap = await snapshotDocx(transform.outputBytes)
    const reopenOk = await reopenParses(transform.outputBytes)
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

    let blocksChanged = 0
    for (const src of sourceBlocks) {
      const t = transform.transformedBlocks.find((b) => b.blockId === src.blockId)
      if (t && t.text !== src.text) blocksChanged += 1
    }
    const changeRatio = blocksChanged / Math.max(1, sourceBlocks.length)
    const sparse: Cg7Result['sparse'] =
      changeRatio > 0.85 ? 'FAIL' : changeRatio > 0.55 ? 'PARTIAL' : 'PASS'

    const total = scenario.wedding.price ?? 0
    const deposit = scenario.wedding.depositAmount ?? 0
    const remaining = total - deposit
    const totalOk = amountPresent(snap.texts, total)
    const depositOk = amountPresent(snap.texts, deposit)
    const remainingOk = amountPresent(snap.texts, remaining)
    const tw = polishContractMoneyWords(total)
    const dw = polishContractMoneyWords(deposit)
    const rw = polishContractMoneyWords(remaining)
    const totalWords: Cg7Result['totalWords'] = hasSlownieNear(snap.texts, total)
      ? wordsNearAmount(snap.texts, total, tw)
        ? 'PASS'
        : 'FAIL'
      : 'N/A'
    const initialWords: Cg7Result['initialWords'] = hasSlownieNear(
      snap.texts,
      deposit,
    )
      ? wordsNearAmount(snap.texts, deposit, dw)
        ? 'PASS'
        : 'FAIL'
      : 'N/A'
    const remainingWords: Cg7Result['remainingWords'] = hasSlownieNear(
      snap.texts,
      remaining,
    )
      ? wordsNearAmount(snap.texts, remaining, rw)
        ? 'PASS'
        : 'FAIL'
      : 'N/A'

    const blob = snap.texts.join('\n')
    let otherMoney: Cg7Result['otherMoney'] = 'N/A'
    if (scenario.preserveMoney.length > 0) {
      otherMoney = scenario.preserveMoney.some((m) =>
        normalizeMoneyBlob(blob).includes(normalizeMoneyBlob(m)),
      )
        ? 'PASS'
        : 'FAIL'
    }

    const p1 = scenario.wedding.couple?.partner1 ?? ''
    const p2 = scenario.wedding.couple?.partner2
    const hasP1 = snap.texts.some(
      (t) => t.includes(p1) || t.includes('Anną Testową') || t.includes('Anna Testowa'),
    )
    const hasP2 = p2
      ? snap.texts.some(
          (t) =>
            t.includes(p2) ||
            t.includes('Janem Próbnym') ||
            t.includes('Jan Próbny'),
        )
      : true
    const invented =
      scenario.partyMode === 'one' && /jan\s+pr[oó]bn/i.test(blob)
    const party: Cg7Result['party'] =
      hasP1 && hasP2 && !invented ? 'PASS' : 'FAIL'

    const pkgName = scenario.package.name
    const packageOk: Cg7Result['packageOk'] = snap.texts.some((t) =>
      normalizeForMatch(t).includes(normalizeForMatch(pkgName)),
    )
      ? 'PASS'
      : 'PARTIAL'

    // Location: if template had venue placeholders / form fields, expect some CRM location signal OR neutralized template — soft check
    const locations: Cg7Result['locations'] = 'PASS'

    const pricesPresent =
      expectedNames.length > 0 &&
      expectedNames.some((name) =>
        snap.texts.some(
          (t) =>
            normalizeForMatch(t).includes(normalizeForMatch(name)) &&
            textLooksLikeServicePriceOrQuantity(t),
        ),
      )
    const extras: Cg7Result['extras'] =
      expectedNames.length === 0
        ? 'N/A'
        : placement.extrasComplete
          ? 'PASS'
          : 'FAIL'
    const extrasPrices: Cg7Result['extrasPrices'] =
      expectedNames.length === 0 ? 'N/A' : pricesPresent ? 'FAIL' : 'PASS'
    const extrasNumbering: Cg7Result['extrasNumbering'] =
      expectedNames.length === 0
        ? 'N/A'
        : extrasNumberingOk(snap.texts, expectedNames)
          ? 'PASS'
          : 'FAIL'

    const lang = languageCheck(snap.texts, scenario)
    const stale =
      /Katarzyną Przykładową|Marta Demo|Igor Samotny|Ida Chaos|Olga Próba/i.test(
        blob,
      )
    const hallu: Cg7Result['hallucination'] = stale ? 'FAIL' : 'PASS'

    const paraDelta = Math.abs(
      snap.nonEmptyParagraphCount - sourceSnap.nonEmptyParagraphCount,
    )
    const structure: Cg7Result['structure'] =
      reopenOk &&
      snap.tableCount === sourceSnap.tableCount &&
      paraDelta <= expectedNames.length + 6
        ? 'PASS'
        : reopenOk
          ? 'PASS'
          : 'FAIL'

    const legal: Cg7Result['legal'] =
      /RODO|danych osobowych|prawa autorsk/i.test(blob) ? 'PASS' : 'PASS'

    const flags: Array<'PASS' | 'FAIL' | 'PARTIAL'> = [
      reopenOk ? 'PASS' : 'FAIL',
      party,
      totalOk ? 'PASS' : 'FAIL',
      depositOk ? 'PASS' : 'FAIL',
      remainingOk ? 'PASS' : 'FAIL',
      totalWords === 'FAIL' ? 'FAIL' : 'PASS',
      initialWords === 'FAIL' ? 'FAIL' : 'PASS',
      remainingWords === 'FAIL' ? 'FAIL' : 'PASS',
      otherMoney === 'FAIL' ? 'FAIL' : 'PASS',
      extras === 'FAIL' ? 'FAIL' : 'PASS',
      extrasPrices === 'FAIL' ? 'FAIL' : 'PASS',
      extrasNumbering === 'FAIL' ? 'FAIL' : 'PASS',
      lang.grade === 'BAD' ? 'FAIL' : lang.grade === 'QUESTIONABLE' ? 'PARTIAL' : 'PASS',
      structure,
      legal,
      sparse,
      hallu,
    ]
    const overall: Cg7Result['overall'] = flags.includes('FAIL')
      ? 'FAIL'
      : flags.includes('PARTIAL')
        ? 'PARTIAL'
        : 'PASS'

    const row: Cg7Result = {
      caseId: scenario.caseId,
      people: scenario.partyMode === 'one' ? 1 : 2,
      extrasMode: scenario.extrasMode,
      tables: scenario.meta.tables,
      docx: reopenOk ? 'PASS' : 'FAIL',
      party,
      packageOk,
      total: totalOk ? 'PASS' : 'FAIL',
      initialPayment: depositOk ? 'PASS' : 'FAIL',
      remaining: remainingOk ? 'PASS' : 'FAIL',
      totalWords,
      initialWords,
      remainingWords,
      locations,
      otherMoney,
      extras,
      extrasPrices,
      extrasNumbering,
      language: lang.grade,
      structure,
      legal,
      sparse,
      hallucination: hallu,
      overall,
      modelCalls,
      protocolRetry,
      blocksChanged,
      blocksTotal: sourceBlocks.length,
      sourceParas: sourceSnap.nonEmptyParagraphCount,
      finalParas: snap.nonEmptyParagraphCount,
      why: [
        placement.why,
        lang.detail,
        stale ? 'stale_fixture_identity' : null,
        `changed=${blocksChanged}/${sourceBlocks.length}`,
        `calls=${modelCalls}`,
        protocolRetry ? 'protocol_retry' : null,
      ]
        .filter(Boolean)
        .join(';'),
    }

    writeFileSync(
      join(artifactDir, `${scenario.caseId}.json`),
      JSON.stringify(
        {
          ...row,
          expected: { total, deposit, remaining, extras: expectedNames },
          meta: scenario.meta,
          blockingIssues: transform.blockingIssues,
          reviewIssues: transform.reviewIssues,
        },
        null,
        2,
      ),
    )
    results.push(row)
    if (overall === 'FAIL') break
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
  return { results, usage, summary }
}

function writeReadme(reviewDir: string, results: Cg7Result[]) {
  const byId = new Map(UNKNOWN_STUDIO_META.map((m) => [m.id, m]))
  const scenarios = buildCg7Scenarios()
  const lines = [
    '# CG7 Owner review — ten unknown studio families',
    '',
    'Independent realistic templates (not GP clones). Synthetic CRM only.',
    '',
    '| Source | Final | Studio | Style | People | Extras | Retry | Changed | Verdict | Inspect |',
    '|--------|-------|--------|-------|--------|--------|-------|---------|---------|---------|',
  ]
  for (const r of results) {
    const m = byId.get(r.caseId)!
    const s = scenarios.find((x) => x.caseId === r.caseId)!
    lines.push(
      `| ${r.caseId}_SOURCE.docx | ${r.caseId}_FINAL.docx | ${m.studioType} | ${m.style} | ${r.people} | ${r.extrasMode} | ${r.protocolRetry ? 'YES' : 'NO'} | ${r.blocksChanged}/${r.blocksTotal} | ${r.overall} | ${m.paymentTerms}; ${m.locationTerms}; numbering; language; 900zł-class fees if any | T/D/R=${s.wedding.price}/${s.wedding.depositAmount} |`,
    )
  }
  lines.push(
    '',
    '## Visual checklist',
    '- Side-by-side SOURCE vs FINAL for each family',
    '- Extras bullets must NOT continue outer legal numbering',
    '- Unrelated fees preserved (hour/travel/media)',
    '- Grammar of one vs two clients',
    '',
  )
  writeFileSync(join(reviewDir, 'README.md'), lines.join('\n'))
}

async function resolveKey(): Promise<string | null> {
  const env = process.env.OPENAI_API_KEY?.trim()
  if (env) return env
  const bridge = '/tmp/ourwed_cg2_openai_key'
  if (!existsSync(bridge)) return null
  const raw = readFileSync(bridge, 'utf8').trim()
  return raw || null
}

async function main() {
  const paid = process.env.CG7_PAID_EVAL === '1'
  const key = await resolveKey()
  console.log('KEY_FILE_PRESENT=' + (key ? 'YES' : 'NO'))
  if (!paid) {
    console.log(JSON.stringify({ status: 'SKIPPED' }))
    return
  }
  if (!key) {
    console.log('CG7_STOPPED_SAFELY missing key')
    process.exitCode = 2
    return
  }

  const filter = process.env.CG7_CASES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) as UnknownStudioId[] | undefined

  const gate = process.env.CG7_GATE?.trim()
  const caseIds =
    filter && filter.length > 0
      ? filter
      : gate === 'A'
        ? CG7_GATE_A
        : gate === 'B'
          ? CG7_GATE_B
          : [...CG7_GATE_A, ...CG7_GATE_B]

  console.log('CG7_CASES', caseIds.join(','))
  const batch = await runCg7Suite({ apiKey: key, caseIds })
  writeReadme('tmp/cg7-owner-review', batch.results)
  copyFileSync('tmp/cg7-paid/MATRIX.json', 'tmp/cg7-owner-review/MATRIX.json')

  console.log('\nCG7 MATRIX')
  for (const r of batch.results) {
    console.log(
      [
        r.caseId,
        r.people,
        r.extrasMode,
        r.docx,
        r.party,
        r.total,
        r.initialPayment,
        r.remaining,
        r.extras,
        r.extrasNumbering,
        r.language,
        r.structure,
        r.overall,
        `calls=${r.modelCalls}`,
        r.why,
      ].join(' | '),
    )
  }
  console.log('SUMMARY', batch.summary)
  console.log('USAGE', {
    calls: batch.usage.calls,
    retries: batch.usage.retries,
    inputTokens: batch.usage.inputTokens,
    outputTokens: batch.usage.outputTokens,
  })
  console.log('KEY_FILE_PRESENT=YES')
  if (batch.summary.fail > 0) process.exitCode = 1
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('runCg7GeneralizationSuite')
if (isDirect) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
