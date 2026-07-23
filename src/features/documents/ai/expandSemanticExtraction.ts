/**
 * Expand compact AI extraction → AiDocumentAnalysisResult.
 * Package slots are presence-only (no values from contract text).
 */

import { DOCUMENT_AI_CONFIG } from './config'
import {
  registryPolishLabel,
  resolvePackageVariableId,
  resolveToRegistryKey,
} from './canonicalVariableIds'
import { matchLabelToRegistryKey } from './matchVariableLabel'
import {
  getPackageVariableDef,
} from '@/features/documents/registry/packageVariables'
import type {
  AiDocumentAnalysisResult,
  DetectedDocumentField,
} from './types'

export interface SemanticExtractionPayload {
  contractName: string
  packageSuggestion: string | null
  coupleVariables?: string[]
  studioVariables?: string[]
  packageVariables?: string[]
  possibleVariables?: string[]
  /** @deprecated legacy */
  variables?: string[]
  /** @deprecated never store values — ignored */
  templateDefaults?: Array<{ id: string; value?: string }>
  defaults?: Array<{ id: string; value?: string }>
  schemaVersion?: string
  promptVersion?: string
  model?: string
  analyzerId?: string
  analyzerVersion?: string
  analyzedAt?: string
}

export function isSemanticExtractionPayload(
  raw: unknown,
): raw is SemanticExtractionPayload {
  if (!raw || typeof raw !== 'object') return false
  const obj = raw as Record<string, unknown>
  return (
    Array.isArray(obj.coupleVariables) ||
    Array.isArray(obj.studioVariables) ||
    Array.isArray(obj.packageVariables) ||
    Array.isArray(obj.variables) ||
    Array.isArray(obj.possibleVariables) ||
    Array.isArray(obj.templateDefaults) ||
    Array.isArray(obj.defaults)
  )
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
  }
  return out
}

function resolvePresenceId(raw: string): string | null {
  return resolveToRegistryKey(raw) ?? matchLabelToRegistryKey(raw)
}

function fieldFromCanonicalId(
  rawId: string,
  index: number,
  confidence: number,
  usedRegistry: Set<string>,
): DetectedDocumentField | null {
  const registryKey = resolvePresenceId(rawId)
  if (!registryKey) return null
  if (usedRegistry.has(registryKey)) return null
  usedRegistry.add(registryKey)

  return {
    id: `ai-var-${index + 1}`,
    label: registryPolishLabel(registryKey),
    registryKey,
    value: null,
    confidence,
    paragraphIndex: null,
    status: 'suggested',
  }
}

/** Keep unknown changing concepts as unmapped suggestions (do not drop). */
function fieldFromUnknownPossible(
  rawId: string,
  index: number,
): DetectedDocumentField {
  const cleaned = rawId.trim().replace(/_+/g, ' ')
  const label =
    cleaned.length > 0
      ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
      : 'Sugerowane pole'

  return {
    id: `ai-possible-${index + 1}`,
    label,
    registryKey: null,
    value: null,
    confidence: 0.45,
    paragraphIndex: null,
    status: 'suggested',
  }
}

/**
 * Presence-only package IDs from AI (string[]) or legacy templateDefaults
 * (id only — values discarded).
 */
function collectPackageIds(obj: Record<string, unknown>): string[] {
  const fromList = asIdList(obj.packageVariables)
  const legacy = Array.isArray(obj.templateDefaults)
    ? obj.templateDefaults
    : Array.isArray(obj.defaults)
      ? obj.defaults
      : []

  const out: string[] = [...fromList]
  const seen = new Set(fromList.map((id) => id.toLowerCase()))

  for (const item of legacy) {
    if (typeof item === 'string') {
      const id = resolvePackageVariableId(item)
      if (id && !seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
      continue
    }
    if (!item || typeof item !== 'object') continue
    const rawId = (item as { id?: string }).id
    if (typeof rawId !== 'string') continue
    const id = resolvePackageVariableId(rawId)
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }

  return out.filter((id) => Boolean(getPackageVariableDef(id)))
}

function collectPresenceIds(obj: Record<string, unknown>): {
  confirmed: string[]
  possible: string[]
} {
  const couple = asIdList(obj.coupleVariables)
  const studio = asIdList(obj.studioVariables)
  let confirmed = [...couple, ...studio]

  if (confirmed.length === 0) {
    confirmed = asIdList(obj.variables)
  }

  const confirmedSet = new Set(confirmed.map((id) => id.toLowerCase()))
  const possible = asIdList(obj.possibleVariables).filter(
    (id) => !confirmedSet.has(id.toLowerCase()),
  )

  return { confirmed, possible }
}

export function expandSemanticExtraction(
  raw: unknown,
  meta: {
    sourceTextLength: number
    contentHash?: string
    fromCache?: boolean
  },
): AiDocumentAnalysisResult {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const { confirmed, possible } = collectPresenceIds(obj)
  const packageVariableIds = collectPackageIds(obj)

  const usedRegistry = new Set<string>()
  const fields: DetectedDocumentField[] = []

  confirmed.forEach((id, i) => {
    const field = fieldFromCanonicalId(id, i, 0.92, usedRegistry)
    if (field) fields.push(field)
  })
  possible.forEach((id, i) => {
    // Registry-mapped possibles are real discoveries — high enough to stay enabled in review.
    const field = fieldFromCanonicalId(
      id,
      confirmed.length + i,
      0.88,
      usedRegistry,
    )
    if (field) {
      fields.push(field)
      return
    }
    // Unknown changing info — preserve for review (registryKey null).
    fields.push(fieldFromUnknownPossible(id, confirmed.length + i))
  })

  const contractName =
    typeof obj.contractName === 'string' && obj.contractName.trim()
      ? obj.contractName.trim()
      : 'contract'

  const packageSuggestion =
    typeof obj.packageSuggestion === 'string' && obj.packageSuggestion.trim()
      ? obj.packageSuggestion.trim()
      : obj.packageSuggestion === null
        ? null
        : undefined

  const overallConfidence =
    fields.length === 0 && packageVariableIds.length === 0
      ? 0.4
      : fields.length === 0
        ? 0.75
        : fields.reduce((s, f) => s + f.confidence, 0) / fields.length

  return {
    schemaVersion:
      typeof obj.schemaVersion === 'string'
        ? obj.schemaVersion
        : DOCUMENT_AI_CONFIG.schemaVersion,
    model:
      typeof obj.model === 'string' ? obj.model : DOCUMENT_AI_CONFIG.model,
    promptVersion:
      typeof obj.promptVersion === 'string'
        ? obj.promptVersion
        : DOCUMENT_AI_CONFIG.promptVersion,
    analyzerId:
      typeof obj.analyzerId === 'string'
        ? obj.analyzerId
        : DOCUMENT_AI_CONFIG.analyzerId,
    analyzerVersion:
      typeof obj.analyzerVersion === 'string'
        ? obj.analyzerVersion
        : DOCUMENT_AI_CONFIG.analyzerVersion,
    documentType: contractName,
    packageSuggestion: packageSuggestion ?? null,
    /** Presence-only package ids — never values. */
    packageVariables: packageVariableIds,
    defaults: [],
    overallConfidence,
    fields,
    sections: [],
    clauses: [],
    warnings: [],
    analyzedAt:
      typeof obj.analyzedAt === 'string'
        ? obj.analyzedAt
        : new Date().toISOString(),
    sourceTextLength: meta.sourceTextLength,
    contentHash: meta.contentHash,
    fromCache: meta.fromCache,
  }
}
