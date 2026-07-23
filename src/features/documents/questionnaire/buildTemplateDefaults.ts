/**
 * Build TemplateDefaultValue[] from AI defaults + registry catalog.
 */

import {
  getTemplateDefaultDef,
  TEMPLATE_DEFAULT_DEFS_UNIQUE,
} from '@/features/documents/registry/templateDefaults'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { TemplateDefaultValue } from './types'

export function buildTemplateDefaultsFromAi(
  ai?: AiDocumentAnalysisResult | null,
): TemplateDefaultValue[] {
  const raw = ai?.defaults ?? []
  const out: TemplateDefaultValue[] = []
  const usedKeys = new Set<string>()

  for (const item of raw) {
    const def = getTemplateDefaultDef(item.id)
    if (!def) continue
    if (usedKeys.has(def.registryKey)) continue
    usedKeys.add(def.registryKey)

    const hasValue = item.value.trim().length > 0
    out.push({
      id: def.id,
      registryKey: def.registryKey,
      label: def.labelPl,
      value: item.value,
      enabled: true,
      valueType: def.valueType,
      placeholder: def.placeholder,
      unit: def.unit,
      confidence: hasValue ? 0.9 : 0.6,
    })
  }

  return out
}

export function createEmptyTemplateDefault(
  registryKey: string,
): TemplateDefaultValue | null {
  const def = TEMPLATE_DEFAULT_DEFS_UNIQUE.find(
    (d) => d.registryKey === registryKey,
  )
  if (!def) return null
  return {
    id: def.id,
    registryKey: def.registryKey,
    label: def.labelPl,
    value: '',
    enabled: true,
    valueType: def.valueType,
    placeholder: def.placeholder,
    unit: def.unit,
    confidence: 1,
  }
}
