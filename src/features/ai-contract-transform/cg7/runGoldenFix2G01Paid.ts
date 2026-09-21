import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createLocalFullRewriteInvoke, createUsageTracker } from '../cg2/localFullRewriteInvoke'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runSparseProductTransform } from '../transformService'
import { snapshotDocx, reopenParses } from '../cg1/docxInspect'
import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { textContainsNormalized } from '../quality/normalize'
import { buildGoldenScenarios } from './goldenScenarios'

function renderPdf(docx: string, pdf: string) {
  try {
    execFileSync('rm', ['-f', pdf])
    execFileSync(
      'osascript',
      [
        '-e',
        `tell application "Pages"
  set theDoc to open POSIX file "${docx}"
  delay 1.5
  export theDoc to POSIX file "${pdf}" as PDF
  close theDoc saving no
end tell`,
      ],
      { timeout: 120_000 },
    )
    return existsSync(pdf)
  } catch {
    return false
  }
}

async function main() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    readFileSync('/tmp/ourwed_cg2_openai_key', 'utf8').trim()
  const out = join(process.cwd(), 'tmp/golden-fix-2')
  mkdirSync(out, { recursive: true })
  const scenario = buildGoldenScenarios().find((s) => s.caseId === 'G01')!
  const sourcePath = join(
    process.cwd(),
    'tmp/golden-contract-validation/SOURCE',
    scenario.sourceFile,
  )
  const buf = readFileSync(sourcePath)
  const sourceBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-11-05',
  })
  writeFileSync(join(out, 'G01_DATA.json'), JSON.stringify({ dataset, scenario: {
    partners: scenario.wedding.couple,
    price: scenario.wedding.price,
    deposit: scenario.wedding.depositAmount,
    package: scenario.package.name,
    extras: scenario.extras.map((e) => e.name),
  }}, null, 2))

  const usage = createUsageTracker()
  const invoke = createLocalFullRewriteInvoke({ apiKey, usage })
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
    writeFileSync(
      join(out, 'G01_PAID_RETEST.json'),
      JSON.stringify({ ok: false, transform, usage, modelCalls, protocolRetry }, null, 2),
    )
    console.log('G01_PAID_RETEST_FAIL', transform.blockingIssues)
    process.exit(1)
  }

  const finalPath = join(out, 'G01_FINAL.docx')
  writeFileSync(finalPath, Buffer.from(transform.outputBytes))
  copyFileSync(sourcePath, join(out, 'G01_SOURCE.docx'))
  const snap = await snapshotDocx(transform.outputBytes)
  const reopenOk = await reopenParses(transform.outputBytes)
  const blob = snap.texts.join('\n')
  const total = scenario.wedding.price!
  const pdfOk =
    process.env.G01_PDF === '1'
      ? renderPdf(finalPath, join(out, 'G01_FINAL.pdf'))
      : false

  const matrix = {
    ok: true,
    modelCalls,
    protocolRetry,
    usage,
    reopenOk,
    pdfOk,
    automatedRender:
      process.env.G01_PDF === '1'
        ? pdfOk
          ? 'PDF_OK'
          : 'AUTOMATED_RENDER_UNAVAILABLE'
        : 'AUTOMATED_RENDER_UNAVAILABLE',
    party:
      /Zofi[ai].*Kalendarzow/i.test(blob) &&
      !/\bAlicj[aąęi]\b/i.test(blob.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, ' ')),
    headline:
      /Zofi[ai].*Kalendarzow/i.test(blob) &&
      /18 września 2027|18\.09\.2027/.test(blob) &&
      !/12 czerwca 2027/.test(blob),
    providerNip: /000-000-00-01/.test(blob),
    providerRegon: /000000001/.test(blob),
    providerEmail: /kontakt@atelier-szept\.example/i.test(blob),
    providerName: /Magdalen|Atelier Szept/i.test(blob),
    providerRole: /Fotograf/i.test(blob),
    address: textContainsNormalized(blob, 'ul. Kasztanowa 21/5, 60-214 Poznań'),
    total:
      (/11 200 zł/.test(blob) || /11200/.test(blob)) && !/11 211 200/.test(blob),
    deposit: (/2 500 zł/.test(blob) || /2500/.test(blob)) && !/1 500,\s*2 500/.test(blob),
    remaining:
      (/8 700 zł/.test(blob) || /8700/.test(blob)) && !/6 900,\s*8 700/.test(blob),
    words: textContainsNormalized(blob, polishContractMoneyWords(total)),
    extras: scenario.extras.every(
      (e) => e.name && blob.toLowerCase().includes(e.name.toLowerCase()),
    ),
    unrelated: ['1 200,00 zł', '650,00 zł', '980,00 zł'].every((m) =>
      blob.replace(/\u00a0/g, ' ').includes(m),
    ),
    package:
      /Reportaż Wieczorny/i.test(blob) && !/Klasyczny Reportaż/i.test(blob),
    noFinanceCorruption:
      !/11 211 200/.test(blob) &&
      !/1 500,\s*2 500/.test(blob) &&
      !/6 900,\s*8 700/.test(blob),
    blockingIssues: transform.blockingIssues,
    reviewIssues: transform.reviewIssues,
  }
  writeFileSync(join(out, 'G01_PAID_RETEST.json'), JSON.stringify(matrix, null, 2))
  console.log(JSON.stringify(matrix, null, 2))
  const fail = Object.entries(matrix).filter(
    ([k, v]) =>
      typeof v === 'boolean' &&
      v === false &&
      !['protocolRetry', 'pdfOk'].includes(k),
  )
  if (fail.length) {
    console.log('G01_PAID_RETEST_MATERIAL_GAPS', fail)
    process.exit(1)
  }
  console.log('G01_PAID_RETEST_PASS')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
