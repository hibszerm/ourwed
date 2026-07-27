/**
 * Package contract readiness UX copy — presentation only.
 * Run: npm run test:package-contract-readiness-ux
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isTechnicalDiagnosticText,
  packageContractAttentionCopy,
  packageReadinessMissingProductLabels,
  resolvePackageContractAttentionKind,
} from './packageContractReadinessCopy'
import type { PackageContractHealthReport } from '@/features/documents/template/packageContractHealthAudit'

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

function health(
  evidence: string | undefined,
): PackageContractHealthReport {
  return {
    generatedAt: new Date().toISOString(),
    warningCount: 0,
    criticalCount: 1,
    generationAllowed: false,
    checks: [
      {
        id: 'bindings_valid',
        code: 'bindings_valid',
        status: 'critical',
        title: 'x',
        evidence,
      },
    ],
  }
}

run('A — bindings present + bride missing → Dane Panny Młodej', () => {
  const labels = packageReadinessMissingProductLabels({
    missingCategories: ['couple'],
    missingRegistryKeys: ['bride_full_name'],
  })
  assertEq(labels.length, 1, 'one label')
  assertEq(labels[0], 'Dane Panny Młodej', 'bride label')
  assert(!labels.includes('Dane pary'), 'not generic couple')
})

run('B — bindings present + wedding date missing → Data ślubu', () => {
  const labels = packageReadinessMissingProductLabels({
    missingCategories: ['wedding_date'],
  })
  assertEq(labels[0], 'Data ślubu', 'wedding date')
  const kind = resolvePackageContractAttentionKind({
    healthReport: {
      generatedAt: new Date().toISOString(),
      warningCount: 0,
      criticalCount: 1,
      generationAllowed: false,
      checks: [
        {
          id: 'bindings_valid',
          code: 'bindings_valid',
          status: 'ok',
          title: 'ok',
        },
        {
          id: 'required_data_ready',
          code: 'required_data_ready',
          status: 'critical',
          title: 'x',
          evidence: 'diagnostic:required_categories_incomplete',
        },
      ],
    },
    missingCategories: ['wedding_date'],
    missingRegistryKeys: ['wedding_date'],
  })
  assertEq(kind, 'partial_recognition', 'partial kind')
  const copy = packageContractAttentionCopy(kind)
  assert(copy.recognitionLine.includes('Rozpoznaliśmy część dokumentu'), 'recognition')
  assert(copy.title === 'Umowa wymaga uzupełnienia', 'title')
})

run('C — several categories missing → all exact labels', () => {
  const labels = packageReadinessMissingProductLabels({
    missingCategories: [
      'couple',
      'contract_date',
      'wedding_date',
      'contract_value',
    ],
  })
  assert(labels.includes('Dane strony zamawiającej'), 'couple')
  assert(labels.includes('Data zawarcia umowy'), 'contract date')
  assert(labels.includes('Data ślubu'), 'wedding date')
  assert(labels.includes('Wartość umowy'), 'value')
  assertEq(labels.length, 4, 'four labels')
})

run('D — zero bindings → different message', () => {
  const kind = resolvePackageContractAttentionKind({
    healthReport: health('diagnostic:no_physical_allowlisted_bindings'),
  })
  assertEq(kind, 'no_supported_fields', 'zero kind')
  const zero = packageContractAttentionCopy(kind)
  const partial = packageContractAttentionCopy('partial_recognition')
  assert(
    zero.recognitionLine !== partial.recognitionLine,
    'different recognition lines',
  )
  assert(
    zero.recognitionLine.includes('bezpiecznie uzupełniać'),
    'zero-binding copy',
  )
  assert(
    !partial.recognitionLine.includes('bezpiecznie uzupełniać'),
    'partial stays calm',
  )
})

run('D2 — required_data_ready incomplete → partial recognition', () => {
  const report = {
    generatedAt: new Date().toISOString(),
    warningCount: 0,
    criticalCount: 1,
    generationAllowed: false,
    checks: [
      {
        id: 'bindings_valid',
        code: 'bindings_valid' as const,
        status: 'ok' as const,
        title: 'ok',
      },
      {
        id: 'required_data_ready',
        code: 'required_data_ready' as const,
        status: 'critical' as const,
        title: 'x',
        evidence: 'diagnostic:required_categories_incomplete',
      },
    ],
  }
  const kind = resolvePackageContractAttentionKind({
    healthReport: report,
    missingCategories: ['couple'],
    missingRegistryKeys: ['client_party_identity'],
  })
  assertEq(kind, 'partial_recognition', 'partial when bindings ok')
})

run('E — no English technical text in product copy', () => {
  for (const kind of [
    'partial_recognition',
    'no_supported_fields',
    'upload_error',
    'ready',
    'internal_inconsistency',
  ] as const) {
    const copy = packageContractAttentionCopy(kind)
    const blob = Object.values(copy).join('\n')
    assert(!/allowlist|bindings|readiness|slot|semantic/i.test(blob), kind)
    assert(!blob.includes('No physical'), kind)
  }
})

run('E2 — all checks ok → attention kind ready (never unexplained partial)', () => {
  const kind = resolvePackageContractAttentionKind({
    healthReport: {
      generatedAt: new Date().toISOString(),
      warningCount: 0,
      criticalCount: 0,
      generationAllowed: true,
      checks: [
        {
          id: 'bindings_valid',
          code: 'bindings_valid',
          status: 'ok',
          title: 'ok',
        },
        {
          id: 'required_data_ready',
          code: 'required_data_ready',
          status: 'ok',
          title: 'ok',
        },
      ],
    },
    missingCategories: [],
    missingRegistryKeys: [],
  })
  assertEq(kind, 'ready', 'ready')
  const copy = packageContractAttentionCopy(kind)
  assert(
    copy.recognitionLine.includes('gotowa do automatycznego generowania'),
    'ready copy',
  )
})

run('E3 — critical required without gaps → internal_inconsistency', () => {
  const kind = resolvePackageContractAttentionKind({
    healthReport: {
      generatedAt: new Date().toISOString(),
      warningCount: 0,
      criticalCount: 1,
      generationAllowed: false,
      checks: [
        {
          id: 'bindings_valid',
          code: 'bindings_valid',
          status: 'ok',
          title: 'ok',
        },
        {
          id: 'required_data_ready',
          code: 'required_data_ready',
          status: 'critical',
          title: 'x',
          evidence: 'diagnostic:required_categories_incomplete',
        },
      ],
    },
    missingCategories: [],
    missingRegistryKeys: [],
    blockingIssues: [],
  })
  assertEq(kind, 'internal_inconsistency', 'inconsistency')
})

run('F — no evidence codes visible in product copy helpers', () => {
  const copy = packageContractAttentionCopy('partial_recognition')
  const blob = Object.values(copy).join('\n')
  assert(!blob.includes('diagnostic:'), 'no evidence codes')
  assert(
    isTechnicalDiagnosticText('diagnostic:no_physical_allowlisted_bindings'),
    'detector flags evidence',
  )
  assert(
    isTechnicalDiagnosticText('No physical allowlisted bindings were found.'),
    'detector flags English',
  )
  assert(
    !isTechnicalDiagnosticText('Rozpoznaliśmy część dokumentu.'),
    'product Polish ok',
  )
})

run('UI card wired with calm hierarchy', () => {
  const card = readFileSync(
    resolve(
      'src/features/documents/contract-experience/PackageContractAttentionCard.tsx',
    ),
    'utf8',
  )
  assert(card.includes('Umowa wymaga uzupełnienia') === false, 'title from copy helper')
  assert(card.includes('Brakuje rozpoznania') === false, 'section from copy helper')
  assert(card.includes('Pokaż szczegóły'), 'details toggle')
  assert(card.includes('import.meta.env.DEV'), 'dev diagnostics gated')
  assert(card.includes('packageContractAttentionCopy'), 'uses copy module')
  assert(card.includes('packageReadinessMissingProductLabels'), 'uses labels')

  const section = readFileSync(
    resolve('src/features/studio/PackageContractSection.tsx'),
    'utf8',
  )
  assert(section.includes('PackageContractAttentionCard'), 'section uses card')
  assert(!section.includes('Wymaga uwagi'), 'old eyebrow gone')
  assert(section.includes('Zmień umowę'), 'primary action')
})

run('exact field keys beat generic couple category', () => {
  const labels = packageReadinessMissingProductLabels({
    missingCategories: ['couple', 'wedding_date'],
    missingRegistryKeys: ['groom_full_name', 'wedding_date'],
  })
  assert(labels.includes('Dane Pana Młodego'), 'groom')
  assert(labels.includes('Data ślubu'), 'wedding')
  assert(!labels.includes('Dane pary'), 'generic couple suppressed')
})

console.log('\nPackage contract readiness UX copy tests finished.')
