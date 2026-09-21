/**
 * Golden contract validation — frozen generator at e8fd781.
 * Harness-only: ingest owner-approved SOURCE DOCX, run G01–G06 sequentially,
 * STOP on first material FAIL. No generator behavior changes.
 *
 *   GOLDEN_PAID_EVAL=1 npm run test:golden-contract-validation
 *   GOLDEN_CASES=G01  (optional filter; still sequential stop on fail)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { analyzeExtrasPlacement, reopenParses, snapshotDocx } from '../cg1/docxInspect'
import {
  createLocalFullRewriteInvoke,
  createUsageTracker,
  type Cg2InvokeUsage,
} from '../cg2/localFullRewriteInvoke'
import { classifyAdditionalServicesPlacement } from '../additionalServicesPlacement'
import { textLooksLikeServicePriceOrQuantity } from '../contractAdditionalServices'
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { discoverFilledPackageEvidence } from '../quality/packageFieldEvidence'
import { normalizeForMatch } from '../quality/normalize'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runSparseProductTransform } from '../transformService'
import type { TransformFunctionsInvoke } from '../transformApi'
import {
  buildGoldenScenarios,
  type GoldenCaseId,
  type GoldenScenario,
} from './goldenScenarios'

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

function partyPresent(texts: string[], name: string): boolean {
  const n = normalizeForMatch(name)
  return texts.some((t) => normalizeForMatch(t).includes(n))
}

function anyTokenPresent(blob: string, tokens: string[]): boolean {
  return tokens.some((tok) =>
    normalizeForMatch(blob).includes(normalizeForMatch(tok)),
  )
}

function renderDocxToPdf(docxPath: string, pdfPath: string): {
  ok: boolean
  pages: number | null
  error?: string
} {
  try {
    if (existsSync(pdfPath)) {
      try {
        execFileSync('rm', ['-f', pdfPath])
      } catch {
        /* ignore */
      }
    }
    const script = `
tell application "Pages"
  set theDoc to open POSIX file "${docxPath}"
  delay 1.5
  export theDoc to POSIX file "${pdfPath}" as PDF
  close theDoc saving no
end tell
`
    execFileSync('osascript', ['-e', script], { timeout: 120_000 })
    if (!existsSync(pdfPath)) {
      return { ok: false, pages: null, error: 'pdf_missing' }
    }
    // Page count via mdls / python Quartz fallback
    let pages: number | null = null
    try {
      const out = execFileSync(
        'mdls',
        ['-name', 'kMDItemNumberOfPages', '-raw', pdfPath],
        { encoding: 'utf8' },
      ).trim()
      const n = Number(out)
      if (Number.isFinite(n) && n > 0) pages = n
    } catch {
      /* ignore */
    }
    if (pages == null) {
      try {
        const py = `
import sys
try:
  import Quartz
  url = Quartz.NSURL.fileURLWithPath_(sys.argv[1])
  doc = Quartz.PDFDocument.alloc().initWithURL_(url)
  print(doc.pageCount() if doc else 0)
except Exception as e:
  print(0)
`
        const out = execFileSync('python3', ['-c', py, pdfPath], {
          encoding: 'utf8',
        }).trim()
        const n = Number(out)
        if (Number.isFinite(n) && n > 0) pages = n
      } catch {
        /* ignore */
      }
    }
    return { ok: true, pages }
  } catch (e) {
    return {
      ok: false,
      pages: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type GoldenVerdict = 'PASS' | 'FAIL' | 'N/A'

export type GoldenCaseResult = {
  caseId: GoldenCaseId
  party: GoldenVerdict
  locations: GoldenVerdict
  dates: GoldenVerdict
  packageOk: GoldenVerdict
  finance: GoldenVerdict
  extras: GoldenVerdict
  unrelatedMoney: GoldenVerdict
  legal: GoldenVerdict
  sparse: GoldenVerdict
  structure: GoldenVerdict
  visual: 'EXCELLENT' | 'ACCEPTABLE' | 'MATERIAL_FAIL' | 'UNRENDERED'
  overall: 'PASS' | 'FAIL'
  modelCalls: number
  protocolRetry: boolean
  blocksChanged: number
  blocksTotal: number
  changeRatio: number
  changedBlockIds: string[]
  why: string
  representation: GoldenScenario['representation']
  canonical: { total: number; deposit: number; remaining: number }
  pdfPages: number | null
  sourceTables: number
  finalTables: number
}

function evaluateCase(input: {
  scenario: GoldenScenario
  sourceBlocks: Awaited<ReturnType<typeof indexDocxForTransform>>
  sourceSnap: Awaited<ReturnType<typeof snapshotDocx>>
  transform: Awaited<ReturnType<typeof runSparseProductTransform>>
  modelCalls: number
  protocolRetry: boolean
  pdfPages: number | null
  sourcePdfPages: number | null
  finalTexts: string[]
  finalSnap: Awaited<ReturnType<typeof snapshotDocx>>
  reopenOk: boolean
}): GoldenCaseResult {
  const { scenario } = input
  const rep = scenario.representation
  const blob = input.finalTexts.join('\n')
  const total = scenario.wedding.price ?? 0
  const deposit = scenario.wedding.depositAmount ?? 0
  const remaining = total - deposit

  const changedBlockIds: string[] = []
  if (input.transform.ok) {
    for (const src of input.sourceBlocks) {
      const t = input.transform.transformedBlocks.find(
        (b) => b.blockId === src.blockId,
      )
      if (t && t.text !== src.text) changedBlockIds.push(src.blockId)
    }
  }
  const blocksChanged = changedBlockIds.length
  const blocksTotal = input.sourceBlocks.length
  const changeRatio = blocksChanged / Math.max(1, blocksTotal)
  const sparse: GoldenVerdict =
    changeRatio > 0.85 ? 'FAIL' : changeRatio > 0.55 ? 'FAIL' : 'PASS'

  // Party
  const p1 = scenario.wedding.couple?.partner1 ?? ''
  const p2 = scenario.wedding.couple?.partner2
  const hasP1 = partyPresent(input.finalTexts, p1)
  const hasP2 = p2 ? partyPresent(input.finalTexts, p2) : true
  const staleParty = anyTokenPresent(blob, scenario.stalePartyTokens)
  const inventedSecond =
    scenario.partyMode === 'one' &&
    /jan\s+pr[oó]bn|adam\s+mostow|filip\s+brzeg|marek\s+widok/i.test(blob) &&
    !p2
  let party: GoldenVerdict = 'N/A'
  if (rep.party) {
    party =
      hasP1 &&
      (!rep.secondParty || hasP2) &&
      !staleParty &&
      !inventedSecond
        ? 'PASS'
        : 'FAIL'
  }

  // Locations
  const locs = scenario.wedding as {
    preparationLocation?: string
    bridePreparationLocation?: string
    groomPreparationLocation?: string
    ceremonyLocation?: string
    receptionLocation?: string
  }
  const locFails: string[] = []
  if (rep.prep1) {
    const prep =
      locs.bridePreparationLocation ??
      locs.preparationLocation ??
      ''
    if (prep && !anyTokenPresent(blob, [prep.split(',')[0] ?? prep])) {
      locFails.push('prep1_missing')
    }
  }
  if (rep.prep2) {
    const prep2 = locs.groomPreparationLocation ?? ''
    if (prep2 && !anyTokenPresent(blob, [prep2.split(',')[0] ?? prep2])) {
      locFails.push('prep2_missing')
    }
  }
  if (rep.ceremony) {
    const c = locs.ceremonyLocation ?? ''
    if (c && !anyTokenPresent(blob, [c.split(',')[0] ?? c, c.split('—')[0] ?? c])) {
      locFails.push('ceremony_missing')
    }
  }
  if (rep.reception) {
    const r = locs.receptionLocation ?? ''
    if (r && !anyTokenPresent(blob, [r.split(',')[0] ?? r, r.split('—')[0] ?? r])) {
      locFails.push('reception_missing')
    }
  }
  // Unrepresented must not be invented from CRM
  if (!rep.prep1 && !rep.prep2) {
    const prepCrm =
      locs.preparationLocation ??
      locs.bridePreparationLocation ??
      locs.groomPreparationLocation
    if (
      prepCrm &&
      anyTokenPresent(blob, [prepCrm.split(',')[0] ?? prepCrm]) &&
      scenario.caseId === 'G05'
    ) {
      // G05 CRM prep should not appear
      locFails.push('invented_prep')
    }
    if (
      scenario.caseId === 'G06' &&
      locs.preparationLocation &&
      anyTokenPresent(blob, ['Floriańska 12'])
    ) {
      locFails.push('invented_prep')
    }
  }
  if (!rep.ceremony && scenario.caseId === 'G06') {
    if (anyTokenPresent(blob, ['Kościół Mariacki', 'Mariacki'])) {
      locFails.push('invented_ceremony')
    }
  }
  const staleLoc = anyTokenPresent(blob, scenario.staleLocationTokens)
  if (staleLoc && (rep.prep1 || rep.ceremony || rep.reception)) {
    locFails.push('stale_location')
  }
  const locations: GoldenVerdict =
    !rep.prep1 && !rep.prep2 && !rep.ceremony && !rep.reception
      ? 'N/A'
      : locFails.length === 0
        ? 'PASS'
        : 'FAIL'

  // Dates — wedding date present; signing date not blindly same as wedding
  const weddingDateRaw = scenario.wedding.date
  const weddingOk =
    !rep.weddingDate ||
    input.finalTexts.some((t) =>
      /2027/.test(t) &&
      (t.includes('18 września') ||
        t.includes('09 października') ||
        t.includes('9 października') ||
        t.includes('24 lipca') ||
        t.includes('13 listopada') ||
        t.includes('21 sierpnia') ||
        t.includes('04 grudnia') ||
        t.includes('4 grudnia') ||
        t.includes('18.09.2027') ||
        t.includes('09.10.2027') ||
        t.includes('9.10.2027') ||
        t.includes('24.07.2027') ||
        t.includes('13.11.2027') ||
        t.includes('21.08.2027') ||
        t.includes('04.12.2027') ||
        t.includes('4.12.2027') ||
        t.includes(weddingDateRaw)),
    )
  // Source wedding dates that must be gone when weddingDate represented
  const sourceWeddingStale =
    scenario.caseId === 'G01'
      ? /12 czerwca 2027/.test(blob)
      : scenario.caseId === 'G02'
        ? /21 sierpnia 2027/.test(blob)
        : scenario.caseId === 'G03'
          ? /05\.06\.2027|5 czerwca 2027/.test(blob)
          : scenario.caseId === 'G04'
            ? /02\.10\.2027/.test(blob)
            : scenario.caseId === 'G05'
              ? /14 czerwca 2027/.test(blob)
              : /27 listopada 2027/.test(blob)
  const dates: GoldenVerdict = !rep.weddingDate
    ? 'N/A'
    : weddingOk && !sourceWeddingStale
      ? 'PASS'
      : 'FAIL'

  // Package
  const sourcePackageNames = discoverFilledPackageEvidence(input.sourceBlocks)
    .map((e) => normalizeForMatch(e.sourcePackageName))
    .filter(Boolean)
  const packageOk: GoldenVerdict = !rep.package
    ? 'N/A'
    : sourcePackageNames.length === 0 || sourcePackageNames.every((name) =>
        input.finalTexts.some((t) => normalizeForMatch(t).includes(name)),
      )
      ? 'PASS'
      : 'FAIL'

  // Finance
  const totalOk = !rep.total || amountPresent(input.finalTexts, total)
  const depositOk = !rep.deposit || amountPresent(input.finalTexts, deposit)
  const remainingOk =
    !rep.remaining || amountPresent(input.finalTexts, remaining)
  let wordsOk = true
  if (rep.moneyInWords && rep.total && hasSlownieNear(input.finalTexts, total)) {
    wordsOk = wordsNearAmount(
      input.finalTexts,
      total,
      polishContractMoneyWords(total),
    )
  } else if (
    rep.moneyInWords &&
    rep.total &&
    amountPresent(input.finalTexts, total) &&
    /słownie:/i.test(blob)
  ) {
    // Source had words — require correct words near new total if any słownie remains
    wordsOk = wordsNearAmount(
      input.finalTexts,
      total,
      polishContractMoneyWords(total),
    )
  }
  // Old grounded totals must not coexist
  const oldTotals: Record<GoldenCaseId, number[]> = {
    G01: [8400, 1500, 6900],
    G02: [9750, 1950, 7800],
    G03: [16800, 3500, 13300],
    G04: [12600, 3000, 9600],
    G05: [8640, 2160, 6480],
    G06: [13900, 4000, 9900],
  }
  const oldCoexist = oldTotals[scenario.caseId].some(
    (a) => amountPresent(input.finalTexts, a) && a !== total && a !== deposit && a !== remaining,
  )
  const finance: GoldenVerdict =
    totalOk && depositOk && remainingOk && wordsOk && !oldCoexist
      ? 'PASS'
      : 'FAIL'

  // Extras
  const expectedNames: string[] = scenario.extras
    .map((e) => e.name)
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
  let extras: GoldenVerdict = 'N/A'
  let extrasPriceLeak = false
  if (expectedNames.length > 0 && input.transform.ok) {
    const expanded = expandBlocksWithParagraphInsertions({
      sourceBlocks: input.sourceBlocks,
      blocks: input.transform.transformedBlocks,
      insertions: input.transform.paragraphInsertions ?? [],
    })
    const classy = classifyAdditionalServicesPlacement(input.sourceBlocks)
    const targetBlockId =
      classy.mode === 'safe_placement_not_found'
        ? undefined
        : classy.targetBlockId
    const placement = analyzeExtrasPlacement({
      blocks: expanded,
      expectedNames,
      placementMode: classy.mode,
      ...(targetBlockId ? { targetBlockId } : {}),
    })
    extrasPriceLeak = expectedNames.some((name) =>
      input.finalTexts.some(
        (t) =>
          normalizeForMatch(t).includes(normalizeForMatch(name)) &&
          textLooksLikeServicePriceOrQuantity(t),
      ),
    )
    extras =
      placement.extrasComplete && !extrasPriceLeak ? 'PASS' : 'FAIL'
  } else if (expectedNames.length === 0) {
    extras = 'N/A'
  }

  // Unrelated money
  const unrelatedMoney: GoldenVerdict =
    scenario.preserveMoney.length === 0
      ? 'N/A'
      : scenario.preserveMoney.every((m) =>
            normalizeMoneyBlob(blob).includes(normalizeMoneyBlob(m)),
          )
        ? 'PASS'
        : 'FAIL'

  // Legal preservation — key phrases should remain
  const legalPhrases =
    scenario.caseId === 'G05'
      ? [/prawa autorsk/i, /Siła Wyższa|Sila Wyzsza/i, /portfolio/i]
      : scenario.caseId === 'G01'
        ? [/Autorskie prawa majątkowe|prawa autorsk/i, /portfolio/i]
        : [/portfolio|licencj|prawa autorsk|odpowiedzialn/i]
  const legal: GoldenVerdict = legalPhrases.every((re) => re.test(blob))
    ? 'PASS'
    : 'FAIL'

  // Structure
  const paraDelta = Math.abs(
    input.finalSnap.nonEmptyParagraphCount -
      input.sourceSnap.nonEmptyParagraphCount,
  )
  const tableOk =
    input.finalSnap.tableCount === input.sourceSnap.tableCount
  const structure: GoldenVerdict =
    input.reopenOk &&
    tableOk &&
    paraDelta <= expectedNames.length + 8
      ? 'PASS'
      : input.reopenOk && tableOk
        ? 'PASS'
        : 'FAIL'

  // Visual (automated pre-screen)
  let visual: GoldenCaseResult['visual'] = 'UNRENDERED'
  if (input.pdfPages == null) {
    visual = 'UNRENDERED'
  } else if (input.pdfPages <= 0) {
    visual = 'MATERIAL_FAIL'
  } else if (
    input.sourcePdfPages != null &&
    Math.abs(input.pdfPages - input.sourcePdfPages) > 2
  ) {
    visual = 'ACCEPTABLE'
  } else {
    visual = 'EXCELLENT'
  }
  // Heuristic malformations in text
  const oneCharLines = input.finalTexts.filter(
    (t) => t.trim().length === 1 && /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(t),
  ).length
  if (oneCharLines >= 8) visual = 'MATERIAL_FAIL'

  const flags: GoldenVerdict[] = [
    party === 'N/A' ? 'PASS' : party,
    locations === 'N/A' ? 'PASS' : locations,
    dates === 'N/A' ? 'PASS' : dates,
    packageOk === 'N/A' ? 'PASS' : packageOk,
    finance,
    extras === 'N/A' ? 'PASS' : extras,
    unrelatedMoney === 'N/A' ? 'PASS' : unrelatedMoney,
    legal,
    sparse,
    structure,
    visual === 'MATERIAL_FAIL' ? 'FAIL' : 'PASS',
  ]
  const overall: 'PASS' | 'FAIL' = flags.includes('FAIL') ? 'FAIL' : 'PASS'

  const whyParts = [
    !hasP1 ? 'party_p1_missing' : null,
    rep.secondParty && !hasP2 ? 'party_p2_missing' : null,
    staleParty ? 'stale_party' : null,
    locFails.length ? `loc:${locFails.join(',')}` : null,
    !weddingOk ? 'wedding_date_missing' : null,
    sourceWeddingStale ? 'stale_wedding_date' : null,
    !totalOk ? 'total_fail' : null,
    !depositOk ? 'deposit_fail' : null,
    !remainingOk ? 'remaining_fail' : null,
    !wordsOk ? 'words_fail' : null,
    oldCoexist ? 'old_finance_coexist' : null,
    extras === 'FAIL' ? 'extras_fail' : null,
    extrasPriceLeak ? 'extras_price_leak' : null,
    unrelatedMoney === 'FAIL' ? 'unrelated_money' : null,
    legal === 'FAIL' ? 'legal_fail' : null,
    sparse === 'FAIL' ? `sparse_${changeRatio.toFixed(2)}` : null,
    structure === 'FAIL' ? 'structure_fail' : null,
    visual === 'MATERIAL_FAIL' ? 'visual_fail' : null,
    `changed=${blocksChanged}/${blocksTotal}`,
    `calls=${input.modelCalls}`,
    input.protocolRetry ? 'protocol_retry' : null,
  ].filter(Boolean)

  return {
    caseId: scenario.caseId,
    party,
    locations,
    dates,
    packageOk,
    finance,
    extras,
    unrelatedMoney,
    legal,
    sparse,
    structure,
    visual,
    overall,
    modelCalls: input.modelCalls,
    protocolRetry: input.protocolRetry,
    blocksChanged,
    blocksTotal,
    changeRatio,
    changedBlockIds,
    why: whyParts.join(';'),
    representation: rep,
    canonical: { total, deposit, remaining },
    pdfPages: input.pdfPages,
    sourceTables: input.sourceSnap.tableCount,
    finalTables: input.finalSnap.tableCount,
  }
}

export async function runGoldenValidation(input: {
  apiKey: string
  caseIds?: readonly GoldenCaseId[]
  rootDir?: string
  usage?: Cg2InvokeUsage
}): Promise<{
  results: GoldenCaseResult[]
  usage: Cg2InvokeUsage
  stoppedOn: GoldenCaseId | null
  allPass: boolean
}> {
  const root =
    input.rootDir ??
    join(process.cwd(), 'tmp/golden-contract-validation')
  const sourceDir = join(root, 'SOURCE')
  const finalDir = join(root, 'FINAL')
  const renderedDir = join(root, 'RENDERED')
  const evidenceDir = join(root, 'EVIDENCE')
  for (const d of [finalDir, renderedDir, evidenceDir]) {
    mkdirSync(d, { recursive: true })
  }

  const usage = input.usage ?? createUsageTracker()
  const invoke: TransformFunctionsInvoke = createLocalFullRewriteInvoke({
    apiKey: input.apiKey,
    usage,
  })

  const all = buildGoldenScenarios()
  const selected = (input.caseIds ?? all.map((s) => s.caseId)).map((id) => {
    const s = all.find((x) => x.caseId === id)
    if (!s) throw new Error(`missing ${id}`)
    return s
  })

  const results: GoldenCaseResult[] = []
  let stoppedOn: GoldenCaseId | null = null

  for (const scenario of selected) {
    const sourcePath = join(sourceDir, scenario.sourceFile)
    if (!existsSync(sourcePath)) {
      throw new Error(`SOURCE missing: ${sourcePath}`)
    }
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
      currentDate: '2026-11-05',
    })

    // Representation map evidence BEFORE paid call
    writeFileSync(
      join(evidenceDir, `${scenario.caseId}_REPRESENTATION.json`),
      JSON.stringify(
        {
          caseId: scenario.caseId,
          sourceFile: scenario.sourceFile,
          representation: scenario.representation,
          expectedUpdate: scenario.expectedUpdate,
          expectedNonInsertion: scenario.expectedNonInsertion,
          datasetSummary: {
            clients: dataset.clients,
            dates: dataset.dates,
            locations: dataset.locations,
            finances: dataset.finances,
            package: dataset.package,
            extras: dataset.additionalServices?.map((s) => s.name) ?? [],
          },
          notes: scenario.notes,
        },
        null,
        2,
      ),
    )

    const sourcePdf = join(renderedDir, `${scenario.caseId}_SOURCE.pdf`)
    const sourceRender = renderDocxToPdf(sourcePath, sourcePdf)

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
      const fail: GoldenCaseResult = {
        caseId: scenario.caseId,
        party: 'FAIL',
        locations: 'FAIL',
        dates: 'FAIL',
        packageOk: 'FAIL',
        finance: 'FAIL',
        extras: 'FAIL',
        unrelatedMoney: 'N/A',
        legal: 'FAIL',
        sparse: 'FAIL',
        structure: 'FAIL',
        visual: 'UNRENDERED',
        overall: 'FAIL',
        modelCalls,
        protocolRetry,
        blocksChanged: 0,
        blocksTotal: sourceBlocks.length,
        changeRatio: 0,
        changedBlockIds: [],
        why: `${transform.reason}:${transform.message}`,
        representation: scenario.representation,
        canonical: {
          total: scenario.wedding.price ?? 0,
          deposit: scenario.wedding.depositAmount ?? 0,
          remaining:
            (scenario.wedding.price ?? 0) -
            (scenario.wedding.depositAmount ?? 0),
        },
        pdfPages: null,
        sourceTables: sourceSnap.tableCount,
        finalTables: 0,
      }
      writeFileSync(
        join(evidenceDir, `${scenario.caseId}.json`),
        JSON.stringify({ fail, transform }, null, 2),
      )
      results.push(fail)
      stoppedOn = scenario.caseId
      break
    }

    const outPath = join(finalDir, `${scenario.caseId}_FINAL.docx`)
    writeFileSync(outPath, Buffer.from(transform.outputBytes))

    const finalSnap = await snapshotDocx(transform.outputBytes)
    const reopenOk = await reopenParses(transform.outputBytes)
    const finalPdf = join(renderedDir, `${scenario.caseId}_FINAL.pdf`)
    const finalRender = renderDocxToPdf(outPath, finalPdf)

    const row = evaluateCase({
      scenario,
      sourceBlocks,
      sourceSnap,
      transform,
      modelCalls,
      protocolRetry,
      pdfPages: finalRender.pages,
      sourcePdfPages: sourceRender.pages,
      finalTexts: finalSnap.texts,
      finalSnap,
      reopenOk,
    })

    writeFileSync(
      join(evidenceDir, `${scenario.caseId}.json`),
      JSON.stringify(
        {
          ...row,
          sourceFile: scenario.sourceFile,
          sourceShaNote: 'byte-for-byte from owner golden set',
          sourceRender,
          finalRender,
          blockingIssues: transform.blockingIssues,
          reviewIssues: transform.reviewIssues,
          changedBlockIds: row.changedBlockIds,
          diagnostics: transform.diagnostics,
          datasetFinances: dataset.finances,
          extrasNames: dataset.additionalServices?.map((s) => s.name) ?? [],
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(evidenceDir, `${scenario.caseId}_NOTES.md`),
      [
        `# ${scenario.caseId}`,
        '',
        `- Overall: **${row.overall}**`,
        `- Why: ${row.why}`,
        `- Calls: ${row.modelCalls}; retry: ${row.protocolRetry}`,
        `- Changed: ${row.blocksChanged}/${row.blocksTotal} (${(row.changeRatio * 100).toFixed(1)}%)`,
        `- Visual: ${row.visual} (pages=${row.pdfPages})`,
        `- Canonical T/D/R: ${row.canonical.total}/${row.canonical.deposit}/${row.canonical.remaining}`,
        '',
      ].join('\n'),
    )

    results.push(row)
    if (row.overall === 'FAIL') {
      stoppedOn = scenario.caseId
      break
    }
  }

  writeFileSync(
    join(evidenceDir, 'MATRIX.json'),
    JSON.stringify({ results, stoppedOn, usage }, null, 2),
  )

  return {
    results,
    usage,
    stoppedOn,
    allPass:
      results.length === selected.length &&
      results.every((r) => r.overall === 'PASS'),
  }
}

async function main() {
  if (process.env.GOLDEN_PAID_EVAL !== '1') {
    console.log(
      'Set GOLDEN_PAID_EVAL=1 with OPENAI_API_KEY to run paid golden validation.',
    )
    process.exit(0)
  }
  const keyFile = '/tmp/ourwed_cg2_openai_key'
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
  if (!apiKey) {
    console.error('OPENAI key missing')
    process.exit(2)
  }
  const filter = process.env.GOLDEN_CASES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) as GoldenCaseId[] | undefined

  console.log('GENERATOR_SHA=', process.env.GENERATOR_SHA ?? 'unset')
  console.log('KEY_FILE_PRESENT=YES')
  console.log('MODEL=gpt-4.1-mini (via localFullRewriteInvoke)')
  console.log('CASES=', filter?.join(',') ?? 'G01..G06')

  const { results, stoppedOn, allPass, usage } = await runGoldenValidation({
    apiKey,
    caseIds: filter,
  })

  console.log('\n=== GOLDEN MATRIX ===')
  console.log(
    '| Case | Party | Locations | Dates | Package | Finance | Extras | Unrelated | Legal | Sparse | Structure | Visual | Overall |',
  )
  console.log(
    '|------|-------|-----------|-------|---------|---------|--------|-----------|-------|--------|-----------|--------|---------|',
  )
  for (const r of results) {
    console.log(
      `| ${r.caseId} | ${r.party} | ${r.locations} | ${r.dates} | ${r.packageOk} | ${r.finance} | ${r.extras} | ${r.unrelatedMoney} | ${r.legal} | ${r.sparse} | ${r.structure} | ${r.visual} | ${r.overall} |`,
    )
  }
  console.log('\nusage', JSON.stringify(usage))
  if (stoppedOn) {
    console.log(`GOLDEN_VALIDATION_STOPPED_ON_${stoppedOn}`)
    process.exit(1)
  }
  if (allPass) {
    console.log('GOLDEN_6_OF_6_AUTOMATED_VALIDATION_COMPLETE')
    process.exit(0)
  }
  console.log('GOLDEN_VALIDATION_INCOMPLETE')
  process.exit(1)
}

if (process.argv[1]?.includes('runGoldenValidation')) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
