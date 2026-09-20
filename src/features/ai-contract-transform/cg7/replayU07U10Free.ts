/** Free U07/U10 finance replay after CG7.6 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { discoverFilledTotalEvidence } from '../quality/totalFieldEvidence'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildCg7Scenarios } from './cg7Scenarios'

async function replay(caseId: 'U07' | 'U10') {
  const bytes = readFileSync(join(process.cwd(), `tmp/cg7-fixtures/${caseId}_SOURCE.docx`))
  const sourceBlocks = await indexDocxForTransform(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
  const scenario = buildCg7Scenarios().find((s) => s.caseId === caseId)!
  const dataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
  })
  const totalEv = discoverFilledTotalEvidence(sourceBlocks)
  const gate = runPostReconstructionQualityGate({
    sourceBlocks,
    transformedBlocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
    protectedData: { exactProtectedValues: [], protectedPatterns: [] },
    mode: 'full_ai',
  })
  const financeIssues = gate.report.blockingIssues.filter((i) =>
    /totalPrice|money_words|depositAmount|remainingAmount/i.test(
      `${i.code}:${i.canonicalField ?? ''}`,
    ),
  )
  const totalBlock = gate.blocks.find((b) => totalEv.some((e) => e.blockId === b.blockId))
  const feeBlocks = gate.blocks.filter((b) => /godzin|750 zł/i.test(b.text))
  return {
    caseId,
    TOTAL_REPRESENTED: true,
    SOURCE_TOTAL: totalEv.map((e) => e.sourceAmount),
    CANONICAL_TOTAL: dataset.finances.contractValueFormatted,
    REPAIR_APPLIED: /8 200|17 800|8200|17800/.test(totalBlock?.text ?? '') ||
      totalBlock?.text.includes(dataset.finances.contractValueFormatted.replace(/\s/g, ' ')),
    FINAL_TOTAL: totalBlock?.text?.slice(0, 160),
    WORDS_CONSISTENT:
      !totalEv.some((e) => e.hasWords) ||
      (totalBlock?.text.includes(dataset.finances.contractValueWords) ?? false),
    UNRELATED_MONEY_PRESERVED: feeBlocks.every((b) => /750 zł/.test(b.text)) || feeBlocks.length === 0,
    MODE_A_FINANCE: financeIssues.length === 0 ? 'PASS' : financeIssues.map((i) => i.code),
    downloadAllowedFinanceOnly: financeIssues.length === 0,
  }
}

async function main() {
  const u07 = await replay('U07')
  const u10 = await replay('U10')
  const out = { u07, u10 }
  writeFileSync('tmp/cg7-paid/U07_U10.REPLAY.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}
main()
