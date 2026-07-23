/**
 * Canonical variable IDs for AI semantic extraction.
 * Labels live in SystemVariableRegistry — AI returns IDs only.
 */

import {
  getPackageVariableDef,
  isPackageVariableId,
  packageVariablePolishLabel,
} from '@/features/documents/registry/packageVariables'
import {
  getVariableDef,
  isKnownVariableKey,
  registryDisplayLabel,
} from '@/features/documents/registry/variableRegistry'
import { SystemVariableRegistry } from '@/lib/variables/registry'

/** Couple + company presence IDs → legacy dotted registry key. */
export const CANONICAL_ID_TO_REGISTRY_KEY: Record<string, string> =
  SystemVariableRegistry.canonicalToLegacyMap()

export const CANONICAL_VARIABLE_IDS: string[] = [
  ...new Set([
    ...Object.keys(CANONICAL_ID_TO_REGISTRY_KEY),
    ...SystemVariableRegistry.listForAi().map((v) => v.id),
  ]),
].sort()

/** @deprecated Use PACKAGE_VARIABLE_IDS — kept for import compat. */
export const CANONICAL_DEFAULT_IDS: string[] = []

export function normalizeCanonicalId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function resolveToRegistryKey(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const canonical = normalizeCanonicalId(trimmed)

  // Couple package selector only
  if (canonical === 'package') {
    return 'package.name'
  }

  // All other package business IDs → packageVariables (not couple/studio fields)
  if (isPackageVariableId(canonical)) {
    return null
  }

  if (isKnownVariableKey(trimmed)) {
    if (isPackageFacingRegistryKey(trimmed)) return null
    return trimmed
  }

  const fromCanonical = CANONICAL_ID_TO_REGISTRY_KEY[canonical]
  if (fromCanonical && isKnownVariableKey(fromCanonical)) {
    return fromCanonical
  }

  const system = SystemVariableRegistry.get(trimmed)
  if (system?.legacyKey && !isPackageFacingRegistryKey(system.legacyKey)) {
    if (system.category === 'package' && system.id !== 'package_name') {
      return null
    }
    return system.legacyKey
  }

  const dotted = trimmed.replace(/_/g, '.')
  if (isKnownVariableKey(dotted)) {
    if (isPackageFacingRegistryKey(dotted)) return null
    return dotted
  }

  return null
}

export function resolvePackageVariableId(raw: string): string | null {
  const canonical = normalizeCanonicalId(raw)
  const def = getPackageVariableDef(canonical)
  return def?.id ?? null
}

/** @deprecated Use resolvePackageVariableId */
export function resolveTemplateDefaultId(raw: string): string | null {
  return resolvePackageVariableId(raw)
}

export function registryPolishLabel(registryKey: string): string {
  if (registryKey.startsWith('package.') && registryKey !== 'package.name') {
    return packageVariablePolishLabel(registryKey)
  }
  return registryDisplayLabel(registryKey)
}

export function isCoupleFacingRegistryKey(registryKey: string): boolean {
  if (registryKey === 'package.name') return true
  const system = SystemVariableRegistry.get(registryKey)
  if (system) {
    if (system.id === 'package_name') return true
    if (
      system.category === 'company' ||
      system.category === 'package' ||
      system.category === 'crm'
    ) {
      return false
    }
    return system.questionnaireAvailable
  }
  const def = getVariableDef(registryKey)
  if (!def) return false
  if (def.section === 'studio' || def.section === 'template') return false
  if (def.section === 'package' || def.section === 'payments') return false
  if (def.dataSource === 'studio' || def.dataSource === 'payments') return false
  if (def.dataSource === 'package_snapshot') return false
  if (def.dataSource === 'computed') return false
  if (def.dataSource === 'draft') return false
  return def.dataSource === 'wedding'
}

export function isStudioFacingRegistryKey(registryKey: string): boolean {
  if (registryKey === 'package.name') return false
  const system = SystemVariableRegistry.get(registryKey)
  if (system) return system.category === 'company' || system.source === 'company'
  const def = getVariableDef(registryKey)
  if (!def) return false
  return def.section === 'studio' || def.dataSource === 'studio'
}

/** Business rules from company packages — never questionnaire, never template values. */
export function isPackageFacingRegistryKey(registryKey: string): boolean {
  if (registryKey === 'package.name') return false
  if (getPackageVariableDef(registryKey)) {
    const system = SystemVariableRegistry.get(registryKey)
    if (system?.id === 'package_name') return false
    return true
  }
  const def = getVariableDef(registryKey)
  if (!def) return false
  return (
    def.section === 'package' &&
    def.dataSource === 'package_snapshot' &&
    registryKey !== 'package.name'
  )
}

/** @deprecated Use isPackageFacingRegistryKey */
export function isTemplateDefaultRegistryKey(registryKey: string): boolean {
  return isPackageFacingRegistryKey(registryKey)
}
