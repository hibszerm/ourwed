/**
 * Edge Phase A — soft structural validation (no PII).
 * Exact source-span resolution happens on the client.
 */

export type PhaseAErrorCode =
  | 'invalid_request'
  | 'provider_output_not_json'
  | 'provider_schema_mismatch'
  | 'semantic_map_invalid'
  | 'unsupported_analysis_version'
  | 'zero_valid_rows'
  | 'provider_timeout'
  | 'provider_error'
  | 'rate_limit'
  | 'provider_auth'
  | 'network_error'
  | 'document_too_large'
  | 'unauthorized'
  | 'bad_request'
  | 'misconfigured'

export type PhaseAStage =
  | 'validate_request'
  | 'provider_request'
  | 'parse_provider_json'
  | 'validate_provider_output'
  | 'serialize_response'
  | 'request_failed'

export const PHASE_A_ROLE_SET = new Set([
  'contract_date',
  'contract_execution_date',
  'wedding_date',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'civil_office',
  'church',
  'package_name',
  'package_price',
  'deposit_amount',
  'remaining_amount',
  'bank_account',
  'photographer_name',
  'videographer_name',
  'company_name',
  'company_nip',
  'company_regon',
  'company_address',
  'company_phone',
  'company_email',
  'client_name',
  'bride_name',
  'groom_name',
  'client_phone',
  'client_email',
  'bride_phone',
  'groom_phone',
  'bride_email',
  'groom_email',
  'bride_address',
  'groom_address',
  'delivery_deadline',
  'preview_deadline',
  'working_hours',
  'extra_hour_price',
  'final_payment_due_date',
  'deposit_due_date',
  'coverage_hours',
  'coverage_end_time',
  'package_contents',
  'deposit_refund_multiplier',
  'deposit_forfeiture_clause',
  'amount_reference_without_literal_value',
  'legal_clause_reference',
  'defined_party_term',
  'couple_defined_term',
  'client_defined_term',
  'contractor_defined_term',
  'legal_party_reference',
])

type Issue = {
  providerIndex: number
  anchorId: string | null
  status: string
  semanticRole: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function unwrapProviderPayload(raw: unknown): unknown {
  const obj = asRecord(raw)
  if (!obj) return raw
  if (asRecord(obj.semanticMap)) return obj.semanticMap
  if (Array.isArray(obj.anchors) && !Array.isArray(obj.semanticAnchors)) {
    return { ...obj, semanticAnchors: obj.anchors }
  }
  if (Array.isArray(obj.items) && !Array.isArray(obj.semanticAnchors)) {
    return { ...obj, semanticAnchors: obj.items }
  }
  return raw
}

export function softValidateProviderSemanticMap(
  raw: unknown,
  knownAnchorIds: Set<string>,
  expectedVersion: string,
):
  | {
      ok: true
      semanticMap: Record<string, unknown>
      stats: {
        providerRows: number
        validRows: number
        unresolvedRows: number
      }
    }
  | {
      ok: false
      code: PhaseAErrorCode
      stage: PhaseAStage
      message: string
      analysisVersion: string | null
      issues: Array<{ path: string; code: string }>
      stats: {
        providerRows: number
        validRows: number
        unresolvedRows: number
      }
    } {
  const emptyStats = { providerRows: 0, validRows: 0, unresolvedRows: 0 }
  const root0 = asRecord(raw)
  if (
    root0 &&
    Array.isArray(root0.replacements) &&
    !Array.isArray(root0.semanticAnchors) &&
    !Array.isArray(root0.anchors)
  ) {
    return {
      ok: false,
      code: 'provider_schema_mismatch',
      stage: 'validate_provider_output',
      message: 'OpenAI response did not match Phase A schema',
      analysisVersion: null,
      issues: [{ path: 'replacements', code: 'unexpected_legacy_field' }],
      stats: emptyStats,
    }
  }

  const unwrapped = unwrapProviderPayload(raw)
  const root = asRecord(unwrapped)
  if (!root) {
    return {
      ok: false,
      code: 'semantic_map_invalid',
      stage: 'validate_provider_output',
      message: 'OpenAI response is not a Phase A object',
      analysisVersion: null,
      issues: [{ path: '', code: 'invalid_type' }],
      stats: emptyStats,
    }
  }

  const version =
    typeof root.analysisVersion === 'string' ? root.analysisVersion : null
  if (version && !version.startsWith('2.')) {
    return {
      ok: false,
      code: 'unsupported_analysis_version',
      stage: 'validate_provider_output',
      message: 'Unsupported analysisVersion',
      analysisVersion: version,
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
      message: 'OpenAI response did not match Phase A schema',
      analysisVersion: version,
      issues: [{ path: 'semanticAnchors', code: 'invalid_type' }],
      stats: emptyStats,
    }
  }

  const summary = asRecord(root.documentSummary) ?? {}
  const valid: unknown[] = []
  const unresolved: Issue[] = []
  const issues: Array<{ path: string; code: string }> = []
  const seen = new Set<string>()

  for (let i = 0; i < rowsRaw.length; i += 1) {
    const row = asRecord(rowsRaw[i])
    if (!row) {
      unresolved.push({
        providerIndex: i,
        anchorId: null,
        status: 'invalid_row_shape',
        semanticRole: null,
      })
      issues.push({ path: `semanticAnchors.${i}`, code: 'invalid_type' })
      continue
    }
    const anchorId = typeof row.anchorId === 'string' ? row.anchorId : null
    const semanticRole =
      typeof row.semanticRole === 'string' ? row.semanticRole : null
    let confidence: number | null = null
    if (typeof row.confidence === 'number' && Number.isFinite(row.confidence)) {
      confidence = row.confidence
    } else if (typeof row.confidence === 'string') {
      const n = Number(row.confidence)
      if (Number.isFinite(n)) confidence = n
    }
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
      issues.push({ path: `semanticAnchors.${i}`, code: 'invalid_type' })
      continue
    }
    if (!PHASE_A_ROLE_SET.has(semanticRole)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'unknown_semantic_role',
        semanticRole,
      })
      issues.push({
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
      issues.push({
        path: `semanticAnchors.${i}.confidence`,
        code: 'invalid_type',
      })
      continue
    }
    if (!sourceText?.trim()) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'empty_source_text',
        semanticRole,
      })
      issues.push({
        path: `semanticAnchors.${i}.valueSpan.sourceText`,
        code: 'invalid_type',
      })
      continue
    }
    if (!knownAnchorIds.has(anchorId)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'missing_anchor',
        semanticRole,
      })
      continue
    }
    const dup = `${anchorId}::${semanticRole}::${sourceText.trim()}`
    if (seen.has(dup)) {
      unresolved.push({
        providerIndex: i,
        anchorId,
        status: 'duplicate_semantic_row',
        semanticRole,
      })
      continue
    }
    seen.add(dup)
    valid.push({
      anchorId,
      semanticRole,
      confidence,
      documentLabel:
        typeof row.documentLabel === 'string' || row.documentLabel === null
          ? row.documentLabel
          : null,
      valueSpan: {
        sourceText: sourceText.trim(),
        prefixContext:
          typeof valueSpan.prefixContext === 'string' ||
          valueSpan.prefixContext === null
            ? valueSpan.prefixContext
            : null,
        suffixContext:
          typeof valueSpan.suffixContext === 'string' ||
          valueSpan.suffixContext === null
            ? valueSpan.suffixContext
            : null,
      },
      reason: typeof row.reason === 'string' ? row.reason : null,
    })
  }

  const stats = {
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
      issues:
        issues.length > 0
          ? issues.slice(0, 20)
          : unresolved.slice(0, 20).map((u) => ({
              path: `semanticAnchors.${u.providerIndex}`,
              code: u.status,
            })),
      stats,
    }
  }

  return {
    ok: true,
    semanticMap: {
      analysisVersion: version ?? expectedVersion,
      documentSummary: {
        documentType:
          typeof summary.documentType === 'string'
            ? summary.documentType
            : 'umowa',
        language: typeof summary.language === 'string' ? summary.language : 'pl',
        detectedPartyRoles: Array.isArray(summary.detectedPartyRoles)
          ? summary.detectedPartyRoles.filter((x) => typeof x === 'string')
          : [],
        detectedBusinessContext:
          typeof summary.detectedBusinessContext === 'string'
            ? summary.detectedBusinessContext
            : 'foto/video',
      },
      semanticAnchors: valid,
      unresolved,
      warnings: Array.isArray(root.warnings) ? root.warnings : [],
    },
    stats,
  }
}

export function logPhaseAFailure(payload: {
  analysisVersion: string | null
  stage: PhaseAStage
  code: PhaseAErrorCode
  inputAnchorCount: number
  providerAnchorCount: number
  validAnchorCount: number
  invalidAnchorCount: number
  durationMs: number
}) {
  console.error('ai_contract_lab_phase_a_failed', payload)
}
