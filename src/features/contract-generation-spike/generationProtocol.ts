/** Minimal semantic-to-editor protocol for the future Option B generation flow. */
/** Reuse an existing editor block ID; the model treats it only as an opaque handle. */
export type BlockId = string

export type BlockEdit =
  | { kind: 'replace'; blockId: BlockId; text: string; supersedesSourceBlockId: BlockId | null; supersededSourceText: string | null }
  | { kind: 'insert_after'; blockId: BlockId; text: string; supersedesSourceBlockId: BlockId | null; supersededSourceText: string | null }

export type MissingInputAnswerKind = 'text' | 'multiline' | 'date' | 'number' | 'email' | 'phone'

/** Generic presentation metadata; id is opaque and has no CRM/path semantics. */
export type MissingInputSubject = {
  participantKey: string
  displayName?: string
}

export type MissingInput = {
  id: string
  kind?: 'value'
  label: string
  answerKind: MissingInputAnswerKind
  subject?: MissingInputSubject
} | {
  id: string
  kind: 'choice'
  label: string
  options: Array<{ id: string; label: string }>
}

/** A user-supplied authoritative value paired with one opaque requirement ID. */
export type ContractGenerationAnswer =
  | { missingInputId: string; value: string }
  | { missingInputId: string; optionId: string }

export type GenerationResponse =
  | { status: 'READY'; edits: BlockEdit[] }
  | { status: 'MISSING_INPUT'; missingInputs: MissingInput[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }

export type ReviewResponse =
  | { status: 'PASS' }
  | { status: 'FAIL'; findings: string[] }

/** Content-free categories for the independent candidate Reviewer. */
export const REVIEWER_FINDING_CATEGORIES = [
  'source_mismatch',
  'omitted_required_content',
  'unsupported_addition',
  'authoritative_fact_mismatch',
  'product_rule_violation',
  'structural_issue',
  'other_material_issue',
] as const

/** Closed, content-free identifiers for existing generic Reviewer rule families. */
export const REVIEWER_FINDING_RULE_IDS = [
  'contract_total',
  'travel',
  'extras',
  'source_scope',
  'payment_amounts',
  'payment_timing',
  'crm_enrichment',
  'transaction_facts',
  'unsupported_invention',
  'source_preservation',
] as const

export type ReviewerFindingCategory = typeof REVIEWER_FINDING_CATEGORIES[number]
export type ReviewerFindingRuleId = typeof REVIEWER_FINDING_RULE_IDS[number]
export type CandidateReviewerFinding = { category: ReviewerFindingCategory; ruleId: ReviewerFindingRuleId; message: string }
export type CandidateReviewResponse =
  | { status: 'PASS' }
  | { status: 'FAIL'; findings: CandidateReviewerFinding[] }

export type SafeReviewerFindingSummary = {
  findingCount: number
  findingCategories: ReviewerFindingCategory[]
  findingRuleIds: ReviewerFindingRuleId[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

const ANSWER_KINDS = new Set<MissingInputAnswerKind>(['text', 'multiline', 'date', 'number', 'email', 'phone'])

export function isMissingInput(value: unknown, participantKeys?: ReadonlySet<string>): value is MissingInput {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.label)) return false
  if (value.kind === 'choice') {
    if (!hasExactKeys(value, ['id', 'kind', 'label', 'options']) || !Array.isArray(value.options) || value.options.length < 2) return false
    const ids = new Set<string>()
    return value.options.every((option) => {
      if (!isRecord(option) || !hasExactKeys(option, ['id', 'label']) || !isNonEmptyString(option.id) || !isNonEmptyString(option.label) || ids.has(option.id)) return false
      ids.add(option.id)
      return true
    })
  }
  if (value.kind !== undefined && value.kind !== 'value') return false
  if (typeof value.answerKind !== 'string' || !ANSWER_KINDS.has(value.answerKind as MissingInputAnswerKind)) return false
  const keys = value.kind === 'value' ? ['id', 'kind', 'label', 'answerKind'] : ['id', 'label', 'answerKind']
  if (value.subject === undefined) return hasExactKeys(value, keys)
  if (!isRecord(value.subject)) return false
  const subjectKeys = Object.keys(value.subject)
  if (!hasExactKeys(value, [...keys, 'subject'])
    || !isNonEmptyString(value.subject.participantKey)
    || (value.subject.displayName !== undefined && !isNonEmptyString(value.subject.displayName))
    || !subjectKeys.every((key) => key === 'participantKey' || key === 'displayName')) return false
  return !participantKeys || participantKeys.has(value.subject.participantKey)
}

export function isMissingInputList(value: unknown, participantKeys?: ReadonlySet<string>): value is MissingInput[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => isMissingInput(item, participantKeys))) return false
  const ids = value.map((item) => (item as MissingInput).id)
  return new Set(ids).size === ids.length
}

function isBlockEdit(value: unknown): value is BlockEdit {
  if (!isRecord(value) || !isNonEmptyString(value.blockId) || !isNonEmptyString(value.text)) return false
  if ((value.kind === 'replace' || value.kind === 'insert_after')
    && hasExactKeys(value, ['kind', 'blockId', 'text', 'supersedesSourceBlockId', 'supersededSourceText'])) {
    return (value.supersedesSourceBlockId === null || isNonEmptyString(value.supersedesSourceBlockId))
      && (value.supersededSourceText === null || isNonEmptyString(value.supersededSourceText))
      && ((value.supersedesSourceBlockId === null) === (value.supersededSourceText === null))
  }
  return false
}

/** Runtime boundary for untrusted structured model output; rejects mixed or extended branches. */
export function isGenerationResponse(value: unknown, participantKeys?: ReadonlySet<string>): value is GenerationResponse {
  if (!isRecord(value)) return false
  if (value.status === 'READY') {
    return hasExactKeys(value, ['status', 'edits'])
      && Array.isArray(value.edits)
      && value.edits.every(isBlockEdit)
  }
  if (value.status === 'MISSING_INPUT') {
    return hasExactKeys(value, ['status', 'missingInputs'])
      && isMissingInputList(value.missingInputs, participantKeys)
  }
  if (value.status === 'CONFLICT_INPUT') {
    return hasExactKeys(value, ['status', 'conflicts'])
      && isStringList(value.conflicts)
      && value.conflicts.length > 0
  }
  return false
}

export const GENERATION_RESPONSE_VALIDATION_CODES = [
  'missing_required_field', 'invalid_type', 'invalid_enum', 'invalid_array_shape',
  'invalid_object_shape', 'invalid_union_branch', 'unknown_protocol_failure',
] as const
export type GenerationResponseValidationCode = typeof GENERATION_RESPONSE_VALIDATION_CODES[number]
export const GENERATION_RESPONSE_VALIDATION_PATHS = [
  'response', 'status', 'edits', 'edits[]', 'edits[].kind', 'edits[].blockId', 'edits[].text',
  'edits[].supersedesSourceBlockId', 'edits[].supersededSourceText', 'missingInputs',
  'missingInputs[]', 'missingInputs[].id', 'missingInputs[].kind', 'missingInputs[].label',
  'missingInputs[].answerKind', 'missingInputs[].subject', 'missingInputs[].subject.participantKey',
  'missingInputs[].options', 'missingInputs[].options[]', 'missingInputs[].options[].id',
  'missingInputs[].options[].label', 'conflicts', 'conflicts[]',
] as const
export type GenerationResponseValidationPath = typeof GENERATION_RESPONSE_VALIDATION_PATHS[number]
export type GenerationResponseBranch = 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'READY' | 'UNKNOWN'
export type GenerationResponseValidationDiagnostic = {
  responseBranch: GenerationResponseBranch
  schemaErrorCode: GenerationResponseValidationCode
  schemaPath?: GenerationResponseValidationPath
}

/** Content-free first-issue diagnosis for the existing GenerationResponse guard. */
export function diagnoseGenerationResponse(
  value: unknown,
  participantKeys?: ReadonlySet<string>,
): GenerationResponseValidationDiagnostic | null {
  if (isGenerationResponse(value, participantKeys)) return null
  const fail = (
    responseBranch: GenerationResponseBranch,
    schemaErrorCode: GenerationResponseValidationCode,
    schemaPath?: GenerationResponseValidationPath,
  ): GenerationResponseValidationDiagnostic => ({ responseBranch, schemaErrorCode, ...(schemaPath ? { schemaPath } : {}) })
  if (!isRecord(value)) return fail('UNKNOWN', 'invalid_object_shape', 'response')
  if (!Object.hasOwn(value, 'status')) return fail('UNKNOWN', 'missing_required_field', 'status')
  const branch: GenerationResponseBranch = value.status === 'READY' || value.status === 'MISSING_INPUT' || value.status === 'CONFLICT_INPUT'
    ? value.status
    : 'UNKNOWN'
  if (branch === 'UNKNOWN') return fail(branch, 'invalid_enum', 'status')

  if (branch === 'READY') {
    if (!Object.hasOwn(value, 'edits')) return fail(branch, 'missing_required_field', 'edits')
    if (!Array.isArray(value.edits)) return fail(branch, 'invalid_array_shape', 'edits')
    if (!hasExactKeys(value, ['status', 'edits'])) return fail(branch, 'invalid_object_shape', 'response')
    for (const edit of value.edits) {
      if (!isRecord(edit)) return fail(branch, 'invalid_object_shape', 'edits[]')
      if (Object.hasOwn(edit, 'kind') && edit.kind !== 'replace' && edit.kind !== 'insert_after') return fail(branch, 'invalid_enum', 'edits[].kind')
      if (Object.hasOwn(edit, 'blockId') && !isNonEmptyString(edit.blockId)) return fail(branch, 'invalid_type', 'edits[].blockId')
      if (Object.hasOwn(edit, 'text') && !isNonEmptyString(edit.text)) return fail(branch, 'invalid_type', 'edits[].text')
      if (Object.hasOwn(edit, 'supersedesSourceBlockId') && Object.hasOwn(edit, 'supersededSourceText')
        && ((edit.supersedesSourceBlockId === null) !== (edit.supersededSourceText === null))) return fail(branch, 'invalid_union_branch', 'edits[].supersededSourceText')
    }
    return fail(branch, 'unknown_protocol_failure')
  }

  if (branch === 'MISSING_INPUT') {
    if (!Object.hasOwn(value, 'missingInputs')) return fail(branch, 'missing_required_field', 'missingInputs')
    if (!Array.isArray(value.missingInputs) || value.missingInputs.length === 0) return fail(branch, 'invalid_array_shape', 'missingInputs')
    if (!hasExactKeys(value, ['status', 'missingInputs'])) return fail(branch, 'invalid_object_shape', 'response')
    const ids = new Set<string>()
    for (const input of value.missingInputs) {
      if (!isRecord(input)) continue
      if (typeof input.id === 'string') {
        if (ids.has(input.id)) return fail(branch, 'invalid_union_branch', 'missingInputs[].id')
        ids.add(input.id)
      }
      if (input.kind === 'choice' && (!Array.isArray(input.options) || input.options.length < 2)) return fail(branch, 'invalid_array_shape', 'missingInputs[].options')
      if (input.kind !== 'choice' && typeof input.answerKind === 'string' && !ANSWER_KINDS.has(input.answerKind as MissingInputAnswerKind)) return fail(branch, 'invalid_enum', 'missingInputs[].answerKind')
      if (input.subject && isRecord(input.subject) && participantKeys && typeof input.subject.participantKey === 'string'
        && !participantKeys.has(input.subject.participantKey)) return fail(branch, 'invalid_union_branch', 'missingInputs[].subject.participantKey')
    }
    return fail(branch, 'unknown_protocol_failure')
  }

  if (!Object.hasOwn(value, 'conflicts')) return fail(branch, 'missing_required_field', 'conflicts')
  if (!Array.isArray(value.conflicts) || value.conflicts.length === 0) return fail(branch, 'invalid_array_shape', 'conflicts')
  if (!hasExactKeys(value, ['status', 'conflicts'])) return fail(branch, 'invalid_object_shape', 'response')
  if (!value.conflicts.every(isNonEmptyString)) return fail(branch, 'invalid_type', 'conflicts[]')
  return fail(branch, 'unknown_protocol_failure')
}

/** Runtime boundary for the independent reviewer response. */
export function isReviewResponse(value: unknown): value is ReviewResponse {
  if (!isRecord(value)) return false
  if (value.status === 'PASS') return hasExactKeys(value, ['status'])
  if (value.status === 'FAIL') {
    return hasExactKeys(value, ['status', 'findings'])
      && isStringList(value.findings)
      && value.findings.length > 0
  }
  return false
}

/** Runtime boundary for structured candidate-review findings. */
export function isCandidateReviewResponse(value: unknown): value is CandidateReviewResponse {
  if (!isRecord(value)) return false
  if (value.status === 'PASS') return hasExactKeys(value, ['status'])
  if (value.status !== 'FAIL' || !hasExactKeys(value, ['status', 'findings'])
    || !Array.isArray(value.findings) || value.findings.length === 0) return false
  const allowed = new Set<string>(REVIEWER_FINDING_CATEGORIES)
  const allowedRuleIds = new Set<string>(REVIEWER_FINDING_RULE_IDS)
  return value.findings.every((finding) => isRecord(finding)
    && hasExactKeys(finding, ['category', 'ruleId', 'message'])
    && typeof finding.category === 'string' && allowed.has(finding.category)
    && typeof finding.ruleId === 'string' && allowedRuleIds.has(finding.ruleId)
    && isNonEmptyString(finding.message))
}

/** Deliberately projects away all free-text Reviewer messages before telemetry. */
export function safeReviewerFindingSummary(response: CandidateReviewResponse): SafeReviewerFindingSummary | null {
  if (response.status === 'PASS') return null
  const categories = [...new Set(response.findings.map(({ category }) => category))].sort()
  const ruleIds = response.findings.map(({ ruleId }) => ruleId).sort()
  return { findingCount: response.findings.length, findingCategories: categories, findingRuleIds: ruleIds }
}
