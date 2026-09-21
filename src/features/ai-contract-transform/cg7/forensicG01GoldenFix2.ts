/**
 * Golden Fix 2 — forensics only (no generator changes).
 * Traces finance corruption, para-1 staleness, package non-update.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildProtectedContractData } from '../protectedContractData'
import { buildExpectationManifest } from '../quality/expectationManifest'
import { applyDeterministicRepairs } from '../quality/deterministicRepairs'
import { repairCanonicalPaymentAmounts } from '../quality/paymentAmountRepair'
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
  const manifest = buildExpectationManifest({
    sourceBlocks: blocks,
    dataset,
    protectedData,
  })

  // --- FINANCE unit: reproduce replace on SOURCE texts ---
  const financeIds = ['para-12', 'para-13', 'para-14']
  const sourceFinance = Object.fromEntries(
    financeIds.map((id) => {
      const b = blocks.find((x) => x.blockId === id)!
      return [id, b.text]
    }),
  )

  // Probe cents-span regex used in tryReplaceTotalInPlace
  const centsProbeRe = /(\d[\d\s\u00a0]*\s*zł(?:otych|ote|oty)?)/i
  const centsProbes: Record<string, unknown> = {}
  for (const [id, text] of Object.entries(sourceFinance)) {
    const m = text.match(centsProbeRe)
    centsProbes[id] = m
      ? {
          match: m[1],
          index: m.index,
          digits: (m[1] ?? '').replace(/[^\d]/g, ''),
          before: text.slice(Math.max(0, (m.index ?? 0) - 20), m.index),
          afterReplaceDemo:
            text.slice(0, m.index!) +
            'CANONICAL zł' +
            text.slice(m.index! + m[0].length),
        }
      : null
  }

  // textContainsNormalized false-positive probes
  const containsProbes = {
    '11200_in_1200': textContainsNormalized('sesja za 1 200,00 zł', '11 200 zł'),
    '11200_in_8400': textContainsNormalized(
      'wynosi 8 400,00 zł',
      '11 200 zł',
    ),
    '2500_in_1500': textContainsNormalized(
      'wysokości 1 500,00 zł',
      '2 500 zł',
    ),
    '11200_in_1120000_cents': textContainsNormalized(
      'wynosi 11 200,00 zł',
      '11 200 zł',
    ),
    '11200_in_corrupted': textContainsNormalized(
      'wynosi 11 211 200 zł',
      '11 200 zł',
    ),
    '1200_unrelated_vs_11200': textContainsNormalized(
      '1 200,00 zł',
      '11 200 zł',
    ),
  }

  // Apply payment repair alone on SOURCE (simulates model left old amounts)
  const asTransformed = blocks.map((b) => ({ blockId: b.blockId, text: b.text }))
  const payOnly = repairCanonicalPaymentAmounts({
    blocks: asTransformed,
    sourceBlocks: blocks,
    dataset,
  })
  const payOnlyResult = Object.fromEntries(
    financeIds.map((id) => {
      const t = payOnly.blocks.find((b) => b.blockId === id)?.text
      return [id, t]
    }),
  )

  // Full deterministic repairs on SOURCE
  const full = applyDeterministicRepairs({
    blocks: asTransformed.map((b) => ({ ...b })),
    dataset,
    manifest,
    sourceBlocks: blocks,
  })
  const fullFinance = Object.fromEntries(
    financeIds.map((id) => {
      const t = full.blocks.find((b) => b.blockId === id)?.text
      return [id, t]
    }),
  )

  // Simulate Fix1 FINAL corruption path: if first replace yields "8 400,11 200"
  // then exact_stale "8 400" → "11 200"
  const stepDemo: Record<string, string[]> = {}
  for (const [id, text] of Object.entries(sourceFinance)) {
    const steps: string[] = [text]
    const m = text.match(centsProbeRe)
    if (m && m.index != null) {
      const canon =
        id === 'para-12'
          ? dataset.finances.contractValueFormatted
          : id === 'para-13'
            ? dataset.finances.depositFormatted!
            : dataset.finances.remainingFormatted!
      const afterCents =
        text.slice(0, m.index) + canon + text.slice(m.index + m[0].length)
      steps.push(`after_cents_span_replace(${m[1]}→${canon}): ${afterCents}`)
      if (afterCents.includes('8 400')) {
        steps.push(
          `after_stale_8400→11200: ${afterCents.replace('8 400', '11 200')}`,
        )
      }
      if (afterCents.includes('1 500')) {
        steps.push(
          `after_stale_1500→2500: ${afterCents.replace('1 500', '2 500')}`,
        )
      }
      if (afterCents.includes('6 900')) {
        steps.push(
          `after_stale_6900→8700: ${afterCents.replace('6 900', '8 700')}`,
        )
      }
    }
    stepDemo[id] = steps
  }

  // Two-pass: payment repair then inspect
  const twoPassBlocks = blocks.map((b) => ({ blockId: b.blockId, text: b.text }))
  const p1 = repairCanonicalPaymentAmounts({
    blocks: twoPassBlocks,
    sourceBlocks: blocks,
    dataset,
  })
  const afterPay = Object.fromEntries(
    financeIds.map((id) => [
      id,
      p1.blocks.find((b) => b.blockId === id)?.text,
    ]),
  )
  const staleReps = manifest.requiredReplacements.filter(
    (r) =>
      r.canonicalField === 'contract.totalPrice' ||
      r.sourceValues.some((v) => /\d/.test(v) && /zł/i.test(v)),
  )

  const financeForensic = {
    canonical: {
      total: dataset.finances.contractValueFormatted,
      deposit: dataset.finances.depositFormatted,
      remaining: dataset.finances.remainingFormatted,
      totalWords: dataset.finances.contractValueWords,
    },
    sourceFinance,
    centsProbes,
    containsProbes,
    paymentRepairAlone: {
      repairs: p1.repairs,
      result: payOnlyResult,
    },
    fullDeterministicOnSource: {
      repairs: full.repairs.filter((r) =>
        financeIds.includes(r.blockId) ||
        /total|deposit|remaining|money/i.test(r.repairCode),
      ),
      result: fullFinance,
    },
    stepDemoHypotheses: stepDemo,
    afterPayThenInspect: afterPay,
    moneyRelatedReplacements: staleReps,
    requiredMoneyFields: manifest.requiredFields.filter((f) =>
      /total|deposit|remaining/i.test(f.canonicalField),
    ),
    observedFinalCorruption: {
      para12: '11 211 200 zł',
      para13: '1 500,2 500 zł',
      para14: '6 900,8 700 zł',
    },
  }

  // --- HEADLINE para-1 ---
  const para1 = blocks.find((b) => b.blockId === 'para-1')!
  const partyReps = manifest.requiredReplacements.filter(
    (r) => r.canonicalField === 'customer.names',
  )
  const dateReps = manifest.requiredReplacements.filter(
    (r) => r.canonicalField === 'wedding.date',
  )
  const headlineForensic = {
    sourceText: para1.text,
    concepts: {
      hasPartyNames: /Alicj|Tomasz/i.test(para1.text),
      hasWeddingDate: /12 czerwca 2027|czerwca 2027/i.test(para1.text),
    },
    canonical: {
      party: dataset.clients.displayNames,
      weddingDate: dataset.dates.weddingDate,
    },
    inPartyEvidence: (manifest.sourcePartyEvidence ?? []).some(
      (e) => e.blockId === 'para-1',
    ),
    partySourceBlockIds: partyReps.flatMap((r) => r.sourceBlockIds),
    dateSourceBlockIds: dateReps.flatMap((r) => r.sourceBlockIds),
    dateRequired: manifest.requiredFields.find(
      (f) => f.canonicalField === 'wedding.date',
    ),
    partyRequired: manifest.requiredFields.find(
      (f) => f.canonicalField === 'customer.names',
    ),
    diagnosis:
      'para-1 not in sourcePartyEvidence / requiredContextBlockIds for names; wedding date may be represented globally but para-1 not grounded as a date surface',
  }

  // --- PACKAGE ---
  const pkgBlocks = blocks
    .filter((b) => /Klasyczny|pakiet|Reportaż/i.test(b.text))
    .map((b) => ({ id: b.blockId, text: b.text.slice(0, 160) }))
  const packageForensic = {
    canonical: dataset.package?.name,
    sourceBlocksMentioningPackage: pkgBlocks,
    requiredFields: manifest.requiredFields.filter((f) =>
      /package/i.test(f.canonicalField),
    ),
    requiredReplacements: manifest.requiredReplacements.filter((f) =>
      /package/i.test(f.canonicalField),
    ),
    sourceSpecificPackage: manifest.sourceSpecificValues.filter((s) =>
      /package|Klasyczny/i.test(s.canonicalField + s.sourceValue),
    ),
    representedHeuristic: blocks.some((b) =>
      /pakiet\s+Klasyczny|Klasyczny Reportaż/i.test(b.text),
    ),
  }

  writeFileSync(
    join(out, 'G01_FINANCE_FORENSIC.json'),
    JSON.stringify(financeForensic, null, 2),
  )
  writeFileSync(
    join(out, 'G01_HEADLINE_FORENSIC.json'),
    JSON.stringify(headlineForensic, null, 2),
  )
  writeFileSync(
    join(out, 'G01_PACKAGE_FORENSIC.json'),
    JSON.stringify(packageForensic, null, 2),
  )

  // Human markdown
  writeFileSync(
    join(out, 'G01_FINANCE_FORENSIC.md'),
    [
      '# G01 Finance Forensic (Golden Fix 2, pre-implementation)',
      '',
      '## Canonical',
      `- total: ${dataset.finances.contractValueFormatted}`,
      `- deposit: ${dataset.finances.depositFormatted}`,
      `- remaining: ${dataset.finances.remainingFormatted}`,
      '',
      '## SOURCE surfaces',
      ...financeIds.map((id) => `- **${id}**: ${sourceFinance[id]}`),
      '',
      '## Smoking-gun: cents-span regex',
      '',
      'Pattern used in `tryReplaceTotalInPlace` / shared amount matcher:',
      '```',
      String(centsProbeRe),
      '```',
      '',
      'On amounts like `8 400,00 zł`, the first match is often **`00 zł`** (cents only),',
      'because `[,]` is outside `[\\d\\s]`.',
      '',
      '### Probe results',
      ...Object.entries(centsProbes).map(
        ([id, p]) =>
          `- ${id}: match=\`${(p as { match?: string } | null)?.match ?? 'none'}\` → demo \`${(p as { afterReplaceDemo?: string } | null)?.afterReplaceDemo ?? ''}\``,
      ),
      '',
      '## Classification',
      '',
      '### Deposit / remaining → `1 500,2 500` / `6 900,8 700`',
      '**F1 + F2**: cents-only span `00 zł` replaced with canonical amount, leaving the integer part + comma:',
      '`1 500,` + `2 500 zł` = `1 500,2 500 zł`.',
      '',
      '### Total → `11 211 200`',
      'Likely **F1 then F3/F8**: cents-span replace yields `8 400,11 200 zł`, then a second',
      'stale/`exact` or digit-normalization pass mutates the leading `8 400` fragment into',
      'a concatenated form. See `stepDemoHypotheses` in JSON. Exact second operation confirmed',
      'by paymentRepairAlone vs fullDeterministic comparison below.',
      '',
      '## Payment repair alone on SOURCE',
      `Repairs: ${JSON.stringify(p1.repairs, null, 2)}`,
      '',
      ...financeIds.map((id) => `- ${id}: ${payOnlyResult[id]}`),
      '',
      '## Full deterministic on SOURCE',
      ...financeIds.map((id) => `- ${id}: ${fullFinance[id]}`),
      '',
      '## textContainsNormalized money probes',
      '```json',
      JSON.stringify(containsProbes, null, 2),
      '```',
      '',
      '## Unrelated 1 200 vs 11 200',
      `textContainsNormalized('1 200,00 zł', '11 200 zł') = ${containsProbes['1200_unrelated_vs_11200']}`,
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(out, 'G01_HEADLINE_FORENSIC.md'),
    [
      '# G01 Headline Forensic (para-1)',
      '',
      `SOURCE: ${para1.text}`,
      '',
      `Canonical party: ${dataset.clients.displayNames}`,
      `Canonical wedding date: ${dataset.dates.weddingDate}`,
      '',
      `In partyEvidence: ${headlineForensic.inPartyEvidence}`,
      `Party sourceBlockIds: ${headlineForensic.partySourceBlockIds.join(', ') || '(none include para-1)'}`,
      `Date sourceBlockIds: ${headlineForensic.dateSourceBlockIds.join(', ') || '(none)'}`,
      '',
      '## Classification',
      'Headline represents party + wedding date but is **not grounded** in',
      '`sourcePartyEvidence` / date evidence sourceBlockIds.',
      'Model may omit it; deterministic layer does not repair it.',
      '**Not** solved by global name/date replace.',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(out, 'G01_PACKAGE_FORENSIC.md'),
    [
      '# G01 Package Forensic',
      '',
      `Canonical: ${dataset.package?.name}`,
      `SOURCE surfaces:`,
      ...pkgBlocks.map((b) => `- ${b.id}: ${b.text}`),
      '',
      `requiredFields(package*): ${JSON.stringify(packageForensic.requiredFields)}`,
      `requiredReplacements(package*): ${JSON.stringify(packageForensic.requiredReplacements)}`,
      '',
      '## Classification',
      packageForensic.requiredReplacements.length === 0 &&
        packageForensic.requiredFields.length === 0
        ? '**PK1/PK5/PK6**: package not in requiredFields/requiredReplacements — representation/completeness gap (like pre-CG7.6 totals). Soft review only via serviceScope.'
        : 'See JSON for details.',
      '',
      'Package name ≠ service scope deliverables. Fix must not rewrite hours/photos/legal scope.',
      '',
    ].join('\n'),
  )

  console.log('Finance pay-only repairs', p1.repairs)
  console.log('Finance pay-only results', payOnlyResult)
  console.log('Finance full results', fullFinance)
  console.log('cents probes', JSON.stringify(centsProbes, null, 2))
  console.log('headline', headlineForensic)
  console.log('package req', packageForensic.requiredFields, packageForensic.requiredReplacements)
  console.log('Wrote forensic files to', out)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
