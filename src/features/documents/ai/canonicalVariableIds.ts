/**
 * Canonical variable IDs for AI semantic extraction.
 * Package business slots are presence-only — values come from Studio Packages.
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

/** Couple + studio presence IDs → registry key. */
export const CANONICAL_ID_TO_REGISTRY_KEY: Record<string, string> = {
  bride_first_name: 'bride.firstName',
  bride_last_name: 'bride.lastName',
  bride_phone: 'bride.phone',
  bride_email: 'bride.email',
  bride_address: 'bride.address',
  bride_pesel: 'bride.pesel',
  pesel: 'bride.pesel',

  groom_first_name: 'groom.firstName',
  groom_last_name: 'groom.lastName',
  groom_phone: 'groom.phone',
  groom_email: 'groom.email',
  groom_address: 'groom.address',
  groom_pesel: 'groom.pesel',

  wedding_date: 'wedding.date',
  ceremony_time: 'wedding.ceremonyTime',
  couple_names: 'wedding.coupleNames',
  schedule: 'wedding.schedule',
  wedding_schedule: 'wedding.schedule',

  ceremony_location: 'location.ceremony',
  reception_location: 'location.reception',
  preparation_location: 'location.preparation',

  /** Couple chooses package in questionnaire — not a stored price. */
  package: 'package.name',

  company_name: 'studio.name',
  studio_name: 'studio.name',
  company_owner: 'studio.owner',
  owner: 'studio.owner',
  company_tax_id: 'studio.nip',
  company_nip: 'studio.nip',
  company_address: 'studio.address',
  studio_address: 'studio.address',
  company_email: 'studio.email',
  studio_email: 'studio.email',
  company_phone: 'studio.phone',
  studio_phone: 'studio.phone',
  company_website: 'studio.website',
  studio_website: 'studio.website',
  company_bank_account: 'studio.bankAccount',
  bank_account: 'studio.bankAccount',
  company_regon: 'studio.regon',
  company_vat: 'studio.vat',
  vat: 'studio.vat',
  photographer_name: 'studio.photographerName',
  studio_logo: 'studio.logo',
  company_logo: 'studio.logo',
  studio_signature: 'studio.signature',
  signature: 'studio.signature',

  contract_number: 'additional.contractNumber',
  contract_city: 'additional.city',
  additional_notes: 'additional.notes',
  notes: 'additional.notes',
}

export const CANONICAL_VARIABLE_IDS: string[] = [
  ...new Set(Object.keys(CANONICAL_ID_TO_REGISTRY_KEY)),
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
  const def = getVariableDef(registryKey)
  if (!def) return false
  return def.section === 'studio' || def.dataSource === 'studio'
}

/** Business rules from Studio Packages — never questionnaire, never template values. */
export function isPackageFacingRegistryKey(registryKey: string): boolean {
  if (registryKey === 'package.name') return false
  if (getPackageVariableDef(registryKey)) return true
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
