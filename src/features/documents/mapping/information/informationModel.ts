/**
 * User-facing information model for Template Import.
 * Maps registry / AI detections to semantic groups and data sources.
 * Registry keys stay internal — never shown in normal UX.
 */

import {
  getVariableDef,
  DOCUMENT_VARIABLE_SECTIONS,
  DOCUMENT_VARIABLES,
} from '@/features/documents/registry/variableRegistry'
import type { DocumentVariableDataSource } from '@/types/documents'
import type { DetectedField } from '../types'

export type InfoUxGroupId =
  | 'wedding'
  | 'people'
  | 'financial'
  | 'studio'
  | 'legal'
  | 'other'

export type InfoDataSourceKind =
  | 'questionnaire'
  | 'crm'
  | 'studio'
  | 'system'
  | 'manual'
  | 'unconnected'

export const INFO_UX_GROUPS: { id: InfoUxGroupId; label: string }[] = [
  { id: 'wedding', label: 'Ślub' },
  { id: 'people', label: 'Osoby' },
  { id: 'financial', label: 'Finanse' },
  { id: 'studio', label: 'Studio' },
  { id: 'legal', label: 'Zapisy prawne' },
  { id: 'other', label: 'Inne' },
]

export const INFO_DATA_SOURCE_LABELS: Record<InfoDataSourceKind, string> = {
  questionnaire: 'Ankieta pary',
  crm: 'CRM',
  studio: 'Ustawienia studia',
  system: 'System',
  manual: 'Ręcznie',
  unconnected: 'Niepołączone',
}

export function dataSourceKindFromRegistry(
  dataSource: DocumentVariableDataSource | undefined,
): InfoDataSourceKind {
  if (!dataSource) return 'unconnected'
  switch (dataSource) {
    case 'wedding':
      return 'questionnaire'
    case 'package_snapshot':
    case 'payments':
      return 'crm'
    case 'studio':
      return 'studio'
    case 'computed':
      return 'system'
    case 'draft':
      return 'manual'
    default:
      return 'unconnected'
  }
}

export function infoGroupForField(field: DetectedField): InfoUxGroupId {
  const text = `${field.label} ${field.rawToken ?? ''}`.toLowerCase()
  if (
    /rodo|gdpr|zgoda|publik|wizerunk|dane osobow|privacy|consent|klauzul/.test(
      text,
    )
  ) {
    return 'legal'
  }

  const key = field.mappedKey ?? field.suggestedKey
  const def = key ? getVariableDef(key) : undefined
  if (!def) return 'other'
  switch (def.section) {
    case 'wedding':
    case 'locations':
      return 'wedding'
    case 'bride':
    case 'groom':
      return 'people'
    case 'package':
    case 'payments':
      return 'financial'
    case 'studio':
      return 'studio'
    case 'additional':
      return 'other'
    default:
      return 'other'
  }
}

/** Human title — never a registry key. */
export function informationTitle(field: DetectedField): string {
  const key = field.mappedKey ?? field.suggestedKey
  const def = key ? getVariableDef(key) : undefined
  if (field.label?.trim() && !field.label.includes('.')) {
    return field.label.trim()
  }
  if (def) {
    const section = DOCUMENT_VARIABLE_SECTIONS.find((s) => s.id === def.section)
    if (
      (def.section === 'bride' || def.section === 'groom') &&
      def.labelPl.length < 12
    ) {
      return `${section?.label ?? ''}: ${def.labelPl}`.replace(/^:\s*/, '')
    }
    return def.labelPl
  }
  return field.label?.trim() || 'Informacja z kontraktu'
}

export function informationDataSource(field: DetectedField): InfoDataSourceKind {
  const key = field.mappedKey ?? field.suggestedKey
  if (!key) return 'unconnected'
  const def = getVariableDef(key)
  return dataSourceKindFromRegistry(def?.dataSource)
}

export function groupFieldsForReview(
  fields: DetectedField[],
): { id: InfoUxGroupId; label: string; fields: DetectedField[] }[] {
  const buckets = new Map<InfoUxGroupId, DetectedField[]>()
  for (const g of INFO_UX_GROUPS) buckets.set(g.id, [])

  for (const field of fields) {
    if (field.status === 'ignored') continue
    const id = infoGroupForField(field)
    buckets.get(id)!.push(field)
  }

  return INFO_UX_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    fields: buckets.get(g.id) ?? [],
  })).filter((g) => g.fields.length > 0)
}

/** Options for connecting information — labels only (keys internal). */
export function informationConnectionOptions(): {
  groupLabel: string
  options: { key: string; label: string; source: InfoDataSourceKind }[]
}[] {
  return DOCUMENT_VARIABLE_SECTIONS.map((section) => {
    const options = DOCUMENT_VARIABLES.filter((v) => v.section === section.id).map(
      (v) => ({
        key: v.key,
        label: v.labelPl,
        source: dataSourceKindFromRegistry(v.dataSource),
      }),
    )
    return { groupLabel: section.label, options }
  }).filter((g) => g.options.length > 0)
}
