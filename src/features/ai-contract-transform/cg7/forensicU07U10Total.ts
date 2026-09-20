/**
 * CG7.6 — U07/U10 represented-total forensic (offline).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildExpectationManifest } from '../quality/expectationManifest'
import { repairCanonicalPaymentAmounts } from '../quality/paymentAmountRepair'
import { detectRepresentedConcepts } from '../quality/representationPolicy'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildCg7Scenarios } from './cg7Scenarios'

async function loadBlocks(caseId: string) {
  const bytes = readFileSync(join(process.cwd(), `tmp/cg7-fixtures/${caseId}_SOURCE.docx`))
  return indexDocxForTransform(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
}

function classifyBlock(text: string) {
  const hasPln = /\d[\d\s\u00a0]*\s*zł/i.test(text)
  const depositish = /zadatek|zaliczk|rezerwacj/i.test(text)
  const remainingish = /pozostał|saldo|do zapłaty/i.test(text)
  const totalMarkerNarrow =
    /honorarium|wynagrodzen|wartość zlecenia|cena|PLACEHOLDER_CENA/i.test(text)
  const totalishVocab =
    /inwestycj|wartość|wynagrodzen|honorarium|cena|kwota umowy|łączna wartość/i.test(
      text,
    )
  const hasWords = /słownie/i.test(text)
  return {
    hasPln,
    depositish,
    remainingish,
    totalMarkerNarrow,
    totalishVocab,
    hasWords,
  }
}

async function forensic(caseId: 'U07' | 'U10') {
  const scenarios = buildCg7Scenarios()
  const scenario = scenarios.find((s) => s.caseId === caseId)!
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
  })
  const sourceBlocks = await loadBlocks(caseId)
  const rep = detectRepresentedConcepts(sourceBlocks)
  const protectedData = {
    exactProtectedValues: [] as string[],
    protectedPatterns: [] as import('../types').ProtectedPattern[],
  }
  const manifest = buildExpectationManifest({
    sourceBlocks,
    dataset,
    protectedData,
  })

  const financeBlocks = sourceBlocks
    .map((b, i) => ({ i, ...b, flags: classifyBlock(b.text) }))
    .filter((b) => b.flags.hasPln)

  const repaired = repairCanonicalPaymentAmounts({
    blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    sourceBlocks,
    dataset,
  })

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

  const totalReq = manifest.requiredFields.filter(
    (f) => f.canonicalField === 'contract.totalPrice',
  )
  const totalReps = manifest.requiredReplacements.filter(
    (r) => r.canonicalField === 'contract.totalPrice',
  )
  const totalWordsReq = manifest.requiredFields.filter(
    (f) => f.canonicalField === 'contract.totalPriceWords',
  )

  const canonicalTotal = dataset.finances.contractValueFormatted
  const canonicalWords = dataset.finances.contractValueWords
  const joinedAfter = repaired.blocks.map((b) => b.text).join('\n')
  const totalPresentAfter = joinedAfter.includes(
    canonicalTotal.replace(/\s/g, ' '),
  ) || /8200|8 200|17800|17 800/.test(joinedAfter)

  return {
    caseId,
    canonicalTotal,
    canonicalWords,
    depositFormatted: dataset.finances.depositFormatted,
    remainingFormatted: dataset.finances.remainingFormatted,
    representation: rep,
    financeBlocks: financeBlocks.map((b) => ({
      blockId: b.blockId,
      index: b.i,
      text: b.text,
      ...b.flags,
      wouldMatchTryReplaceTotal: b.flags.totalMarkerNarrow,
    })),
    totalRequiredFields: totalReq,
    totalRequiredReplacements: totalReps,
    totalWordsRequiredFields: totalWordsReq,
    deterministicRepairs: repaired.repairs,
    totalPresentAfterRepair: totalPresentAfter,
    repairedTotalCandidates: repaired.blocks
      .filter((b) => /\d[\d\s]*\s*zł/i.test(b.text))
      .map((b) => ({ blockId: b.blockId, text: b.text })),
    modeABlocking: gate.report.blockingIssues
      .filter((i) => /totalPrice|money_words/i.test(i.code + (i.canonicalField ?? '')))
      .map((i) => `${i.code}:${i.canonicalField ?? ''}`),
    rootCauseHypothesis: financeBlocks.some((b) => b.flags.totalishVocab && !b.flags.totalMarkerNarrow)
      ? 'D_plus_A: represented total surface exists but TOTAL_MARKER too narrow; model omitted; no grounded sourceBlockIds in requiredReplacements'
      : 'investigate',
  }
}

async function main() {
  mkdirSync('tmp/cg7-paid', { recursive: true })
  const u07 = await forensic('U07')
  const u10 = await forensic('U10')
  const shared =
    u07.rootCauseHypothesis === u10.rootCauseHypothesis &&
    u07.financeBlocks.some((b) => !b.wouldMatchTryReplaceTotal && b.totalishVocab) &&
    u10.financeBlocks.some((b) => !b.wouldMatchTryReplaceTotal && b.totalishVocab)

  const out = {
    sharedRootCause: shared,
    classification: {
      U07: 'D (+A): deterministic total repair TOTAL_MARKER miss; model omitted; no sourceBlockIds for total',
      U10: 'D (+A): same — Wartość kontraktu ≠ wartość zlecenia marker',
    },
    u07,
    u10,
  }
  writeFileSync('tmp/cg7-paid/U07_U10.FORENSIC.json', JSON.stringify(out, null, 2))

  const md = `# CG7.6 U07 / U10 REPRESENTED-TOTAL FORENSIC

## Shared root cause?
**${shared ? 'YES' : 'NO'}** — class **D (+A)**

Both templates represent contract total with vocabulary outside
\`tryReplaceTotalInPlace\` TOTAL_MARKER
(\`honorarium|wynagrodzen|wartość zlecenia|cena|PLACEHOLDER_CENA\`).

Model omitted rewrite; deterministic repair skipped; Mode A fails on
\`contract.totalPrice\` / words.

Manifest \`requiredFields\` lists total as must_appear but
\`requiredReplacements\` has **no grounded sourceBlockIds** for total.

## U07
- Canonical total: **${u07.canonicalTotal}** (${u07.canonicalWords})
- Representation: total=${u07.representation.totalPrice} deposit=${u07.representation.deposit} remaining=${u07.representation.remaining}
- Finance PLN blocks:
${u07.financeBlocks.map((b) => `  - ${b.blockId}: narrowMatch=${b.wouldMatchTryReplaceTotal} vocab=${b.totalishVocab} words=${b.hasWords} dep=${b.depositish} rem=${b.remainingish}\n    "${b.text}"`).join('\n')}
- Deterministic repairs: ${u07.deterministicRepairs.length === 0 ? 'NONE' : u07.deterministicRepairs.map((r) => r.repairCode).join(', ')}
- Total present after repair: ${u07.totalPresentAfterRepair}
- Mode A: ${u07.modeABlocking.join('; ') || 'none'}
- total requiredReplacements: ${JSON.stringify(u07.totalRequiredReplacements)}

## U10
- Canonical total: **${u10.canonicalTotal}** (${u10.canonicalWords})
- Representation: total=${u10.representation.totalPrice} deposit=${u10.representation.deposit} remaining=${u10.representation.remaining}
- Finance PLN blocks:
${u10.financeBlocks.map((b) => `  - ${b.blockId}: narrowMatch=${b.wouldMatchTryReplaceTotal} vocab=${b.totalishVocab} words=${b.hasWords} dep=${b.depositish} rem=${b.remainingish}\n    "${b.text}"`).join('\n')}
- Deterministic repairs: ${u10.deterministicRepairs.length === 0 ? 'NONE' : u10.deterministicRepairs.map((r) => r.repairCode).join(', ')}
- Total present after repair: ${u10.totalPresentAfterRepair}
- Mode A: ${u10.modeABlocking.join('; ') || 'none'}
- total requiredReplacements: ${JSON.stringify(u10.totalRequiredReplacements)}

## Classification per case
- U07: D (+A) — not C/E/F/G/H as primary
- U10: D (+A) — same architectural class
`
  writeFileSync('tmp/cg7-paid/U07_U10.FORENSIC.md', md)
  console.log(md)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
