/**
 * Classifies detected contract fields into value sources.
 * Driven by Variable Registry + package / config heuristics.
 */

import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DocumentVariableDataSource } from '@/types/documents'
import type { DetectedField } from '@/features/documents/mapping/types'
import type {
  ClassifiedVariable,
  ContractValueSource,
  QuestionnaireDraftCounts,
} from './types'
import { looksLikePackageMention } from './packageDetection'

function sourceFromRegistryDataSource(
  dataSource: DocumentVariableDataSource,
  registryKey: string,
): ContractValueSource {
  if (registryKey === 'package.name' || dataSource === 'package_snapshot') {
    return 'ourwed_configuration'
  }
  switch (dataSource) {
    case 'wedding':
      return 'couple'
    case 'studio':
      return 'studio'
    case 'draft':
      return 'studio'
    case 'payments':
    case 'computed':
      return 'system'
    default:
      return 'system'
  }
}

function sourceFromLabelHeuristics(text: string): ContractValueSource | null {
  const t = text.toLowerCase()

  if (looksLikePackageMention(t)) {
    return 'ourwed_configuration'
  }

  if (
    /usług|addon|add-on|album|fotograf|wideograf|videograf|opcj|dodatk/.test(t) &&
    /wybran|konfigur|pakiet|ofert/.test(t)
  ) {
    return 'ourwed_configuration'
  }

  if (
    /bank|konto|nip|studio|cena|zadatek|zaliczk|pozostał|termin dostaw|copyright|prawa autorsk|godzin/.test(
      t,
    )
  ) {
    return 'studio'
  }

  if (/numer umowy|contract number|wygenerowan|systemow|id umowy/.test(t)) {
    return 'system'
  }

  if (
    /panna|pan młody|bride|groom|ślub|data|ceremon|przyjęc|przygotow|adres|telefon|email|e-mail|imię|nazwisko|uwag|notatk|zgoda|consent|rodo/.test(
      t,
    )
  ) {
    return 'couple'
  }

  return null
}

/**
 * Classify every non-ignored detected field.
 * Uses mappedKey → suggestedKey → label heuristics.
 */
export function classifyDetectedFields(
  fields: DetectedField[],
): ClassifiedVariable[] {
  const out: ClassifiedVariable[] = []

  for (const field of fields) {
    if (field.status === 'ignored') continue

    const registryKey = field.mappedKey ?? field.suggestedKey
    const def = registryKey ? getVariableDef(registryKey) : undefined
    const labelBlob = `${field.label} ${field.rawToken ?? ''}`

    let source: ContractValueSource
    if (def && registryKey) {
      source = sourceFromRegistryDataSource(def.dataSource, registryKey)
    } else {
      const heuristic = sourceFromLabelHeuristics(labelBlob)
      source = heuristic ?? 'couple'
    }

    // Package wording always wins over generic couple.
    if (looksLikePackageMention(labelBlob)) {
      source = 'ourwed_configuration'
    }

    out.push({
      fieldId: field.id,
      registryKey,
      label: field.label?.trim() || def?.labelPl || 'Informacja',
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
): QuestionnaireDraftCounts {
  const counts: QuestionnaireDraftCounts = {
    couple: 0,
    studio: 0,
    system: 0,
    ourwedConfiguration: 0,
  }
  for (const item of classification) {
    if (item.source === 'ourwed_configuration') counts.ourwedConfiguration += 1
    else counts[item.source] += 1
  }
  return counts
}
