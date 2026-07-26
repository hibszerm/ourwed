/**
 * Pure package → contract resolution (no network / heavy imports).
 */

import type { StudioPackage } from '@/types/package'

export type PackageContractResolution =
  | {
      status: 'ok'
      packageId: string
      packageName: string
      templateId: string
      templateVersionId: string | null
    }
  | {
      status: 'missing_package'
      message: string
    }
  | {
      status: 'missing_contract'
      packageId: string
      packageName: string
      message: string
      packagePath: string
    }

/** Pure resolver — used by generation and tests (no network). */
export function resolvePackageContractFromPackage(input: {
  packageId: string | null | undefined
  pkg: Pick<
    StudioPackage,
    'id' | 'name' | 'activeContractTemplateId' | 'activeContractTemplateVersionId'
  > | null
}): PackageContractResolution {
  if (!input.packageId) {
    return {
      status: 'missing_package',
      message: 'Wybierz pakiet dla tego zlecenia, aby wygenerować umowę.',
    }
  }
  if (!input.pkg) {
    return {
      status: 'missing_package',
      message: 'Nie znaleziono pakietu przypisanego do zlecenia.',
    }
  }
  if (!input.pkg.activeContractTemplateId) {
    return {
      status: 'missing_contract',
      packageId: input.pkg.id,
      packageName: input.pkg.name,
      message: `Pakiet ${input.pkg.name} nie ma jeszcze przypisanej umowy.`,
      packagePath: '/studio/pakiety',
    }
  }
  return {
    status: 'ok',
    packageId: input.pkg.id,
    packageName: input.pkg.name,
    templateId: input.pkg.activeContractTemplateId,
    templateVersionId: input.pkg.activeContractTemplateVersionId,
  }
}
