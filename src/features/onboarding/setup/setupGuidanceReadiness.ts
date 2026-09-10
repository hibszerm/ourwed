import type { PackageSetupSignal } from '@/lib/api/packageService'

export type SetupPackageRowState = 'actionable' | 'started' | 'ready'

export type SetupTemplateRowState =
  | 'depends_on_package'
  | 'actionable'
  | 'ready'

export type SetupCompanyRowState = 'optional_cta' | 'quiet_ready'

/**
 * Presentation-only Guide activation stage (no DB checklist).
 * Core boolean remains `isSetupCoreReady` / `isGuidePreparationComplete`.
 */
export type GuideActivationStage =
  | 'not_started'
  | 'package_without_template'
  | 'core_ready'

export type SetupGuidanceDerivedState = {
  packageCount: number
  packagesWithTemplateCount: number
  isCoreReady: boolean
  activationStage: GuideActivationStage
  packageRow: SetupPackageRowState
  templateRow: SetupTemplateRowState
  companyRow: SetupCompanyRowState
}

/**
 * V1 CORE READY proxy:
 * ≥1 package AND ≥1 package with activeContractTemplateId.
 * Studio/company is intentionally excluded.
 * Template linkage ≠ full allowlist/analysis readiness.
 */
export function isSetupCoreReady(
  packages: ReadonlyArray<Pick<PackageSetupSignal, 'activeContractTemplateId'>>,
): boolean {
  if (packages.length === 0) return false
  return packages.some((pkg) => Boolean(pkg.activeContractTemplateId))
}

/**
 * Guide V3.2 “Przygotuj OurWed” core complete — same truth as `isCoreReady`
 * from `deriveSetupGuidanceState`. Company remains optional and does not gate.
 */
export function isGuidePreparationComplete(
  packages: ReadonlyArray<Pick<PackageSetupSignal, 'activeContractTemplateId'>>,
): boolean {
  return isSetupCoreReady(packages)
}

/**
 * Lightweight studio signal: company name present.
 * Not a full profile-complete model — only quiet confirmation for optional setup.
 */
export function hasMeaningfulCompanyName(
  companyName: string | null | undefined,
): boolean {
  return Boolean(companyName?.trim())
}

/**
 * Presentation stage for package → template activation.
 * Does not replace `isSetupCoreReady` (sidebar sweep / core boolean).
 */
export function deriveGuideActivationStage(
  packages: ReadonlyArray<Pick<PackageSetupSignal, 'activeContractTemplateId'>>,
): GuideActivationStage {
  if (packages.length === 0) return 'not_started'
  if (isSetupCoreReady(packages)) return 'core_ready'
  return 'package_without_template'
}

/**
 * Domain-derived setup row states for Guide preparation (and shared consumers).
 * Does not encode Dashboard visibility or education dismissal.
 */
export function deriveSetupGuidanceState(input: {
  packages: ReadonlyArray<PackageSetupSignal>
  companyName?: string | null
}): SetupGuidanceDerivedState {
  const packageCount = input.packages.length
  const packagesWithTemplateCount = input.packages.filter((pkg) =>
    Boolean(pkg.activeContractTemplateId),
  ).length
  const isCoreReady = isSetupCoreReady(input.packages)
  const activationStage = deriveGuideActivationStage(input.packages)

  let packageRow: SetupPackageRowState = 'actionable'
  if (isCoreReady) packageRow = 'ready'
  else if (packageCount > 0) packageRow = 'started'

  let templateRow: SetupTemplateRowState
  if (packageCount === 0) templateRow = 'depends_on_package'
  else if (packagesWithTemplateCount === 0) templateRow = 'actionable'
  else templateRow = 'ready'

  const companyRow: SetupCompanyRowState = hasMeaningfulCompanyName(
    input.companyName,
  )
    ? 'quiet_ready'
    : 'optional_cta'

  return {
    packageCount,
    packagesWithTemplateCount,
    isCoreReady,
    activationStage,
    packageRow,
    templateRow,
    companyRow,
  }
}

export function studioPackagesSetupSignalsQueryKey(
  userId: string | undefined,
) {
  return ['studio-packages', userId, 'setup-signals'] as const
}
