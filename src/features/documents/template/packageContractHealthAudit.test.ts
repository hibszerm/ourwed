/**
 * Package contract health audit regression.
 * Run: npm run test:package-contract-health
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildPackageContractHealthReport,
  detectDerivedFinancialClauses,
  detectMultiLocationSlot,
  detectPaymentNumberingIssues,
  extractMoneyAmountsPln,
  extractPercentages,
} from './packageContractHealthAudit'
import type { TemplateSlot } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function slot(
  registryKey: string,
  para: number,
  start: number,
  end: number,
  originalText: string,
): TemplateSlot {
  return {
    id: `slot-${registryKey}-${para}-${start}-${end}`,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: para,
    originalText,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    detectionStatus: 'bound',
  }
}

run('helpers — extract money and percentages generically', () => {
  assertEq(extractMoneyAmountsPln('wynagrodzenie 9 000 zł brutto')[0], 9000, '9k')
  assertEq(extractMoneyAmountsPln('tj. 4500 zł')[0], 4500, '4500')
  assertEq(extractPercentages('50% ustalonego wynagrodzenia')[0], 50, '50%')
})

run('A — price + percentage + derived amount', () => {
  const paragraphs = [
    {
      index: 10,
      text: 'Wynagrodzenie wynosi 9000 zł brutto.',
    },
    {
      index: 20,
      text: 'W przypadku rozwiązania Umowy z przyczyn leżących po stronie Pary młodej, Kamerzysta ma prawo zatrzymać 50% ustalonego wynagrodzenia, tj. 4500 zł.',
    },
  ]
  const slots = [slot('contract_value_formatted', 10, 20, 28, '9000 zł')]
  const found = detectDerivedFinancialClauses({ paragraphs, slots })
  assert(
    found.some((c) => c.code === 'derived_financial_value'),
    'derived financial detected',
  )
  const first = found[0]
  assert(first != null, 'has finding')
  assert(
    typeof first.message === 'string' &&
      first.message.includes('calculated amount'),
    'english product message',
  )
  assert(
    typeof first.recommendation === 'string' &&
      first.recommendation.includes('OPTION A'),
    'option A/B',
  )
})

run('B — single location representing three logical locations', () => {
  const paragraphs = [
    {
      index: 5,
      text: 'Miejscami przygotowania, ceremonii i przyjęcia weselnego jest ZINNAR CASTLE.',
    },
  ]
  const slots = [
    slot('preparation_location', 5, 55, 68, 'ZINNAR CASTLE'),
    slot('ceremony_location', 5, 55, 68, 'ZINNAR CASTLE'),
    slot('reception_location', 5, 55, 68, 'ZINNAR CASTLE'),
  ]
  const found = detectMultiLocationSlot({ paragraphs, slots })
  assertEq(found.length, 1, 'one warning')
  const first = found[0]
  assert(first != null, 'has finding')
  assertEq(first.code, 'multi_location_slot', 'code')
  assert(
    typeof first.message === 'string' &&
      first.message.includes('preparation, ceremony and reception'),
    'message',
  )
})

run('C — broken payment numbering', () => {
  const paragraphs = [
    {
      index: 12,
      text: 'Wynagrodzenie płatne jest w trzech ratach:',
    },
    {
      index: 13,
      text: 'b) druga rata w dniu ślubu',
    },
    {
      index: 14,
      text: 'c) trzecia rata po odbiorze filmu',
    },
  ]
  const found = detectPaymentNumberingIssues({ paragraphs })
  assert(
    found.some((c) => c.code === 'payment_numbering_inconsistent'),
    'numbering warning',
  )
})

run('D — remaining amount mismatch', () => {
  const paragraphs = [
    { index: 1, text: 'Wynagrodzenie 9000 zł.' },
    { index: 2, text: 'Zadatek 1000 zł.' },
    {
      index: 3,
      text: 'Pozostałą do zapłaty część wynagrodzenia, pomniejszoną o zadatek, tj. kwotę 8000 zł Para młoda zapłaci w dniu uroczystości.',
    },
  ]
  const slots = [
    slot('contract_value_formatted', 1, 14, 22, '9000 zł'),
    slot('agreed_deposit_formatted', 2, 8, 16, '1000 zł'),
    // remaining NOT bound — concrete amount will drift
  ]
  const found = detectDerivedFinancialClauses({ paragraphs, slots })
  assert(
    found.some((c) => c.code === 'remaining_amount_mismatch'),
    'remaining mismatch',
  )
})

run('E — deposit mismatch', () => {
  const paragraphs = [
    { index: 1, text: 'Wynagrodzenie 10000 zł.' },
    {
      index: 2,
      text: 'Zadatek wynosi 50% wynagrodzenia, tj. 5000 zł, natomiast w umowie wskazano inną wartość slotu.',
    },
  ]
  const slots = [
    slot('contract_value_formatted', 1, 14, 23, '10000 zł'),
    slot('agreed_deposit_formatted', 2, 0, 8, '2000 zł'),
  ]
  const found = detectDerivedFinancialClauses({ paragraphs, slots })
  assert(
    found.some(
      (c) =>
        c.code === 'deposit_mismatch' || c.code === 'derived_financial_value',
    ),
    'deposit / derived flagged',
  )
})

run('F — template without any warnings', () => {
  const paragraphs = [
    { index: 0, text: 'Umowa o dzieło.' },
    { index: 1, text: 'Wynagrodzenie wynosi 9000 zł.' },
    { index: 2, text: 'Ceremonia: Kościół.' },
    { index: 3, text: 'Przyjęcie: Hotel.' },
  ]
  const slots = [
    slot('contract_value_formatted', 1, 20, 28, '9000 zł'),
    slot('ceremony_location', 2, 11, 18, 'Kościół'),
    slot('reception_location', 3, 11, 16, 'Hotel'),
  ]
  const report = buildPackageContractHealthReport({
    paragraphs,
    slots,
    readinessReady: true,
  })
  assertEq(report.warningCount, 0, 'no warnings')
  assertEq(report.criticalCount, 0, 'no critical')
  assert(report.generationAllowed, 'allowed')
  assert(
    report.checks.filter((c) => c.status === 'ok').length >= 4,
    'base checks ok',
  )
})

run('Zinnar-style health report shape', () => {
  const paragraphs = [
    {
      index: 8,
      text: 'Wynagrodzenie w łącznej wysokości 9000 zł brutto.',
    },
    {
      index: 9,
      text: 'Miejscami przygotowania, ceremonii ślubu oraz przyjęcia weselnego jest ZINNAR CASTLE.',
    },
    {
      index: 15,
      text: 'Wynagrodzenie płatne jest w trzech ratach:',
    },
    { index: 16, text: 'b) druga rata' },
    { index: 17, text: 'c) trzecia rata' },
    {
      index: 22,
      text: 'Kamerzysta ma prawo zatrzymać 50% ustalonego wynagrodzenia, tj. 4500 zł.',
    },
  ]
  const slots = [
    slot('contract_value_formatted', 8, 32, 40, '9000 zł'),
    slot('preparation_location', 9, 70, 83, 'ZINNAR CASTLE'),
    slot('ceremony_location', 9, 70, 83, 'ZINNAR CASTLE'),
    slot('reception_location', 9, 70, 83, 'ZINNAR CASTLE'),
  ]
  const report = buildPackageContractHealthReport({
    paragraphs,
    slots,
    readinessReady: true,
  })
  assert(report.generationAllowed, 'generation still allowed')
  assert(
    report.checks.some((c) => c.code === 'derived_financial_value'),
    'derived 4500',
  )
  assert(
    report.checks.some((c) => c.code === 'multi_location_slot'),
    'multi location',
  )
  assert(
    report.checks.some((c) => c.code === 'payment_numbering_inconsistent'),
    'payment numbering',
  )
  assert(
    report.checks.some(
      (c) => c.code === 'bindings_valid' && c.status === 'ok',
    ),
    'bindings ok',
  )
  assert(
    report.checks.some((c) => c.code === 'package_mode' && c.status === 'ok'),
    'package mode',
  )
})

run('assignment persists healthReport on result type', () => {
  const src = readFileSync(
    resolve('src/features/documents/template/packageContractAssignment.ts'),
    'utf8',
  )
  assert(src.includes('buildPackageContractHealthReport'), 'wired')
  assert(src.includes('packageContractHealthReport'), 'meta field')
  assert(src.includes('healthReport'), 'result field')
})

run('UI renders health checklist', () => {
  const src = readFileSync(
    resolve('src/features/studio/PackageContractSection.tsx'),
    'utf8',
  )
  assert(src.includes('PackageHealthSummary'), 'health summary')
  assert(src.includes('packageHealthRecommendations'), 'recommendations')
  const summary = readFileSync(
    resolve(
      'src/features/documents/contract-experience/PackageHealthSummary.tsx',
    ),
    'utf8',
  )
  assert(summary.includes('Rekomendacje'), 'recs label')
  assert(summary.includes('Umowa gotowa'), 'ready headline')
})

console.log('\nPackage contract health audit tests finished.')
