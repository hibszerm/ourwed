/**
 * Client-side schema validation for structured mapping responses (v2 legacy + v3 compact).
 */

import {
  deriveMappingWarningMessage,
  enrichCompactFieldProposal,
  enrichCompactImmutableFinding,
} from './deriveFieldProposalEnrichment'
import { EXPERIMENT_DYNAMIC_FIELD_KEYS } from './fieldRegistry'
import {
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2,
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
  SUPPORTED_AI_MAPPING_RESPONSE_VERSIONS,
  type AiMappingResponseVersion,
  type ContractFieldKey,
  type IndexedDocxBlock,
  type StructuredAiMappingResponse,
} from './types'

const ALLOWED = new Set<string>(EXPERIMENT_DYNAMIC_FIELD_KEYS)

const CONFIDENCE = new Set(['high', 'medium', 'low'])
const DOC_TYPES = new Set([
  'wedding_photography_contract',
  'wedding_video_contract',
  'wedding_service_contract',
  'unknown',
])
const PHYSICAL_MODES = new Set([
  'composite',
  'separate_persons',
  'single_person',
  'unknown',
])
const IMMUTABLE_CLASS = new Set([
  'provider_data',
  'bank_account',
  'package_fact',
  'legal_clause',
  'coverage_fact',
  'delivery_fact',
  'other_immutable',
])
const WARNING_CODES = new Set([
  'ambiguous_identity',
  'ambiguous_date',
  'ambiguous_money',
  'missing_required_field',
  'duplicate_candidate',
  'unsupported_payment_structure',
  'possible_provider_confusion',
  'other',
])

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function requireString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  return typeof v === 'string' ? v : null
}

function resolveResponseVersion(raw: Record<string, unknown>): AiMappingResponseVersion | null {
  const version = raw.responseVersion
  if (typeof version === 'string') {
    if (
      (SUPPORTED_AI_MAPPING_RESPONSE_VERSIONS as readonly string[]).includes(version)
    ) {
      return version as AiMappingResponseVersion
    }
    return null
  }
  // Legacy persisted runs without explicit version used v2 field shape.
  if (isObject(raw.documentAssessment)) {
    const first = Array.isArray(raw.fields) ? raw.fields[0] : null
    if (!first || (isObject(first) && 'evidenceText' in first)) {
      return AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2
    }
  }
  return null
}

function parseV2Field(raw: unknown): StructuredAiMappingResponse['fields'][number] | null {
  if (!isObject(raw)) return null
  const fieldKey = raw.fieldKey
  if (typeof fieldKey !== 'string' || !ALLOWED.has(fieldKey)) return null

  const blockId = requireString(raw, 'blockId')
  const exactValue = requireString(raw, 'exactValue')
  const evidenceText = requireString(raw, 'evidenceText')
  const contextBefore = requireString(raw, 'contextBefore')
  const contextAfter = requireString(raw, 'contextAfter')
  const semanticRole = requireString(raw, 'semanticRole')
  const reasoning = requireString(raw, 'reasoning')
  const confidence = raw.confidence

  if (
    !blockId ||
    exactValue === null ||
    evidenceText === null ||
    contextBefore === null ||
    contextAfter === null ||
    !semanticRole ||
    !reasoning
  ) {
    return null
  }
  if (typeof confidence !== 'string' || !CONFIDENCE.has(confidence)) return null

  const paired =
    raw.pairedFieldGroup === null
      ? null
      : typeof raw.pairedFieldGroup === 'string'
        ? raw.pairedFieldGroup
        : null

  return {
    fieldKey: fieldKey as ContractFieldKey,
    blockId,
    exactValue,
    evidenceText,
    contextBefore,
    contextAfter,
    semanticRole,
    confidence: confidence as 'high' | 'medium' | 'low',
    reasoning,
    pairedFieldGroup: paired,
  }
}

function parseV3Field(
  raw: unknown,
  blocksById: Map<string, string>,
): StructuredAiMappingResponse['fields'][number] | null {
  if (!isObject(raw)) return null
  const fieldKey = raw.fieldKey
  if (typeof fieldKey !== 'string' || !ALLOWED.has(fieldKey)) return null

  const blockId = requireString(raw, 'blockId')
  const exactValue = requireString(raw, 'exactValue')
  const confidence = raw.confidence
  if (!blockId || exactValue === null) return null
  if (typeof confidence !== 'string' || !CONFIDENCE.has(confidence)) return null

  const blockText = blocksById.get(blockId)
  if (blockText === undefined) return null

  const paired =
    raw.pairedFieldGroup === null
      ? null
      : typeof raw.pairedFieldGroup === 'string'
        ? raw.pairedFieldGroup
        : null

  return enrichCompactFieldProposal({
    fieldKey: fieldKey as ContractFieldKey,
    blockId,
    exactValue,
    confidence: confidence as 'high' | 'medium' | 'low',
    pairedFieldGroup: paired,
    blockText,
  })
}

function parseDocumentAssessment(
  raw: Record<string, unknown>,
): StructuredAiMappingResponse['documentAssessment'] | null {
  const assessment = raw.documentAssessment
  if (!isObject(assessment)) return null
  const docType = assessment.documentType
  if (typeof docType !== 'string' || !DOC_TYPES.has(docType)) return null
  const cap = assessment.clientPartyCapability
  if (!isObject(cap)) return null
  if (
    typeof cap.physicalMode !== 'string' ||
    !PHYSICAL_MODES.has(cap.physicalMode)
  ) {
    return null
  }
  if (![0, 1, 2].includes(cap.expectedPersonCount as number)) return null
  return {
    documentType: docType as StructuredAiMappingResponse['documentAssessment']['documentType'],
    clientPartyCapability: {
      physicalMode: cap.physicalMode as StructuredAiMappingResponse['documentAssessment']['clientPartyCapability']['physicalMode'],
      expectedPersonCount: cap.expectedPersonCount as 0 | 1 | 2,
    },
  }
}

function parseUnsupportedValues(
  raw: Record<string, unknown>,
): StructuredAiMappingResponse['unsupportedValues'] {
  if (!Array.isArray(raw.unsupportedValues)) return []
  const unsupportedValues: StructuredAiMappingResponse['unsupportedValues'] = []
  for (const u of raw.unsupportedValues) {
    if (!isObject(u)) continue
    const blockId = requireString(u, 'blockId')
    const sourceText = requireString(u, 'sourceText')
    const semanticRole = requireString(u, 'semanticRole')
    const reason = requireString(u, 'reason')
    if (!blockId || !sourceText || !semanticRole || !reason) continue
    unsupportedValues.push({ blockId, sourceText, semanticRole, reason })
  }
  return unsupportedValues
}

function parseImmutableFindings(
  raw: Record<string, unknown>,
  version: AiMappingResponseVersion,
  blocksById: Map<string, string>,
): StructuredAiMappingResponse['immutableFindings'] | null {
  if (!Array.isArray(raw.immutableFindings)) return null
  const immutableFindings: StructuredAiMappingResponse['immutableFindings'] = []

  for (const im of raw.immutableFindings) {
    if (!isObject(im)) return null
    const blockId = requireString(im, 'blockId')
    const classification = im.classification
    if (
      !blockId ||
      typeof classification !== 'string' ||
      !IMMUTABLE_CLASS.has(classification)
    ) {
      return null
    }

    if (version === AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3) {
      const exactValue = requireString(im, 'exactValue')
      if (!exactValue || !blocksById.has(blockId)) return null
      immutableFindings.push(
        enrichCompactImmutableFinding({
          blockId,
          classification: classification as StructuredAiMappingResponse['immutableFindings'][number]['classification'],
          exactValue,
        }),
      )
      continue
    }

    const sourceText = requireString(im, 'sourceText')
    const reason = requireString(im, 'reason')
    if (!sourceText || !reason) return null
    immutableFindings.push({
      blockId,
      sourceText,
      classification: classification as StructuredAiMappingResponse['immutableFindings'][number]['classification'],
      reason,
    })
  }

  return immutableFindings
}

function parseWarnings(
  raw: Record<string, unknown>,
  version: AiMappingResponseVersion,
): StructuredAiMappingResponse['warnings'] | null {
  if (!Array.isArray(raw.warnings)) return null
  const warnings: StructuredAiMappingResponse['warnings'] = []

  for (const w of raw.warnings) {
    if (!isObject(w)) return null
    const code = w.code
    if (typeof code !== 'string' || !WARNING_CODES.has(code)) return null

    const blockId =
      w.blockId === null
        ? null
        : typeof w.blockId === 'string'
          ? w.blockId
          : null

    if (version === AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3) {
      const relatedFieldKey =
        w.relatedFieldKey === null
          ? null
          : typeof w.relatedFieldKey === 'string' &&
              ALLOWED.has(w.relatedFieldKey)
            ? (w.relatedFieldKey as ContractFieldKey)
            : null
      warnings.push({
        code: code as StructuredAiMappingResponse['warnings'][number]['code'],
        message: deriveMappingWarningMessage({ code, relatedFieldKey }),
        blockId,
      })
      continue
    }

    const message = requireString(w, 'message')
    if (!message) return null
    warnings.push({
      code: code as StructuredAiMappingResponse['warnings'][number]['code'],
      message,
      blockId,
    })
  }

  return warnings
}

export function parseStructuredMappingResponse(
  raw: unknown,
  blocks?: IndexedDocxBlock[],
): { ok: true; response: StructuredAiMappingResponse } | { ok: false; reason: string } {
  if (!isObject(raw)) return { ok: false, reason: 'not_object' }

  const version = resolveResponseVersion(raw)
  if (!version) {
    const explicit = raw.responseVersion
    if (typeof explicit === 'string') {
      return { ok: false, reason: `unsupported_response_version:${explicit}` }
    }
    return { ok: false, reason: 'unsupported_response_version' }
  }

  const documentAssessment = parseDocumentAssessment(raw)
  if (!documentAssessment) return { ok: false, reason: 'missing_documentAssessment' }

  const blocksById = new Map(
    (blocks ?? []).map((b) => [b.id, b.text] as const),
  )

  if (!Array.isArray(raw.fields)) return { ok: false, reason: 'missing_fields' }
  const fields: StructuredAiMappingResponse['fields'] = []
  for (const f of raw.fields) {
    const parsed =
      version === AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3
        ? parseV3Field(f, blocksById)
        : parseV2Field(f)
    if (!parsed) {
      const key =
        isObject(f) && typeof f.fieldKey === 'string' ? f.fieldKey : 'unknown'
      if (!ALLOWED.has(key)) {
        return { ok: false, reason: `invented_field_key:${key}` }
      }
      if (version === AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3 && isObject(f)) {
        const blockId = f.blockId
        if (typeof blockId === 'string' && !blocksById.has(blockId)) {
          return { ok: false, reason: 'invalid_block_id' }
        }
      }
      return { ok: false, reason: 'invalid_field_property' }
    }
    fields.push(parsed)
  }

  const unsupportedValues = parseUnsupportedValues(raw)

  const immutableFindings = parseImmutableFindings(raw, version, blocksById)
  if (!immutableFindings) return { ok: false, reason: 'missing_immutableFindings' }

  const warnings = parseWarnings(raw, version)
  if (!warnings) return { ok: false, reason: 'missing_warnings' }

  return {
    ok: true,
    response: {
      responseVersion: version,
      documentAssessment,
      fields,
      unsupportedValues,
      immutableFindings,
      warnings,
    },
  }
}

export function isLegacyMappingResponse(raw: unknown): boolean {
  if (!isObject(raw) || !Array.isArray(raw.fields)) return false
  const first = raw.fields[0]
  return isObject(first) && 'sourceText' in first && !('exactValue' in first)
}

export function approximateResponseTokenCount(response: StructuredAiMappingResponse): number {
  return Math.ceil(JSON.stringify(response).length / 4)
}
