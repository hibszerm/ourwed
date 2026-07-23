/**
 * Classifies detected contract fields into value sources.
 * Package business slots are never questionnaire fields.
 */

import {
  isCoupleFacingRegistryKey,
  isPackageFacingRegistryKey,
  isStudioFacingRegistryKey,
  registryPolishLabel,
} from '@/features/documents/ai/canonicalVariableIds'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DetectedField } from '@/features/documents/mapping/types'
import type {
  ClassifiedVariable,
  ContractValueSource,
  QuestionnaireDraftCounts,
} from './types'
import { looksLikePackageMention } from './packageDetection'

export function classifyDetectedFields(
  fields: DetectedField[],
): ClassifiedVariable[] {
  const out: ClassifiedVariable[] = []

  for (const field of fields) {
    if (field.status === 'ignored') continue

    const registryKey = field.mappedKey ?? field.suggestedKey
    if (!registryKey) continue

    // Package business slots handled via packageVariables array
    if (isPackageFacingRegistryKey(registryKey)) continue

    const def = getVariableDef(registryKey)
    if (!def) continue

    let source: ContractValueSource
    if (registryKey === 'package.name' || looksLikePackageMention(field.label)) {
      source = 'ourwed_configuration'
    } else if (isCoupleFacingRegistryKey(registryKey)) {
      source = 'couple'
    } else if (isStudioFacingRegistryKey(registryKey)) {
      source = 'studio'
    } else {
      source = 'system'
    }

    out.push({
      fieldId: field.id,
      registryKey,
      label: registryPolishLabel(registryKey),
      source,
      confidence:
        typeof field.confidenceScore === 'number'
          ? field.confidenceScore
          : field.confidence === 'high'
            ? 0.9
            : field.confidence === 'medium'
              ? 0.7
              : 0.5,
    })
  }

  return out
}

export function countBySource(
  classification: ClassifiedVariable[],
  packageVariableCount = 0,
): QuestionnaireDraftCounts {
  const counts: QuestionnaireDraftCounts = {
    couple: 0,
    studio: 0,
    system: 0,
    ourwedConfiguration: 0,
    packageVariables: packageVariableCount,
    templateDefaults: 0,
  }
  for (const item of classification) {
    if (item.source === 'ourwed_configuration') counts.ourwedConfiguration += 1
    else if (item.source === 'package') counts.packageVariables += 1
    else counts[item.source] += 1
  }
  return counts
}
