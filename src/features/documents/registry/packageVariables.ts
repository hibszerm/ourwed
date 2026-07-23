/**
 * Package variables — thin adapter over SystemVariableRegistry.
 * Prefer SystemVariableRegistry for new code.
 */

import { SystemVariableRegistry } from '@/lib/variables/registry'

export interface PackageVariableDef {
  /** Canonical AI id */
  id: string
  /** Internal registry / merge key */
  registryKey: string
  labelPl: string
}

export const PACKAGE_VARIABLE_DEFS: PackageVariableDef[] =
  SystemVariableRegistry.toPackageVariableDefs()

/** Unique by registryKey for review add-lists. */
export const PACKAGE_VARIABLE_DEFS_UNIQUE: PackageVariableDef[] = [
  ...new Map(PACKAGE_VARIABLE_DEFS.map((d) => [d.registryKey, d])).values(),
]

const byId = new Map(PACKAGE_VARIABLE_DEFS.map((d) => [d.id, d]))
const byRegistry = new Map(
  PACKAGE_VARIABLE_DEFS.map((d) => [d.registryKey, d]),
)

export function getPackageVariableDef(
  idOrKey: string,
): PackageVariableDef | undefined {
  return byId.get(idOrKey) ?? byRegistry.get(idOrKey)
}

export function isPackageVariableId(id: string): boolean {
  return byId.has(id) || byRegistry.has(id)
}

export function packageVariablePolishLabel(idOrKey: string): string {
  return (
    getPackageVariableDef(idOrKey)?.labelPl ??
    SystemVariableRegistry.label(idOrKey)
  )
}

export const PACKAGE_VARIABLE_IDS: string[] = [
  ...new Set(PACKAGE_VARIABLE_DEFS.map((d) => d.id)),
].sort()
