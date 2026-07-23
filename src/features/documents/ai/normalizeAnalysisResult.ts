/**
 * Normalize + harden Edge JSON into AiDocumentAnalysisResult.
 *
 * Supports:
 * - v2 semantic extraction `{ contractName, packageSuggestion, variables, possibleVariables }`
 * - legacy rich field payloads (still accepted for cache / older responses)
 */

import { isKnownVariableKey } from '@/features/documents/registry/variableRegistry'
import { aiDocumentAnalysisResultSchema } from './analysisSchema'
import { DOCUMENT_AI_CONFIG } from './config'
import {
  expandSemanticExtraction,
  isSemanticExtractionPayload,
} from './expandSemanticExtraction'
import type {
  AiDocumentAnalysisResult,
  DetectedDocumentClause,
  DetectedDocumentField,
  DetectedDocumentSection,
} from './types'

function clamp01(n: unknown, fallback = 0.5): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function normalizeField(
  raw: Record<string, unknown>,
  index: number,
  warnings: string[],
): DetectedDocumentField | null {
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `ai-field-${index + 1}`
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : 'Pole dynamiczne'

  let registryKey: string | null =
    typeof raw.registryKey === 'string' ? raw.registryKey.trim() : null
  if (registryKey === '') registryKey = null
  if (registryKey && !isKnownVariableKey(registryKey)) {
    warnings.push(`Odrzucono nieznany klucz rejestru: ${registryKey}`)
    registryKey = null
  }

  const value =
    typeof raw.value === 'string'
      ? raw.value
      : raw.value === null
        ? null
        : typeof raw.extractedValue === 'string'
          ? raw.extractedValue
          : null

  const paragraphIndex =
    typeof raw.paragraphIndex === 'number' && raw.paragraphIndex >= 0
      ? Math.floor(raw.paragraphIndex)
      : raw.location &&
          typeof (raw.location as { paragraphIndex?: number }).paragraphIndex ===
            'number'
        ? (raw.location as { paragraphIndex: number }).paragraphIndex
        : null

  const confidence = clamp01(raw.confidence, 0.7)

  return {
    id,
    label,
    registryKey,
    value,
    extractedValue: value ?? undefined,
    confidence,
    paragraphIndex,
    location:
      paragraphIndex != null || value
        ? {
            paragraphIndex: paragraphIndex ?? undefined,
            text: value ?? undefined,
          }
        : undefined,
    status: 'suggested',
  }
}

export function normalizeAnalysisPayload(
  raw: unknown,
  meta: {
    sourceTextLength: number
    contentHash?: string
    fromCache?: boolean
  },
): AiDocumentAnalysisResult {
  if (isSemanticExtractionPayload(raw)) {
    const expanded = expandSemanticExtraction(raw, meta)
    return aiDocumentAnalysisResultSchema.parse(expanded)
  }

  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : []

  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : []
  const fields = fieldsRaw
    .map((f, i) =>
      f && typeof f === 'object'
        ? normalizeField(f as Record<string, unknown>, i, warnings)
        : null,
    )
    .filter((f): f is DetectedDocumentField => f != null)

  const sections: DetectedDocumentSection[] = Array.isArray(obj.sections)
    ? obj.sections
        .map((s, i) => {
          if (!s || typeof s !== 'object') return null
          const row = s as Record<string, unknown>
          const title =
            typeof row.title === 'string' && row.title.trim()
              ? row.title.trim()
              : null
          if (!title) return null
          return {
            title,
            order:
              typeof row.order === 'number' && row.order >= 0
                ? Math.floor(row.order)
                : i,
          }
        })
        .filter((s): s is DetectedDocumentSection => s != null)
    : []

  const clauses: DetectedDocumentClause[] = Array.isArray(obj.clauses)
    ? obj.clauses.flatMap((c, i) => {
        if (!c || typeof c !== 'object') return []
        const row = c as Record<string, unknown>
        const type =
          typeof row.type === 'string' && row.type.trim()
            ? row.type.trim()
            : null
        if (!type) return []
        const clause: DetectedDocumentClause = {
          id:
            typeof row.id === 'string' && row.id.trim()
              ? row.id.trim()
              : `ai-clause-${i + 1}`,
          type,
          confidence: clamp01(row.confidence, 0.7),
        }
        if (typeof row.title === 'string') {
          clause.title = row.title
        }
        return [clause]
      })
    : []

  const candidate: AiDocumentAnalysisResult = {
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
    analyzerId: DOCUMENT_AI_CONFIG.analyzerId,
    analyzerVersion: DOCUMENT_AI_CONFIG.analyzerVersion,
    documentType:
      typeof obj.documentType === 'string' && obj.documentType.trim()
        ? obj.documentType.trim()
        : 'contract',
    packageSuggestion:
      typeof obj.packageSuggestion === 'string'
        ? obj.packageSuggestion
        : obj.packageSuggestion === null
          ? null
          : undefined,
    defaults: [],
    overallConfidence: clamp01(obj.overallConfidence, 0.5),
    fields,
    sections,
    clauses,
    warnings,
    analyzedAt:
      typeof obj.analyzedAt === 'string'
        ? obj.analyzedAt
        : new Date().toISOString(),
    sourceTextLength: meta.sourceTextLength,
    contentHash: meta.contentHash,
    fromCache: meta.fromCache,
  }

  return aiDocumentAnalysisResultSchema.parse(candidate)
}
