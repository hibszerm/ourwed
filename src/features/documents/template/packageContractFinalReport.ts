/**
 * Single production entry that builds the package-contract final report.
 *
 * Derives missingCategories, missingRegistryKeys, required_data_ready, and
 * kind from one canonical required-data evaluation — never independently.
 */

import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import {
  buildPackageContractHealthReport,
  type PackageContractHealthReport,
  type PackageContractHealthCheck,
} from './packageContractHealthAudit'
import {
  assertPackageContractRequiredDataConsistency,
  evaluatePackageContractRequiredDataReadiness,
  type PackageContractBlockingIssue,
  type PackageContractRequiredDataReadiness,
  type SharedSpanConflictInput,
} from './packageContractRequiredDataReadiness'
import type { PackageContractUserCategory } from './packageContractAllowlist'
import { devErrorArgs, devInfoArgs } from '@/lib/debug/devConsole'

export type PackageContractReportKind =
  | 'ready'
  | 'partial_recognition'
  | 'no_recognition'
  | 'internal_inconsistency'

/**
 * ready — all checks ok; required data complete.
 * partial_recognition — supported bindings exist, but required capabilities missing.
 * no_recognition — no supported dynamic physical bindings.
 * internal_inconsistency — impossible combination; never show as calm partial.
 */
export type PackageContractFinalReport = {
  kind: PackageContractReportKind
  missingCategories: PackageContractUserCategory[]
  missingRegistryKeys: string[]
  blockingIssues: PackageContractBlockingIssue[]
  checks: PackageContractHealthCheck[]
  generationAllowed: boolean
  healthReport: PackageContractHealthReport
  requiredData: PackageContractRequiredDataReadiness
}

function physicalRegistryKeys(slots: TemplateSlot[]): string[] {
  return slots
    .filter((s) => s.registryKey && isSlotPhysicallyBound(s))
    .map((s) => s.registryKey!)
}

export function derivePackageContractReportKind(input: {
  hasPhysicalBindings: boolean
  requiredData: PackageContractRequiredDataReadiness
  healthReport: PackageContractHealthReport
}): PackageContractReportKind {
  const { hasPhysicalBindings, requiredData, healthReport } = input
  const requiredCheck = healthReport.checks.find(
    (c) => c.code === 'required_data_ready',
  )
  const gapCount =
    requiredData.missingCategories.length +
    requiredData.missingRegistryKeys.length +
    requiredData.blockingIssues.length

  const unexplainedCritical =
    requiredCheck?.status === 'critical' && gapCount === 0
  const unexplainedPartial =
    !requiredData.ready && gapCount === 0

  if (unexplainedCritical || unexplainedPartial) {
    return 'internal_inconsistency'
  }

  if (!hasPhysicalBindings) {
    return 'no_recognition'
  }

  if (!requiredData.ready || gapCount > 0) {
    return 'partial_recognition'
  }

  const hasCritical = healthReport.checks.some((c) => c.status === 'critical')
  if (hasCritical) {
    return 'partial_recognition'
  }

  return 'ready'
}

/**
 * Assert final-report invariants. Throws in DEV/tests; logs in production.
 */
export function assertPackageContractFinalReportConsistency(
  report: PackageContractFinalReport,
): void {
  const fail = (message: string) => {
    devErrorArgs('[package-contract-final-report-consistency]', {
      message,
      kind: report.kind,
      missingCategories: report.missingCategories,
      missingRegistryKeys: report.missingRegistryKeys,
      blockingIssues: report.blockingIssues.map((b) => b.code),
      checks: report.checks.map((c) => `${c.status}:${c.code}`),
    })
    const strict =
      import.meta.env?.DEV ||
      import.meta.env?.MODE === 'test' ||
      process.env.NODE_ENV !== 'production'
    if (strict) {
      throw new Error(`package-contract final report inconsistency: ${message}`)
    }
  }

  const required = report.checks.find((c) => c.code === 'required_data_ready')
  const gapCount =
    report.missingCategories.length +
    report.missingRegistryKeys.length +
    report.blockingIssues.length

  // INVARIANT A
  if (
    report.missingCategories.length === 0 &&
    report.missingRegistryKeys.length === 0 &&
    report.blockingIssues.length === 0 &&
    required?.status === 'critical'
  ) {
    fail('INVARIANT A: empty gaps but required_data_ready critical')
  }

  // INVARIANT B
  if (required?.status === 'critical' && gapCount === 0) {
    fail('INVARIANT B: required_data_ready critical without reported reason')
  }

  // INVARIANT C
  if (
    required?.evidence === 'diagnostic:required_categories_incomplete' &&
    report.missingCategories.length === 0
  ) {
    fail('INVARIANT C: required_categories_incomplete without missingCategories')
  }

  // INVARIANT D
  const allOk = report.checks.every((c) => c.status === 'ok')
  if (allOk && report.kind === 'partial_recognition') {
    fail('INVARIANT D: all checks ok but kind is partial_recognition')
  }

  // INVARIANT E
  if (report.kind === 'partial_recognition' && gapCount === 0) {
    const hasNonRequiredCritical = report.checks.some(
      (c) => c.code !== 'required_data_ready' && c.status === 'critical',
    )
    if (!hasNonRequiredCritical) {
      fail('INVARIANT E: partial_recognition without missing/blocking data')
    }
  }

  if (report.kind === 'ready' && report.checks.some((c) => c.status === 'critical')) {
    fail('kind ready with critical check')
  }

  if (
    report.missingCategories.length > 0 &&
    required?.status === 'ok'
  ) {
    fail('missingCategories non-empty while required_data_ready is ok')
  }
}

/**
 * Authoritative final report builder.
 */
export function buildPackageContractFinalReport(input: {
  paragraphs: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  sharedSpanConflicts?: readonly SharedSpanConflictInput[]
  /** When omitted, derived from physically bound slots. */
  allowedRegistryKeys?: string[]
}): PackageContractFinalReport {
  const allowedRegistryKeys =
    input.allowedRegistryKeys ?? physicalRegistryKeys(input.slots)
  const hasPhysicalBindings = allowedRegistryKeys.length > 0

  const requiredData = evaluatePackageContractRequiredDataReadiness({
    allowedRegistryKeys,
    sharedSpanConflicts: input.sharedSpanConflicts,
  })
  assertPackageContractRequiredDataConsistency(requiredData)

  const healthReport = buildPackageContractHealthReport({
    paragraphs: input.paragraphs,
    slots: input.slots,
    requiredData,
  })

  const kind = derivePackageContractReportKind({
    hasPhysicalBindings,
    requiredData,
    healthReport,
  })

  const report: PackageContractFinalReport = {
    kind,
    missingCategories: requiredData.missingCategories,
    missingRegistryKeys: requiredData.missingRegistryKeys,
    blockingIssues: requiredData.blockingIssues,
    checks: healthReport.checks,
    generationAllowed: healthReport.generationAllowed,
    healthReport,
    requiredData,
  }

  devInfoArgs('[package-contract-readiness-aggregation]', {
    sourceValues: {
      readinessReady: requiredData.ready,
      requiredCategoriesReady: requiredData.missingCategories.length === 0,
      clientPartyReady: requiredData.clientParty.ready,
      assignmentReady: requiredData.ready,
      legacyReadinessReady: undefined,
      mappingCompleted: undefined,
      missingCategories: report.missingCategories,
      missingRegistryKeys: report.missingRegistryKeys,
      blockingIssueCodes: report.blockingIssues.map((b) => b.code),
    },
    derivedValues: {
      finalKind: report.kind,
      requiredDataReadyStatus: report.checks.find(
        (c) => c.code === 'required_data_ready',
      )?.status,
      requiredDataReadyEvidence: report.checks.find(
        (c) => c.code === 'required_data_ready',
      )?.evidence,
    },
  })

  assertPackageContractFinalReportConsistency(report)
  return report
}

/**
 * Reconcile UI/presentation state from persisted meta without trusting stale
 * derived booleans. Durable facts: missing arrays + shared span conflicts.
 * Derived: ready, required_data_ready check, kind.
 */
export function reconcilePackageContractPresentationFromPersisted(input: {
  missingCategories?: readonly string[] | null
  missingRegistryKeys?: readonly string[] | null
  /** Stale derived flag — ignored when gaps can be evaluated. */
  persistedReady?: boolean | null
  sharedSpanConflicts?: readonly SharedSpanConflictInput[] | null
  /** Explicit blockers already persisted (preferred over reconstructing). */
  blockingIssues?: readonly PackageContractBlockingIssue[] | null
  healthReport: PackageContractHealthReport | null
  hasUploadError?: boolean
}): {
  kind: PackageContractReportKind
  missingCategories: PackageContractUserCategory[]
  missingRegistryKeys: string[]
  blockingIssues: PackageContractBlockingIssue[]
  checks: PackageContractHealthCheck[]
  generationAllowed: boolean
  healthReport: PackageContractHealthReport | null
  requiredData: {
    ready: boolean
    missingCategories: PackageContractUserCategory[]
    missingRegistryKeys: string[]
    blockingIssues: PackageContractBlockingIssue[]
    evidence: string[]
  }
} {
  const missingCategories = [
    ...((input.missingCategories ?? []) as PackageContractUserCategory[]),
  ]
  const missingRegistryKeys = [...(input.missingRegistryKeys ?? [])]
  const blockingIssues: PackageContractBlockingIssue[] = [
    ...(input.blockingIssues ?? []),
  ]
  if (
    blockingIssues.length === 0 &&
    (input.sharedSpanConflicts?.length ?? 0) > 0
  ) {
    blockingIssues.push({
      code: 'shared_physical_span_conflict',
      message:
        'Niektóre rozpoznane pola umowy nakładają się na siebie i nie mogą zostać bezpiecznie użyte do generowania dokumentu. Konflikt dotyczy danych klientów.',
      evidence: 'diagnostic:shared_physical_span_conflict',
    })
  }

  const evidence: string[] = []
  if (missingCategories.length > 0) {
    evidence.push('diagnostic:required_categories_incomplete')
  }
  for (const issue of blockingIssues) evidence.push(issue.evidence)

  const ready =
    missingCategories.length === 0 &&
    missingRegistryKeys.length === 0 &&
    blockingIssues.length === 0

  // Live canonical result wins over stale persistedReady:false.
  void input.persistedReady

  const requiredData = {
    ready,
    missingCategories,
    missingRegistryKeys,
    blockingIssues,
    evidence,
  }

  const bindingsCheck = input.healthReport?.checks.find(
    (c) => c.code === 'bindings_valid',
  )
  const hasPhysicalBindings =
    bindingsCheck?.evidence !== 'diagnostic:no_physical_allowlisted_bindings' &&
    bindingsCheck?.status !== 'critical'

  const patchedChecks: PackageContractHealthCheck[] = (
    input.healthReport?.checks ?? []
  ).map((c) => {
    if (c.code !== 'required_data_ready') return c
    if (ready) {
      return {
        id: 'required_data_ready',
        code: 'required_data_ready',
        status: 'ok',
        title: 'Wymagane dane kompletne',
      }
    }
    return {
      id: 'required_data_ready',
      code: 'required_data_ready',
      status: 'critical',
      title: 'Brakuje wymaganych danych',
      message:
        blockingIssues[0]?.message ??
        'Rozpoznaliśmy część dokumentu, ale brakuje informacji potrzebnych do automatycznego generowania.',
      evidence: evidence[0] ?? 'diagnostic:required_data_unspecified',
    }
  })

  if (!patchedChecks.some((c) => c.code === 'required_data_ready')) {
    patchedChecks.splice(1, 0, {
      id: 'required_data_ready',
      code: 'required_data_ready',
      status: ready ? 'ok' : 'critical',
      title: ready ? 'Wymagane dane kompletne' : 'Brakuje wymaganych danych',
      ...(ready
        ? {}
        : {
            message:
              blockingIssues[0]?.message ??
              'Rozpoznaliśmy część dokumentu, ale brakuje informacji potrzebnych do automatycznego generowania.',
            evidence: evidence[0] ?? 'diagnostic:required_data_unspecified',
          }),
    })
  }

  const criticalCount = patchedChecks.filter((c) => c.status === 'critical')
    .length
  const healthReport: PackageContractHealthReport | null = input.healthReport
    ? {
        ...input.healthReport,
        checks: patchedChecks,
        criticalCount,
        generationAllowed: criticalCount === 0,
      }
    : null

  const syntheticRequired: PackageContractRequiredDataReadiness = {
    ready,
    missingCategories,
    missingRegistryKeys,
    blockingIssues,
    evidence,
    clientParty: {
      ready: !missingCategories.includes('couple'),
      recognizedPersonCount: 0,
      persons: [],
      missingRequiredCapabilities: missingCategories.includes('couple')
        ? ['client_party_identity']
        : [],
      optionalMissingCapabilities: [],
      missingRegistryKeys: missingCategories.includes('couple')
        ? missingRegistryKeys
        : [],
      evidence: [],
    },
    userMessage: ready ? null : (blockingIssues[0]?.message ?? null),
  }

  const healthForKind =
    healthReport ?? {
      generatedAt: new Date().toISOString(),
      checks: patchedChecks,
      warningCount: 0,
      criticalCount,
      generationAllowed: criticalCount === 0,
    }

  const kind = derivePackageContractReportKind({
    hasPhysicalBindings:
      bindingsCheck == null
        ? ready ||
          missingCategories.length > 0 ||
          missingRegistryKeys.length > 0
        : Boolean(hasPhysicalBindings) || ready,
    requiredData: syntheticRequired,
    healthReport: healthForKind,
  })

  const coreOk = patchedChecks
    .filter(
      (c) => c.code === 'required_data_ready' || c.code === 'bindings_valid',
    )
    .every((c) => c.status === 'ok')
  const finalKind: PackageContractReportKind =
    ready && coreOk ? 'ready' : kind

  devInfoArgs('[package-contract-readiness-aggregation]', {
    sourceValues: {
      readinessReady: ready,
      requiredCategoriesReady: missingCategories.length === 0,
      clientPartyReady: syntheticRequired.clientParty.ready,
      assignmentReady: ready,
      legacyReadinessReady: input.persistedReady ?? undefined,
      mappingCompleted: undefined,
      missingCategories,
      missingRegistryKeys,
    },
    derivedValues: {
      finalKind,
      requiredDataReadyStatus: patchedChecks.find(
        (c) => c.code === 'required_data_ready',
      )?.status,
      requiredDataReadyEvidence: patchedChecks.find(
        (c) => c.code === 'required_data_ready',
      )?.evidence,
    },
    disagreed:
      input.persistedReady === false && ready
        ? ['legacyReadinessReady vs readinessReady']
        : [],
  })

  return {
    kind: finalKind,
    missingCategories,
    missingRegistryKeys,
    blockingIssues,
    checks: patchedChecks,
    generationAllowed: criticalCount === 0,
    healthReport,
    requiredData,
  }
}
