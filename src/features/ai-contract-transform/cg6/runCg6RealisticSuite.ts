/**
 * CG6 — production-grade realistic contract torture (paid).
 *
 * Opt-in:
 *   CG6_PAID_EVAL=1 npm run test:cg6-contract-realistic-paid
 *
 * Uses retained bridge key /tmp/ourwed_cg2_openai_key.
 * CRM-clean sanitized GP fixtures only. No production deploy.
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
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { normalizeForMatch } from '../quality/normalize'
import { textLooksLikeServicePriceOrQuantity } from '../contractAdditionalServices'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runSparseProductTransform } from '../transformService'
import type { TransformFunctionsInvoke } from '../transformApi'
import {
  createLocalFullRewriteInvoke,
  createUsageTracker,
  type Cg2InvokeUsage,
} from '../cg2/localFullRewriteInvoke'
import {
  CG6_CASES,
  buildCg6Scenarios,
  loadCg6SourceBytes,
  type Cg6CaseId,
  type Cg6Scenario,
} from './realisticScenarios'

export type Cg6DeepResult = {
  caseId: Cg6CaseId
  people: 1 | 2
  extrasMode: string
  docx: 'PASS' | 'FAIL'
  party: 'PASS' | 'FAIL'
  total: 'PASS' | 'FAIL'
  deposit: 'PASS' | 'FAIL'
  remaining: 'PASS' | 'FAIL'
  totalWords: 'PASS' | 'FAIL' | 'N/A'
  depositWords: 'PASS' | 'FAIL' | 'N/A'
  remainingWords: 'PASS' | 'FAIL' | 'N/A'
  otherMoney: 'PASS' | 'FAIL'
  extras: 'PASS' | 'FAIL' | 'N/A'
  extrasPricesAbsent: 'PASS' | 'FAIL' | 'N/A'
  paymentSemantics: 'PASS' | 'FAIL' | 'PARTIAL'
  legal: 'PASS' | 'FAIL'
  structure: 'PASS' | 'FAIL'
  sparse: 'PASS' | 'PARTIAL' | 'FAIL'
  hallucination: 'PASS' | 'FAIL'
  overall: 'PASS' | 'PARTIAL' | 'FAIL'
  blocksTotal: number
  blocksChanged: number
  changeCategories: Record<string, number>
  sourceParas: number
  finalParas: number
  sourceTables: number
  finalTables: number
  model?: string
  durationMs?: number
  modelCalls: number
  initialCall: 'VALID' | 'INVALID' | 'UNKNOWN'
  violation: 'NONE' | 'INVALID_BLOCK_ID' | 'DESTRUCTIVE_EMPTY_REPLACEMENT' | 'OTHER' | 'NONE_OR_UNKNOWN'
  protocolRetry: boolean
  retryResult: 'VALID' | 'INVALID' | 'N/A'
  invalidBlockId: boolean
  why: string
  outputPath?: string
}

function fmtPln(n: number): string {
  return `${n.toLocaleString('pl-PL').replace(/\u00a0/g, ' ')} zł`
}

function normalizeMoneyBlob(s: string): string {
  return s.replace(/[\u00a0\u202f\u2007\u2009]/g, ' ')
}

function amountPresent(texts: string[], amount: number): boolean {
  const blob = normalizeMoneyBlob(texts.join('\n'))
  const raw = String(amount)
  const spaced = normalizeMoneyBlob(
    amount.toLocaleString('pl-PL'),
  )
  const compact = spaced.replace(/ /g, '')
  return (
    blob.includes(raw) ||
    blob.includes(spaced) ||
    blob.includes(compact) ||
    // Explicit thousands grouping with regular spaces
    blob.includes(
      String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    )
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
  const patterns = [
    new RegExp(
      `${spaced.replace(/ /g, '[\\s\\u00a0\\u202f]*')}\\s*zł[\\s\\S]{0,120}?słownie:\\s*([^)]+)`,
      'i',
    ),
    new RegExp(
      `${grouped.replace(/ /g, '[\\s\\u00a0\\u202f]*')}\\s*zł[\\s\\S]{0,120}?słownie:\\s*([^)]+)`,
      'i',
    ),
    new RegExp(
      `${String(amount)}\\s*zł[\\s\\S]{0,120}?słownie:\\s*([^)]+)`,
      'i',
    ),
  ]
  for (const re of patterns) {
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
    `(?:${spaced.replace(/ /g, '[\\s\\u00a0\\u202f]*')}|${grouped.replace(/ /g, '[\\s\\u00a0\\u202f]*')}|${amount})\\s*zł[\\s\\S]{0,120}?słownie:`,
    'i',
  ).test(blob)
}

function categorizeChange(text: string): string {
  if (/par[aą]|partner|zamawiaj|klient|testow|pr[oó]bn/i.test(text)) return 'party'
  if (/pakiet|teledysk|zdję|film|dron|operator|deliver/i.test(text)) return 'package'
  if (/dodatkow|ekspresowy|rozszerzon/i.test(text)) return 'extras'
  if (/wynagrodzen|zadatek|pozostał|zł|słownie|płatn/i.test(text)) return 'finance'
  if (/2027|ceremon|przyjęc|pałac|lokaliz|miesiąc/i.test(text)) return 'event'
  return 'other'
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

function legalPollution(texts: string[], expectedNames: string[]): string | null {
  const blob = texts.join('\n')
  // extras must not appear inside GDPR / copyright / signature neighborhoods
  for (const name of expectedNames) {
    const idx = blob.toLowerCase().indexOf(name.toLowerCase())
    if (idx < 0) continue
    const window = blob.slice(Math.max(0, idx - 200), idx + name.length + 200)
    if (/ochronie danych|danych osobowych|prawa autorsk|portfolio Fotograf|podpis/i.test(window) &&
        !/pakiet|teledysk|dzieła|obejmuje/i.test(window)) {
      return `extras_in_legal:${name}`
    }
  }
  return null
}

function hallucinationCheck(texts: string[], scenario: Cg6Scenario): {
  ok: boolean
  detail: string
} {
  const blob = texts.join('\n')
  const invented = [
    'Maria Wiśniewska',
    'Piotr Zieliński',
    'Kościół Mariacki',
    'ul. Nieistniejąca',
  ]
  for (const n of invented) {
    if (blob.includes(n)) return { ok: false, detail: `invented:${n}` }
  }
  // stale sanitized source clients should be replaced when party changes
  if (scenario.partyMode === 'one') {
    if (/jan\s+pr[oó]bny/i.test(blob)) {
      return { ok: false, detail: 'fake_second_person' }
    }
  }
  // original real PII must never appear
  const forbidden = [
    'Ciemierz',
    'Haber',
    'Hibszer',
    'Radlak',
    'Mojęcice',
    'Czosnowskich',
  ]
  for (const f of forbidden) {
    if (blob.includes(f)) return { ok: false, detail: `pii_leak:${f}` }
  }
  return { ok: true, detail: 'ok' }
}

export async function runCg6RealisticSuite(input: {
  apiKey?: string
  invoke?: TransformFunctionsInvoke
  usage?: Cg2InvokeUsage
  artifactDir?: string
  reviewDir?: string
  fixturesDir?: string
  caseIds?: readonly Cg6CaseId[]
}): Promise<{
  results: Cg6DeepResult[]
  usage: Cg2InvokeUsage
  summary: { total: number; pass: number; partial: number; fail: number }
}> {
  const artifactDir = input.artifactDir ?? 'tmp/cg6-paid'
  const reviewDir = input.reviewDir ?? 'tmp/cg6-owner-review'
  const fixturesDir = input.fixturesDir ?? 'tmp/cg6-fixtures'
  mkdirSync(artifactDir, { recursive: true })
  mkdirSync(reviewDir, { recursive: true })

  const usage = input.usage ?? createUsageTracker()
  const invoke: TransformFunctionsInvoke =
    input.invoke ??
    createLocalFullRewriteInvoke({
      apiKey: input.apiKey ?? '',
      usage,
    })

  const wanted = input.caseIds ?? CG6_CASES
  const all = buildCg6Scenarios()
  const selected = wanted.map((id) => {
    const s = all.find((x) => x.caseId === id)
    if (!s) throw new Error(`missing CG6 case ${id}`)
    return s
  })

  const results: Cg6DeepResult[] = []

  for (const scenario of selected) {
    const sourceBytes = loadCg6SourceBytes(scenario.sourceFixture, fixturesDir)
    const sourceBlocks = await indexDocxForTransform(sourceBytes)
    const sourceSnap = await snapshotDocx(sourceBytes)
    const dataset = buildContractTransformationDataset({
      wedding: scenario.wedding,
      package: scenario.package,
      extras: scenario.extras,
    })

    const callsBefore = usage.calls
    const retriesBefore = usage.retries
    const started = Date.now()
    const transform = await runSparseProductTransform({
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke,
    })
    const durationMs = Date.now() - started
    const modelCalls = Math.max(0, usage.calls - callsBefore)
    const protocolRetry = usage.retries > retriesBefore
    const initialCall: 'VALID' | 'INVALID' | 'UNKNOWN' = !transform.ok
      ? protocolRetry
        ? 'INVALID'
        : 'INVALID'
      : protocolRetry
        ? 'INVALID'
        : 'VALID'
    const violation: Cg6DeepResult['violation'] = !transform.ok
      ? /empty replacement|destructive_empty/i.test(transform.message)
        ? 'DESTRUCTIVE_EMPTY_REPLACEMENT'
        : /blockId|unknown_block/i.test(transform.message)
          ? 'INVALID_BLOCK_ID'
          : 'OTHER'
      : protocolRetry
        ? 'OTHER'
        : 'NONE'
    const retryResult: Cg6DeepResult['retryResult'] = !protocolRetry
      ? 'N/A'
      : transform.ok
        ? 'VALID'
        : 'INVALID'

    if (!transform.ok) {
      results.push({
        caseId: scenario.caseId,
        people: scenario.partyMode === 'one' ? 1 : 2,
        extrasMode: scenario.extrasMode,
        docx: 'FAIL',
        party: 'FAIL',
        total: 'FAIL',
        deposit: 'FAIL',
        remaining: 'FAIL',
        totalWords: 'FAIL',
        depositWords: 'FAIL',
        remainingWords: 'FAIL',
        otherMoney: 'FAIL',
        extras: 'FAIL',
        extrasPricesAbsent: 'N/A',
        paymentSemantics: 'FAIL',
        legal: 'FAIL',
        structure: 'FAIL',
        sparse: 'FAIL',
        hallucination: 'FAIL',
        overall: 'FAIL',
        blocksTotal: sourceBlocks.length,
        blocksChanged: 0,
        changeCategories: {},
        sourceParas: sourceSnap.nonEmptyParagraphCount,
        finalParas: 0,
        sourceTables: sourceSnap.tableCount,
        finalTables: 0,
        model: transform.model,
        durationMs,
        modelCalls,
        initialCall,
        violation,
        protocolRetry,
        retryResult,
        invalidBlockId: violation === 'INVALID_BLOCK_ID',
        why: `${transform.reason}:${transform.message}`,
      })
      // Stop matrix on hard transform failure (general defect risk)
      writeFileSync(
        join(artifactDir, `${scenario.caseId}.FAIL.json`),
        JSON.stringify(
          {
            caseId: scenario.caseId,
            reason: transform.reason,
            message: transform.message,
            modelCalls,
            protocolRetry,
            retryResult,
            violation,
          },
          null,
          2,
        ),
      )
      break
    }

    const reopenOk = await reopenParses(transform.outputBytes)
    const outPath = join(artifactDir, `${scenario.caseId}_FINAL.docx`)
    writeFileSync(outPath, Buffer.from(transform.outputBytes))
    copyFileSync(
      join(fixturesDir, scenario.sourceFixture),
      join(reviewDir, scenario.sourceFixture),
    )
    copyFileSync(outPath, join(reviewDir, `${scenario.caseId}_FINAL.docx`))

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

    let blocksChanged = 0
    const changeCategories: Record<string, number> = {}
    for (const src of sourceBlocks) {
      const t = transform.transformedBlocks.find((b) => b.blockId === src.blockId)
      if (t && t.text !== src.text) {
        blocksChanged += 1
        const cat = categorizeChange(t.text)
        changeCategories[cat] = (changeCategories[cat] ?? 0) + 1
      }
    }
    const changeRatio = blocksChanged / Math.max(1, sourceBlocks.length)
    const sparse: 'PASS' | 'PARTIAL' | 'FAIL' =
      changeRatio > 0.85 ? 'FAIL' : changeRatio > 0.55 ? 'PARTIAL' : 'PASS'

    const total = scenario.wedding.price ?? 0
    const deposit = scenario.wedding.depositAmount ?? 0
    const remaining = total - deposit
    const totalWords = polishContractMoneyWords(total)
    const depositWords = polishContractMoneyWords(deposit)
    const remainingWords = polishContractMoneyWords(remaining)

    const totalOk = amountPresent(snap.texts, total)
    const depositOk = amountPresent(snap.texts, deposit)
    const remainingOk = amountPresent(snap.texts, remaining)

    const totalWordsCheck: 'PASS' | 'FAIL' | 'N/A' = !hasSlownieNear(
      snap.texts,
      total,
    )
      ? hasSlownieNear(sourceSnap.texts, 10700) ||
        hasSlownieNear(sourceSnap.texts, 22100)
        ? 'FAIL'
        : 'N/A'
      : wordsNearAmount(snap.texts, total, totalWords)
        ? 'PASS'
        : 'FAIL'

    const depositWordsCheck: 'PASS' | 'FAIL' | 'N/A' = !hasSlownieNear(
      snap.texts,
      deposit,
    )
      ? hasSlownieNear(sourceSnap.texts, 1000)
        ? 'FAIL'
        : 'N/A'
      : wordsNearAmount(snap.texts, deposit, depositWords)
        ? 'PASS'
        : 'FAIL'

    const remainingWordsCheck: 'PASS' | 'FAIL' | 'N/A' = !hasSlownieNear(
      snap.texts,
      remaining,
    )
      ? hasSlownieNear(sourceSnap.texts, 9700) ||
        hasSlownieNear(sourceSnap.texts, 21100)
        ? 'FAIL'
        : 'N/A'
      : wordsNearAmount(snap.texts, remaining, remainingWords)
        ? 'PASS'
        : 'FAIL'

    // Unrelated hour price must survive canonical finance repair
    const blob = snap.texts.join('\n')
    const hourPreserved = /900\s*zł/i.test(blob)

    // Payment semantics — at least one timing/method phrase preserved when present in source
    const sourceBlob = sourceSnap.texts.join('\n')
    let semPass = 0
    let semNeed = 0
    for (const phrase of scenario.preservePaymentSemantics) {
      if (!sourceBlob.includes(phrase) && !normalizeForMatch(sourceBlob).includes(normalizeForMatch(phrase))) {
        continue
      }
      semNeed += 1
      if (
        blob.includes(phrase) ||
        normalizeForMatch(blob).includes(normalizeForMatch(phrase))
      ) {
        semPass += 1
      }
    }
    const paymentSemantics: 'PASS' | 'FAIL' | 'PARTIAL' =
      semNeed === 0 ? 'PASS' : semPass === semNeed ? 'PASS' : semPass > 0 ? 'PARTIAL' : 'FAIL'

    const needName = scenario.wedding.couple?.partner1 ?? ''
    const partner2 = scenario.wedding.couple?.partner2
    const hasP1 = snap.texts.some((t) => t.includes(needName) || t.includes('Anną Testową') || t.includes('Anna Testowa'))
    const hasP2 = partner2
      ? snap.texts.some(
          (t) =>
            t.includes(partner2) ||
            t.includes('Janem Próbnym') ||
            t.includes('Jan Próbny'),
        )
      : true
    const inventedP2 =
      scenario.partyMode === 'one' &&
      snap.texts.some((t) => /jan\s+pr[oó]bn/i.test(t))
    const party: 'PASS' | 'FAIL' =
      hasP1 && hasP2 && !inventedP2 ? 'PASS' : 'FAIL'

    const pricesPresent = hasIndividualExtraPrices(snap.texts, expectedNames)
    const extrasResult: 'PASS' | 'FAIL' | 'N/A' =
      expectedNames.length === 0
        ? 'N/A'
        : placement.extrasComplete && placement.placementValid
          ? 'PASS'
          : 'FAIL'
    const extrasPricesAbsent: 'PASS' | 'FAIL' | 'N/A' =
      expectedNames.length === 0 ? 'N/A' : pricesPresent ? 'FAIL' : 'PASS'

    const pollute = legalPollution(snap.texts, expectedNames)
    const hallu = hallucinationCheck(snap.texts, scenario)
    const legal: 'PASS' | 'FAIL' =
      !pollute && hallu.ok ? 'PASS' : 'FAIL'

    const paraDelta = Math.abs(
      snap.nonEmptyParagraphCount - sourceSnap.nonEmptyParagraphCount,
    )
    // extras may add a few paragraphs
    const maxDelta = expectedNames.length > 0 ? expectedNames.length + 4 : 3
    const structure: 'PASS' | 'FAIL' =
      reopenOk &&
      snap.tableCount === sourceSnap.tableCount &&
      paraDelta <= maxDelta
        ? 'PASS'
        : reopenOk && paraDelta <= maxDelta + 4
          ? 'PASS'
          : 'FAIL'

    const docx: 'PASS' | 'FAIL' = reopenOk ? 'PASS' : 'FAIL'

    const flags: Array<'PASS' | 'FAIL' | 'PARTIAL'> = [
      docx,
      party,
      totalOk ? 'PASS' : 'FAIL',
      depositOk ? 'PASS' : 'FAIL',
      remainingOk ? 'PASS' : 'FAIL',
      totalWordsCheck === 'FAIL' ? 'FAIL' : 'PASS',
      depositWordsCheck === 'FAIL' ? 'FAIL' : 'PASS',
      remainingWordsCheck === 'FAIL' ? 'FAIL' : 'PASS',
      hourPreserved ? 'PASS' : 'FAIL',
      extrasResult === 'FAIL' ? 'FAIL' : 'PASS',
      extrasPricesAbsent === 'FAIL' ? 'FAIL' : 'PASS',
      paymentSemantics === 'FAIL' ? 'FAIL' : paymentSemantics === 'PARTIAL' ? 'PARTIAL' : 'PASS',
      legal,
      structure,
      sparse,
      hallu.ok ? 'PASS' : 'FAIL',
    ]
    const overall: 'PASS' | 'PARTIAL' | 'FAIL' = flags.includes('FAIL')
      ? 'FAIL'
      : flags.includes('PARTIAL')
        ? 'PARTIAL'
        : 'PASS'

    const why = [
      placement.why,
      hallu.detail,
      pollute,
      !hourPreserved ? 'hour_900_lost' : null,
      !totalOk ? 'total_missing' : null,
      !depositOk ? 'deposit_missing' : null,
      !remainingOk ? 'remaining_missing' : null,
      totalWordsCheck === 'FAIL' ? 'total_words_mismatch' : null,
      depositWordsCheck === 'FAIL' ? 'deposit_words_mismatch' : null,
      remainingWordsCheck === 'FAIL' ? 'remaining_words_mismatch' : null,
      `changed=${blocksChanged}/${sourceBlocks.length}`,
      `paras ${sourceSnap.nonEmptyParagraphCount}→${snap.nonEmptyParagraphCount}`,
    ]
      .filter(Boolean)
      .join(';')

    const row: Cg6DeepResult = {
      caseId: scenario.caseId,
      people: scenario.partyMode === 'one' ? 1 : 2,
      extrasMode: scenario.extrasMode,
      docx,
      party,
      total: totalOk ? 'PASS' : 'FAIL',
      deposit: depositOk ? 'PASS' : 'FAIL',
      remaining: remainingOk ? 'PASS' : 'FAIL',
      totalWords: totalWordsCheck,
      depositWords: depositWordsCheck,
      remainingWords: remainingWordsCheck,
      otherMoney: hourPreserved ? 'PASS' : 'FAIL',
      extras: extrasResult,
      extrasPricesAbsent,
      paymentSemantics,
      legal,
      structure,
      sparse,
      hallucination: hallu.ok ? 'PASS' : 'FAIL',
      overall,
      blocksTotal: sourceBlocks.length,
      blocksChanged,
      changeCategories,
      sourceParas: sourceSnap.nonEmptyParagraphCount,
      finalParas: snap.nonEmptyParagraphCount,
      sourceTables: sourceSnap.tableCount,
      finalTables: snap.tableCount,
      model: transform.model,
      durationMs,
      modelCalls,
      initialCall,
      violation: protocolRetry ? 'OTHER' : 'NONE',
      protocolRetry,
      retryResult,
      invalidBlockId: false,
      why,
      outputPath: outPath,
    }

    writeFileSync(
      join(artifactDir, `${scenario.caseId}.json`),
      JSON.stringify(
        {
          ...row,
          expected: {
            total,
            deposit,
            remaining,
            totalWords,
            depositWords,
            remainingWords,
            totalFormatted: fmtPln(total),
            extras: expectedNames,
          },
          blockingIssues: transform.blockingIssues,
          reviewIssues: transform.reviewIssues,
          placement,
          snapshotPreview: snap.texts.filter((t) =>
            /zł|słownie|zadatek|Testow|Próbn|pakiet|900/i.test(t),
          ),
        },
        null,
        2,
      ),
    )

    results.push(row)

    if (overall === 'FAIL') {
      // Preserve evidence; stop further paid calls on material failure
      break
    }
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

function writeOwnerReadme(
  reviewDir: string,
  results: Cg6DeepResult[],
  scenarios: Cg6Scenario[],
  usage: Cg2InvokeUsage,
) {
  const byId = new Map(scenarios.map((s) => [s.caseId, s]))
  const lines = [
    '# CG6 Owner review — realistic GP-structure contracts',
    '',
    'Sanitized structural copies of real studio contracts. **No real client PII.**',
    '',
    `Model: ${usage.model}`,
    `Prompt: ${usage.promptVersion}`,
    '',
    'Product rule: extras NAMES only — no individual prices. Correct total YES.',
    '',
    'Compare each `R0N_SOURCE_SANITIZED.docx` with `R0N_FINAL.docx` side-by-side.',
    '',
    '| File | Case | People | Extras | Challenge | Expected T/D/R | Verdict | Inspect |',
    '|------|------|--------|--------|-----------|----------------|---------|---------|',
  ]
  for (const r of results) {
    const s = byId.get(r.caseId)!
    const total = s.wedding.price ?? 0
    const deposit = s.wedding.depositAmount ?? 0
    const remaining = total - deposit
    lines.push(
      `| ${r.caseId}_FINAL.docx | ${r.caseId} | ${r.people} | ${r.extrasMode} | ${s.structuralChallenge} | ${total}/${deposit}/${remaining} | ${r.overall} | retry=${r.protocolRetry ? 'YES' : 'NO'} calls=${r.modelCalls} changed=${r.blocksChanged}/${r.blocksTotal}; parties; numeric+words; 900zł hour; deadlines; GDPR/copyright untouched; signatures |`,
    )
  }
  lines.push(
    '',
    '## Visual checklist',
    '',
    '- Party line reads naturally (1 or 2 people)',
    '- Total / deposit / remaining numeric amounts match expected',
    '- Corresponding `(słownie: …)` clauses match those amounts',
    '- Additional-hour **900 zł** unchanged',
    '- Bank/IBAN sanitized value preserved; deadlines preserved',
    '- Extras names present without individual prices (when applicable)',
    '- No collapse of § numbering / signature lines',
    '',
  )
  writeFileSync(join(reviewDir, 'README.md'), lines.join('\n'))
}

async function resolveOpenAiKey(): Promise<string | null> {
  const fromEnv = process.env.OPENAI_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const bridge =
    process.env.CG2_OPENAI_KEY_BRIDGE_PATH?.trim() ||
    '/tmp/ourwed_cg2_openai_key'
  try {
    if (!existsSync(bridge)) return null
    const raw = readFileSync(bridge, 'utf8').trim()
    return raw || null
  } catch {
    return null
  }
}

async function main() {
  const paid = process.env.CG6_PAID_EVAL === '1'
  const key = await resolveOpenAiKey()
  console.log('KEY_FILE_PRESENT=' + (key ? 'YES' : 'NO'))
  console.log('SANITIZATION_REPORT', 'tmp/cg6-sanitized/SANITIZATION_REPORT.json')

  if (!paid) {
    console.log(JSON.stringify({ status: 'SKIPPED', reason: 'CG6_PAID_EVAL not 1' }))
    process.exit(0)
  }
  if (!key) {
    console.log('CG6_STOPPED_SAFELY missing OpenAI key')
    process.exitCode = 2
    return
  }

  const san = JSON.parse(
    readFileSync('tmp/cg6-sanitized/SANITIZATION_REPORT.json', 'utf8'),
  ) as { sanitization_pass: boolean }
  if (!san.sanitization_pass) {
    console.log('SANITIZATION_PASS=NO')
    console.log('CG6_STOPPED_SAFELY')
    process.exitCode = 2
    return
  }
  console.log('SANITIZATION_PASS=YES')

  const batch = await runCg6RealisticSuite({ apiKey: key })
  writeOwnerReadme(
    'tmp/cg6-owner-review',
    batch.results,
    buildCg6Scenarios(),
    batch.usage,
  )

  console.log('\nCG6 PAID MATRIX')
  for (const r of batch.results) {
    console.log(
      [
        r.caseId,
        r.people,
        r.extrasMode,
        r.docx,
        r.party,
        r.total,
        r.deposit,
        r.remaining,
        r.otherMoney,
        r.legal,
        r.structure,
        r.overall,
        r.why,
      ].join(' | '),
    )
  }
  console.log('\nSUMMARY', batch.summary)
  console.log('USAGE', {
    model: batch.usage.model,
    calls: batch.usage.calls,
    retries: batch.usage.retries,
    inputTokens: batch.usage.inputTokens,
    outputTokens: batch.usage.outputTokens,
    latenciesMs: batch.usage.latenciesMs,
  })
  console.log('KEY_FILE_PRESENT=YES')

  if (batch.summary.fail > 0 || batch.summary.pass < CG6_CASES.length) {
    process.exitCode = 1
  }
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('runCg6RealisticSuite')

if (isDirect) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
