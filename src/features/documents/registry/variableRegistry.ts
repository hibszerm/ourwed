/**
 * Document variable registry — thin adapter over SystemVariableRegistry.
 * Prefer importing from `@/lib/variables/registry` for new code.
 */

import { SystemVariableRegistry } from '@/lib/variables/registry'
import type {
  DocumentVariableDef,
  DocumentVariableSection,
} from '@/types/documents'

export const DOCUMENT_VARIABLE_SECTIONS: {
  id: DocumentVariableSection
  label: string
}[] = [
  { id: 'bride', label: 'Panna młoda' },
  { id: 'groom', label: 'Pan młody' },
  { id: 'wedding', label: 'Ślub' },
  { id: 'package', label: 'Pakiet' },
  { id: 'payments', label: 'Płatności' },
  { id: 'locations', label: 'Lokalizacje' },
  { id: 'studio', label: 'Firma' },
  { id: 'additional', label: 'Dodatkowe' },
  { id: 'template', label: 'Wartości z umowy' },
]

/** @deprecated Prefer SystemVariableRegistry — kept for document UI / templates. */
export const DOCUMENT_VARIABLES: DocumentVariableDef[] =
  SystemVariableRegistry.toDocumentVariableDefs()

const byKey = new Map(DOCUMENT_VARIABLES.map((v) => [v.key, v]))

export function getVariableDef(key: string): DocumentVariableDef | undefined {
  const direct = byKey.get(key)
  if (direct) return direct
  const system = SystemVariableRegistry.get(key)
  if (!system) return undefined
  return SystemVariableRegistry.toDocumentVariableDef(system) ?? undefined
}

export function variablesForSection(
  section: DocumentVariableSection,
): DocumentVariableDef[] {
  return DOCUMENT_VARIABLES.filter((v) => v.section === section)
}

export function isKnownVariableKey(key: string): boolean {
  return byKey.has(key) || SystemVariableRegistry.isKnown(key)
}

/** Polish UI label — System Variable Registry is the only source. */
export function registryDisplayLabel(key: string): string {
  return SystemVariableRegistry.label(key)
}
