/**
 * System Variable Registry — single source of truth for all platform variables.
 *
 * Developer flow to add a variable:
 * 1. Add an entry under registry/definitions/
 * 2. Implement / extend the matching provider (if values are dynamic)
 * Done.
 */

import { SYSTEM_VARIABLE_CATEGORIES } from '@/lib/variables/registry/categories'
import { COMPANY_VARIABLES } from '@/lib/variables/registry/definitions/company'
import { COUPLE_VARIABLES } from '@/lib/variables/registry/definitions/couple'
import { PACKAGE_VARIABLES } from '@/lib/variables/registry/definitions/package'
import { WEDDING_VARIABLES } from '@/lib/variables/registry/definitions/wedding'
import type {
  SystemVariableCategory,
  SystemVariableDef,
} from '@/lib/variables/registry/types'
import type {
  DocumentVariableDef,
  DocumentVariableSection,
  DocumentVariableValueType,
} from '@/types/documents'

const BUILTIN: SystemVariableDef[] = [
  ...COUPLE_VARIABLES,
  ...WEDDING_VARIABLES,
  ...PACKAGE_VARIABLES,
  ...COMPANY_VARIABLES,
]

function normalizeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function mapValueType(def: SystemVariableDef): DocumentVariableValueType {
  if (def.documentValueType) return def.documentValueType
  switch (def.type) {
    case 'date':
      return 'date'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'money':
      return 'money'
    default:
      return 'string'
  }
}

function createRegistry(seed: SystemVariableDef[]) {
  const byId = new Map<string, SystemVariableDef>()
  const byAlias = new Map<string, string>()

  function index(def: SystemVariableDef) {
    if (byId.has(def.id)) {
      throw new Error(`Duplicate system variable id: ${def.id}`)
    }
    byId.set(def.id, def)
    byAlias.set(def.id, def.id)
    byAlias.set(normalizeId(def.id), def.id)
    if (def.legacyKey) {
      byAlias.set(def.legacyKey, def.id)
      byAlias.set(normalizeId(def.legacyKey), def.id)
    }
    for (const alias of def.aliases ?? []) {
      byAlias.set(alias, def.id)
      byAlias.set(normalizeId(alias), def.id)
    }
  }

  for (const def of seed) index(def)

  function resolveId(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return (
      byAlias.get(trimmed) ??
      byAlias.get(normalizeId(trimmed)) ??
      null
    )
  }

  function get(idOrAlias: string): SystemVariableDef | undefined {
    const id = resolveId(idOrAlias)
    return id ? byId.get(id) : undefined
  }

  function all(): SystemVariableDef[] {
    return [...byId.values()].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
  }

  function listByCategory(category: SystemVariableCategory): SystemVariableDef[] {
    return all().filter((v) => v.category === category)
  }

  function listForDocument(): SystemVariableDef[] {
    return all().filter((v) => v.documentAvailable)
  }

  function listForQuestionnaire(): SystemVariableDef[] {
    return all().filter((v) => v.questionnaireAvailable)
  }

  function listForAi(): SystemVariableDef[] {
    return all().filter((v) => {
      if (v.aiAvailable === false) return false
      if (v.aiAvailable === true) return true
      return v.documentAvailable || v.questionnaireAvailable
    })
  }

  function listForCrm(): SystemVariableDef[] {
    return all().filter((v) => v.crmAvailable)
  }

  function listByProvider(
    provider: SystemVariableDef['defaultProvider'],
  ): SystemVariableDef[] {
    return all().filter((v) => v.defaultProvider === provider)
  }

  function label(idOrAlias: string): string {
    return get(idOrAlias)?.label ?? 'Informacja'
  }

  function isKnown(idOrAlias: string): boolean {
    return resolveId(idOrAlias) != null
  }

  /** All keys that should receive the same resolved value. */
  function valueKeys(def: SystemVariableDef): string[] {
    const keys = new Set<string>([def.id])
    if (def.legacyKey) keys.add(def.legacyKey)
    for (const a of def.aliases ?? []) keys.add(a)
    return [...keys]
  }

  function emit(
    out: Record<string, string>,
    idOrAlias: string,
    value: string | null | undefined,
  ) {
    const def = get(idOrAlias)
    const v = value?.trim()
    if (!def || !v) return
    for (const key of valueKeys(def)) out[key] = v
  }

  function toDocumentVariableDef(def: SystemVariableDef): DocumentVariableDef | null {
    if (!def.documentAvailable || !def.legacyKey) return null
    const section: DocumentVariableSection =
      def.documentSection ??
      (def.category === 'company'
        ? 'studio'
        : def.category === 'couple'
          ? def.id.startsWith('groom')
            ? 'groom'
            : 'bride'
          : def.category === 'package'
            ? 'package'
            : def.category === 'crm'
              ? 'payments'
              : 'additional')

    return {
      key: def.legacyKey,
      section,
      labelPl: def.label,
      labelEn: def.labelEn,
      valueType: mapValueType(def),
      dataSource:
        def.documentDataSource ??
        (def.source === 'company'
          ? 'studio'
          : def.source === 'package'
            ? 'package_snapshot'
            : def.source === 'crm'
              ? 'payments'
              : def.source === 'draft'
                ? 'draft'
                : def.source === 'computed'
                  ? 'computed'
                  : 'wedding'),
      description: def.description,
      isSystem: true,
      sortOrder: def.sortOrder ?? 0,
    }
  }

  function toDocumentVariableDefs(): DocumentVariableDef[] {
    return all()
      .map(toDocumentVariableDef)
      .filter((d): d is DocumentVariableDef => Boolean(d))
  }

  /** Canonical AI id → legacy dotted key (document storage). */
  function canonicalToLegacyMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const def of all()) {
      if (!def.legacyKey) continue
      map[def.id] = def.legacyKey
      for (const alias of def.aliases ?? []) {
        map[alias] = def.legacyKey
      }
    }
    return map
  }

  /** Package AI defs (compat with packageVariables.ts). */
  function toPackageVariableDefs(): Array<{
    id: string
    registryKey: string
    labelPl: string
  }> {
    const out: Array<{ id: string; registryKey: string; labelPl: string }> = []
    for (const def of listByCategory('package')) {
      if (!def.legacyKey) continue
      out.push({
        id: def.id,
        registryKey: def.legacyKey,
        labelPl: def.label,
      })
      for (const alias of def.aliases ?? []) {
        if (alias === 'package') continue // couple selector handled separately
        out.push({
          id: alias,
          registryKey: def.legacyKey,
          labelPl: def.label,
        })
      }
    }
    return out
  }

  function register(def: SystemVariableDef) {
    index(def)
  }

  return {
    categories: SYSTEM_VARIABLE_CATEGORIES,
    register,
    get,
    resolveId,
    isKnown,
    all,
    listByCategory,
    listForDocument,
    listForQuestionnaire,
    listForAi,
    listForCrm,
    listByProvider,
    label,
    valueKeys,
    emit,
    toDocumentVariableDef,
    toDocumentVariableDefs,
    canonicalToLegacyMap,
    toPackageVariableDefs,
  }
}

export const SystemVariableRegistry = createRegistry(BUILTIN)

export type SystemVariableRegistryApi = typeof SystemVariableRegistry
