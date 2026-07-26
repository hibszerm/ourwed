/**
 * Phase A semantic-map soft validation (client).
 * One bad row must not kill the whole analysis.
 */

import type {
  DocumentSemanticAnchor,
  DocumentSemanticMap,
  DocumentTextAnchor,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  isContractSemanticRole,
  normalizeSemanticRole,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import {
  isEllipsisProposal,
  resolveExactSourceSpan,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import { resolveTypedSourceSpan } from '@/features/ai-contract-lab/resolveTypedSourceSpan'

function typedValueKindForRole(role: string): 'date' | 'money' | 'text' {
  if (
    /_date$|deadline|execution|wedding_date|contract_date/.test(role)
  ) {
    return 'date'
  }
  if (/price|amount|deposit_amount|remaining|package_price|contract_value|extra_hour|overtime/.test(role)) {
    return 'money'
  }
  return 'text'
}

export type PhaseAErrorCode =
  | 'invalid_request'
  | 'provider_output_not_json'
  | 'provider_schema_mismatch'
  | 'semantic_map_invalid'
  | 'anchor_not_found'
  | 'source_span_not_found'
  | 'source_span_ambiguous'
  | 'unsupported_analysis_version'
  | 'zero_valid_rows'
  | 'unknown_error'

export type PhaseAStage =
  | 'validate_request'
  | 'provider_request'
  | 'parse_provider_json'
  | 'validate_provider_output'
  | 'resolve_source_spans'
  | 'serialize_response'

export type SemanticMapIssue = {
  providerIndex: number
  anchorId: string | null
  status:
    | 'unknown_semantic_role'
    | 'missing_anchor'
    | 'invalid_confidence'
    | 'empty_source_text'
    | 'source_span_not_found'
    | 'source_span_ambiguous'
    | 'duplicate_semantic_row'
    | 'invalid_row_shape'
  semanticRole: string | null
}

export type PhaseAValidationStats = {
  providerRows: number
  validRows: number
  unresolvedRows: number
}

export type PhaseASoftValidationResult =
  | {
      ok: true
      semanticMap: DocumentSemanticMap & { unresolved: SemanticMapIssue[] }
      stats: PhaseAValidationStats
    }
  | {
      ok: false
      code: PhaseAErrorCode
      stage: PhaseAStage
      message: string
      analysisVersion: string | null
      issueCount: number
      issues: Array<{ path: string; code: string }>
      stats: PhaseAValidationStats
    }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Unwrap common provider wrappers without trusting content. */
export function unwrapProviderSemanticMap(raw: unknown): unknown {
  const obj = asRecord(raw)
  if (!obj) return raw
  if (asRecord(obj.semanticMap)) return obj.semanticMap
  if (Array.isArray(obj.anchors) && !Array.isArray(obj.semanticAnchors)) {
    return { ...obj, semanticAnchors: obj.anchors }
  }
  if (Array.isArray(obj.items) && !Array.isArray(obj.semanticAnchors)) {
    return { ...obj, semanticAnchors: obj.items }
  }
  // Legacy Phase 1.x shape
  if (Array.isArray(obj.replacements) && !Array.isArray(obj.semanticAnchors)) {
    return obj
  }
  return raw
}

function coerceConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function looksLikeLegacyPhase1(raw: unknown): boolean {
  const obj = asRecord(raw)
  if (!obj) return false
  return (
    Array.isArray(obj.replacements) &&
    !Array.isArray(obj.semanticAnchors) &&
    !Array.isArray(obj.anchors)
  )
}

/**
 * Soft-validate Phase A provider output + resolve exact source spans.
 */
export function softValidatePhaseASemanticMap(input: {
  raw: unknown
  anchors: DocumentTextAnchor[]
  expectedVersion?: string
}): PhaseASoftValidationResult {
  const expectedVersion = input.expectedVersion ?? '2.0.0'
  const emptyStats: PhaseAValidationStats = {
    providerRows: 0,
    validRows: 0,
    unresolvedRows: 0,
  }

  if (looksLikeLegacyPhase1(input.raw)) {
    return {
      ok: false,
      code: 'provider_schema_mismatch',
      stage: 'validate_provider_output',
      message: 'OpenAI response did not match Phase A schema (legacy Phase 1.x shape)',
      analysisVersion: null,
      issueCount: 1,
      issues: [{ path: 'replacements', code: 'unexpected_legacy_field' }],
      stats: emptyStats,
    }
  }

  const unwrapped = unwrapProviderSemanticMap(input.raw)
  const root = asRecord(unwrapped)
  if (!root) {
    return {
      ok: false,
      code: 'semantic_map_invalid',
      stage: 'validate_provider_output',
      message: 'OpenAI response is not a Phase A object',
      analysisVersion: null,
      issueCount: 1,
      issues: [{ path: '', code: 'invalid_type' }],
      stats: emptyStats,
    }
  }

  const version =
    typeof root.analysisVersion === 'string' ? root.analysisVersion : null
  if (version && version !== expectedVersion && !version.startsWith('2.')) {
    return {
      ok: false,
      code: 'unsupported_analysis_version',
      stage: 'validate_provider_output',
      message: `Unsupported analysisVersion: ${version}`,
      analysisVersion: version,
      issueCount: 1,
      issues: [{ path: 'analysisVersion', code: 'unsupported' }],
      stats: emptyStats,
    }
  }

  const rowsRaw = Array.isArray(root.semanticAnchors)
    ? root.semanticAnchors
    : Array.isArray(root.anchors)
      ? root.anchors
      : null

  if (!rowsRaw) {
    return {
      ok: false,
      code: 'provider_schema_mismatch',
      stage: 'validate_provider_output',
      message: 'OpenAI response did not match Phase A schema (missing semanticAnchors)',
      analysisVersion: version,
      issueCount: 1,
      issues: [{ path: 'semanticAnchors', code: 'invalid_type' }],
      stats: emptyStats,
    }
  }

  const summaryRaw = asRecord(root.documentSummary)
  const documentSummary = {
    documentType:
      typeof summaryRaw?.documentType === 'string'
        ? summaryRaw.documentType
        : 'umowa',
    language:
      typeof summaryRaw?.language === 'string' ? summaryRaw.language : 'pl',
    detectedPartyRoles: Array.isArray(summaryRaw?.detectedPartyRoles)
      ? summaryRaw.detectedPartyRoles.filter(
          (x): x is string => typeof x === 'string',
        )
      : [],
    detectedBusinessContext:
      typeof summaryRaw?.detectedBusinessContext === 'string'
        ? summaryRaw.detectedBusinessContext
        : 'foto/video',
  }

  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]))
  const valid: DocumentSemanticAnchor[] = []
  const unresolved: SemanticMapIssue[] = []
  const seenKeys = new Set<string>()
  const schemaIssues: Array<{ path: string; code: string }> = []

  for (let i = 0; i < rowsRaw.length; i += 1) {
    const row = asRecord(rowsRaw[i])
    if (!row) {
      unresolved.push({
        providerIndex: i,
        anchorId: null,
        status: 'invalid_row_shape',
        semanticRole: null,
      })
      schemaIssues.push({
        path: `semanticAnchors.${i}`,
        code: 'invalid_type',
      })
      continue
    }

    const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null
    const semanticRole =
      typeof row.semanticRole === 'string' ? row.semanticRole : null
    const confidence = coerceConfidence(row.confidence)
    const valueSpan = asRecord(row.valueSpan)
    const sourceText =
      typeof valueSpan?.sourceText === 'string' ? valueSpan.sourceText : null

    if (!anchorId || !semanticRole || !valueSpan) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'invalid_row_shape',
        semanticRole,
      })
      schemaIssues.push({
        path: `semanticAnchors.${i}`,
        code: 'invalid_type',
      })
      continue
    }

    if (!isContractSemanticRole(semanticRole)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'unknown_semantic_role',
        semanticRole,
      })
      schemaIssues.push({
        path: `semanticAnchors.${i}.semanticRole`,
        code: 'unknown_role',
      })
      continue
    }

    if (confidence == null || confidence < 0 || confidence > 1) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'invalid_confidence',
        semanticRole,
      })
      schemaIssues.push({
        path: `semanticAnchors.${i}.confidence`,
        code: 'invalid_type',
      })
      continue
    }

    if (!sourceText || !sourceText.trim()) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'empty_source_text',
        semanticRole,
      })
      schemaIssues.push({
        path: `semanticAnchors.${i}.valueSpan.sourceText`,
        code: 'invalid_type',
      })
      continue
    }

    if (!anchorById.has(anchorId)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'missing_anchor',
        semanticRole,
      })
      continue
    }

    const normalizedRole = normalizeSemanticRole(semanticRole) ?? semanticRole
    const dupKey = `${anchorId}::${normalizedRole}::${sourceText.trim()}`
    if (seenKeys.has(dupKey)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'duplicate_semantic_row',
        semanticRole: normalizedRole,
      })
      continue
    }

    const docAnchor = anchorById.get(anchorId)!
    const prefix =
      typeof valueSpan.prefixContext === 'string'
        ? valueSpan.prefixContext
        : null
    const suffix =
      typeof valueSpan.suffixContext === 'string'
        ? valueSpan.suffixContext
        : null

    // Ellipsis proposals are never used literally — resolve via safe resolver
    let span = resolveExactSourceSpan(docAnchor.text, sourceText, {
      prefixContext: prefix,
      suffixContext: suffix,
    })

    // Typed fallback for dates / money when literal match fails
    if (span.status === 'not_found') {
      const valueKind = typedValueKindForRole(semanticRole)
      const typed = resolveTypedSourceSpan({
        anchorId,
        anchorText: docAnchor.text,
        semanticRole,
        valueKind,
        proposedSourceText: sourceText,
        prefixContext: prefix,
        suffixContext: suffix,
        runStart: docAnchor.runStart,
        runEnd: docAnchor.runEnd,
      })
      if (typed) {
        span = {
          status: 'normalized_exact',
          exactSourceText: typed.exactSourceText,
          start: typed.start,
          end: typed.end,
          normalizationUsed: [typed.strategy],
        }
      }
    }

    if (span.status === 'not_found') {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'source_span_not_found',
        semanticRole,
      })
      continue
    }
    if (span.status === 'ambiguous') {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'source_span_ambiguous',
        semanticRole,
      })
      continue
    }

    seenKeys.add(dupKey)
    valid.push({
      anchorId,
      semanticRole: normalizedRole,
      confidence,
      documentLabel:
        typeof row.documentLabel === 'string' ? row.documentLabel : null,
      valueSpan: {
        // Always store the exact slice from the original anchor
        sourceText: span.exactSourceText,
        prefixContext: prefix,
        suffixContext: suffix,
      },
      reason: typeof row.reason === 'string' ? row.reason : null,
    })

    // Track ellipsis as resolved-normalized (no PII log)
    void isEllipsisProposal(sourceText)
  }

  const stats: PhaseAValidationStats = {
    providerRows: rowsRaw.length,
    validRows: valid.length,
    unresolvedRows: unresolved.length,
  }

  if (valid.length === 0) {
    return {
      ok: false,
      code: 'zero_valid_rows',
      stage: 'validate_provider_output',
      message: 'Phase A produced zero valid semantic rows',
      analysisVersion: version ?? expectedVersion,
      issueCount: Math.max(schemaIssues.length, unresolved.length, 1),
      issues:
        schemaIssues.length > 0
          ? schemaIssues.slice(0, 20)
          : unresolved.slice(0, 20).map((u) => ({
              path: `semanticAnchors.${u.providerIndex}`,
              code: u.status,
            })),
      stats,
    }
  }

  const warnings = Array.isArray(root.warnings)
    ? root.warnings
        .map((w) => asRecord(w))
        .filter((w): w is Record<string, unknown> => w != null)
        .map((w) => ({
          code: typeof w.code === 'string' ? w.code : 'warning',
          message: typeof w.message === 'string' ? w.message : '',
          anchorIds: Array.isArray(w.anchorIds)
            ? w.anchorIds.filter((x): x is string => typeof x === 'string')
            : [],
        }))
    : []

  return {
    ok: true,
    semanticMap: {
      analysisVersion: version ?? expectedVersion,
      documentSummary,
      semanticAnchors: valid,
      unresolved,
      warnings,
    },
    stats,
  }
}
