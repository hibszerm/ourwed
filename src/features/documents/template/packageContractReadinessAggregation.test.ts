/**
 * Package-contract readiness aggregation consistency.
 * Proves empty missing arrays cannot coexist with required_data_ready=critical
 * / kind=partial_recognition without an explicit blocker.
 *
 * Run: npm run test:package-contract-readiness-aggregation
 */

import { readFileSync } from 'node:fs'
import {
  buildPackageContractFinalReport,
  reconcilePackageContractPresentationFromPersisted,
  assertPackageContractFinalReportConsistency,
  type PackageContractFinalReport,
} from './packageContractFinalReport'
import {
  evaluatePackageContractRequiredDataReadiness,
  assertPackageContractRequiredDataConsistency,
} from './packageContractRequiredDataReadiness'
import { evaluatePackageContractReadiness } from './packageContractAllowlist'
import { evaluateClientPartyReadiness } from './clientPartyReadiness'
import { resolvePackageContractAttentionKind } from '../contract-experience/packageContractReadinessCopy'
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
  key: string,
  paragraphIndex: number,
  start: number,
  end: number,
  text: string,
): TemplateSlot {
  return {
    id: key,
    registryKey: key,
    label: key,
    enabled: true,
    physicallyBound: true,
    paragraphIndex,
    startOffset: start,
    endOffset: end,
    originalText: text,
    operation: 'replace',
    sourceHint: 'package',
    occurrences: 1,
  }
}

const COMPLETE_KEYS = [
  'bride_full_name',
  'contract_execution_date',
  'wedding_date',
  'contract_value_formatted',
]

function completeSlots(): TemplateSlot[] {
  return [
    slot('bride_full_name', 0, 0, 12, 'Anna Kowalska'),
    slot('contract_execution_date', 1, 0, 10, '01.01.2026'),
    slot('wedding_date', 2, 0, 10, '15.06.2026'),
    slot('contract_value_formatted', 3, 0, 8, '9000 zł'),
  ]
}

function requiredStatus(report: PackageContractFinalReport) {
  return report.checks.find((c) => c.code === 'required_data_ready')
}

run('1 — empty missing arrays → required_data_ready ok', () => {
  const report = buildPackageContractFinalReport({
    paragraphs: [
      { index: 0, text: 'Anna Kowalska' },
      { index: 1, text: '01.01.2026' },
      { index: 2, text: '15.06.2026' },
      { index: 3, text: '9000 zł' },
    ],
    slots: completeSlots(),
    allowedRegistryKeys: COMPLETE_KEYS,
  })
  assertEq(report.missingCategories.length, 0, 'no cats')
  assertEq(report.missingRegistryKeys.length, 0, 'no keys')
  assertEq(requiredStatus(report)?.status, 'ok', 'required ok')
  assertEq(report.kind, 'ready', 'kind ready')
})

run('2 — one missing category → critical + category visible', () => {
  const keys = COMPLETE_KEYS.filter((k) => k !== 'wedding_date')
  const report = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'x' }],
    slots: completeSlots().filter((s) => s.registryKey !== 'wedding_date'),
    allowedRegistryKeys: keys,
  })
  assert(report.missingCategories.includes('wedding_date'), 'wedding_date missing')
  assertEq(requiredStatus(report)?.status, 'critical', 'critical')
  assertEq(
    requiredStatus(report)?.evidence,
    'diagnostic:required_categories_incomplete',
    'evidence',
  )
  assertEq(report.kind, 'partial_recognition', 'partial')
})

run('3 — one missing registry capability → critical + capability visible', () => {
  const required = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys: [
      'contract_execution_date',
      'wedding_date',
      'contract_value_formatted',
    ],
  })
  assertPackageContractRequiredDataConsistency(required)
  assert(!required.ready, 'not ready')
  assert(required.missingCategories.includes('couple'), 'couple missing')
  assert(required.missingRegistryKeys.length > 0, 'keys visible')
})

run('4 — explicit blocking issue → critical + blocker visible', () => {
  const report = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'Hotel' }],
    slots: [
      ...completeSlots(),
      slot('ceremony_location', 4, 0, 5, 'Hotel'),
      slot('reception_location', 4, 0, 5, 'Hotel'),
    ],
    allowedRegistryKeys: [
      ...COMPLETE_KEYS,
      'ceremony_location',
      'reception_location',
    ],
    sharedSpanConflicts: [
      {
        paragraphIndex: 4,
        startOffset: 0,
        endOffset: 5,
        registryKeys: ['ceremony_location', 'reception_location'],
      },
    ],
  })
  assertEq(report.missingCategories.length, 0, 'cats empty')
  assert(report.blockingIssues.length > 0, 'blocker present')
  assertEq(
    report.blockingIssues[0]?.code,
    'shared_physical_span_conflict',
    'shared span',
  )
  assertEq(requiredStatus(report)?.status, 'critical', 'critical')
  assert(
    requiredStatus(report)?.evidence !==
      'diagnostic:required_categories_incomplete',
    'not category evidence',
  )
  assertEq(report.kind, 'partial_recognition', 'explained partial')
})

run('5 — all checks ok → kind ready', () => {
  const report = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'ok' }],
    slots: completeSlots(),
    allowedRegistryKeys: COMPLETE_KEYS,
  })
  assert(report.checks.every((c) => c.status === 'ok'), 'all ok')
  assertEq(report.kind, 'ready', 'ready')
})

run('6 — bindings valid + missing category → partial with explanation', () => {
  const report = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'x' }],
    slots: [slot('contract_value_formatted', 0, 0, 8, '9000 zł')],
    allowedRegistryKeys: ['contract_value_formatted'],
  })
  assertEq(
    report.checks.find((c) => c.code === 'bindings_valid')?.status,
    'ok',
    'bindings ok',
  )
  assert(report.missingCategories.length > 0, 'explained')
  assertEq(report.kind, 'partial_recognition', 'partial')
})

run('7 — no physical bindings → no_recognition', () => {
  const report = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'Stały tekst.' }],
    slots: [],
    allowedRegistryKeys: [],
  })
  assertEq(report.kind, 'no_recognition', 'no recognition')
  assertEq(
    report.checks.find((c) => c.code === 'bindings_valid')?.status,
    'critical',
    'bindings critical',
  )
})

run('8 — legacy persisted ready:false but live gaps empty → live wins', () => {
  const reconciled = reconcilePackageContractPresentationFromPersisted({
    missingCategories: [],
    missingRegistryKeys: [],
    persistedReady: false,
    sharedSpanConflicts: [],
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
        {
          id: 'package_mode',
          code: 'package_mode',
          status: 'ok',
          title: 'ok',
        },
        {
          id: 'quality_safe',
          code: 'quality_safe',
          status: 'ok',
          title: 'ok',
        },
        {
          id: 'immutable_preserved',
          code: 'immutable_preserved',
          status: 'ok',
          title: 'ok',
        },
      ],
    },
  })
  assertEq(reconciled.kind, 'ready', 'live ready')
  assertEq(reconciled.requiredData.ready, true, 'ready')
  assertEq(
    reconciled.checks.find((c) => c.code === 'required_data_ready')?.status,
    'ok',
    'patched ok',
  )
})

run('9 — stale missing category already repaired → not reused when arrays empty', () => {
  const reconciled = reconcilePackageContractPresentationFromPersisted({
    missingCategories: [],
    missingRegistryKeys: [],
    persistedReady: false,
    healthReport: null,
  })
  assertEq(reconciled.missingCategories.length, 0, 'empty')
  assertEq(reconciled.requiredData.ready, true, 'ready')
})

run('10 — CURRENT IMPOSSIBLE STATE cannot be produced by final builder', () => {
  // Reproduce the contradictory production JSON inputs: empty gaps + readiness false
  // via shared-span path (the real duplicate-source bug) OR prove reconcile repairs
  // the stale health snapshot the user saw in DEV diagnostics.
  const repaired = reconcilePackageContractPresentationFromPersisted({
    missingCategories: [],
    missingRegistryKeys: [],
    persistedReady: false,
    healthReport: {
      generatedAt: new Date().toISOString(),
      warningCount: 0,
      criticalCount: 1,
      generationAllowed: false,
      checks: [
        { id: 'bindings_valid', code: 'bindings_valid', status: 'ok', title: 'ok' },
        {
          id: 'required_data_ready',
          code: 'required_data_ready',
          status: 'critical',
          title: 'x',
          evidence: 'diagnostic:required_categories_incomplete',
        },
        { id: 'package_mode', code: 'package_mode', status: 'ok', title: 'ok' },
        { id: 'quality_safe', code: 'quality_safe', status: 'ok', title: 'ok' },
        {
          id: 'immutable_preserved',
          code: 'immutable_preserved',
          status: 'ok',
          title: 'ok',
        },
      ],
    },
  })

  const contradictory =
    repaired.kind === 'partial_recognition' &&
    repaired.missingCategories.length === 0 &&
    repaired.missingRegistryKeys.length === 0 &&
    repaired.blockingIssues.length === 0 &&
    repaired.checks.find((c) => c.code === 'required_data_ready')?.status ===
      'critical'

  assert(!contradictory, 'impossible hybrid must not survive reconcile')
  assertEq(repaired.kind, 'ready', 'option A ready')
  assertEq(
    repaired.checks.find((c) => c.code === 'required_data_ready')?.status,
    'ok',
    'required ok',
  )

  // Shared-span path: empty categories but explained critical
  const withBlocker = buildPackageContractFinalReport({
    paragraphs: [{ index: 0, text: 'x' }],
    slots: completeSlots(),
    allowedRegistryKeys: COMPLETE_KEYS,
    sharedSpanConflicts: [
      {
        paragraphIndex: 0,
        startOffset: 0,
        endOffset: 1,
        registryKeys: ['a', 'b'],
      },
    ],
  })
  assertPackageContractFinalReportConsistency(withBlocker)
  assert(
    !(
      withBlocker.missingCategories.length === 0 &&
      withBlocker.blockingIssues.length === 0 &&
      requiredStatus(withBlocker)?.status === 'critical'
    ),
    'critical always explained',
  )
})

run('11 — one-person masculine fixture keys → ready', () => {
  const keys = [
    'groom_full_name',
    'contract_execution_date',
    'wedding_date',
    'contract_value_formatted',
  ]
  const r = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys: keys,
  })
  assertPackageContractRequiredDataConsistency(r)
  assert(r.ready, 'masculine ready')
  assert(r.clientParty.ready, 'client party')
})

run('12 — one-person feminine fixture keys → ready', () => {
  const keys = [
    'bride_full_name',
    'contract_execution_date',
    'wedding_date',
    'contract_value_formatted',
  ]
  const r = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys: keys,
  })
  assertPackageContractRequiredDataConsistency(r)
  assert(r.ready, 'feminine ready')
})

run('13 — provider-only → incomplete with visible client-party identity', () => {
  const keys = [
    'studio_name',
    'contract_execution_date',
    'wedding_date',
    'contract_value_formatted',
  ]
  // studio_name is not an allowlisted client identity — couple missing
  const r = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys: keys.filter((k) => k !== 'studio_name'),
  })
  assert(!r.ready, 'not ready')
  assert(r.missingCategories.includes('couple'), 'couple visible')
  assert(r.missingRegistryKeys.length > 0, 'capability visible')
  const party = evaluateClientPartyReadiness({ boundRegistryKeys: [] })
  assert(!party.ready, 'client party incomplete')
})

run('attention kind never defaults unexplained partial when all ok', () => {
  const kind = resolvePackageContractAttentionKind({
    healthReport: {
      generatedAt: new Date().toISOString(),
      warningCount: 0,
      criticalCount: 0,
      generationAllowed: true,
      checks: [
        { id: 'bindings_valid', code: 'bindings_valid', status: 'ok', title: 'ok' },
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
    blockingIssues: [],
  })
  assertEq(kind, 'ready', 'ready when all ok')
})

run('assignment wires canonical final report', () => {
  const src = readFileSync(
    'src/features/documents/template/packageContractAssignment.ts',
    'utf8',
  )
  assert(src.includes('buildPackageContractFinalReport'), 'uses final report')
  assert(
    !/ready:\s*false,\s*userMessage:/.test(src),
    'no silent ready:false mutation without blockers',
  )
})

run('base readiness alone never emits contradictory hybrid via final report', () => {
  // Old bug: evaluatePackageContractReadiness ready + sharedSpan forced ready:false
  // without updating missing arrays, then health used readinessReady only.
  const base = evaluatePackageContractReadiness({
    allowedRegistryKeys: COMPLETE_KEYS,
  })
  assert(base.ready, 'base ready')
  const required = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys: COMPLETE_KEYS,
    sharedSpanConflicts: [
      {
        paragraphIndex: 0,
        startOffset: 0,
        endOffset: 1,
        registryKeys: ['x', 'y'],
      },
    ],
  })
  assert(!required.ready, 'blocked')
  assert(required.blockingIssues.length > 0, 'visible blocker')
  assertEq(required.missingCategories.length, 0, 'cats still empty')
})

console.log('\nPackage contract readiness aggregation tests finished.')
