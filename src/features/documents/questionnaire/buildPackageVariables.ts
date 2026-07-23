/**
 * Build package variable presence list from AI (no values).
 */

import {
  getPackageVariableDef,
  PACKAGE_VARIABLE_DEFS_UNIQUE,
  packageVariablePolishLabel,
} from '@/features/documents/registry/packageVariables'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { PackageVariablePresence } from './types'

export function buildPackageVariablesFromAi(
  ai?: AiDocumentAnalysisResult | null,
): PackageVariablePresence[] {
  const ids = ai?.packageVariables ?? []
  const out: PackageVariablePresence[] = []
  const usedKeys = new Set<string>()

  for (const rawId of ids) {
    const def = getPackageVariableDef(rawId)
    if (!def) continue
    if (usedKeys.has(def.registryKey)) continue
    usedKeys.add(def.registryKey)

    out.push({
      id: def.id,
      registryKey: def.registryKey,
      label: def.labelPl,
      enabled: true,
      confidence: 0.9,
    })
  }

  return out
}

export function createEmptyPackageVariable(
  registryKey: string,
): PackageVariablePresence | null {
  const def = PACKAGE_VARIABLE_DEFS_UNIQUE.find(
    (d) => d.registryKey === registryKey,
  )
  if (!def) return null
  return {
    id: def.id,
    registryKey: def.registryKey,
    label: packageVariablePolishLabel(def.registryKey),
    enabled: true,
    confidence: 1,
  }
}

/** @deprecated */
export const buildTemplateDefaultsFromAi = buildPackageVariablesFromAi
/** @deprecated */
export const createEmptyTemplateDefault = createEmptyPackageVariable
