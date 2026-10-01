/** Minimal semantic-to-editor protocol for the future Option B generation flow. */
/** Reuse an existing editor block ID; the model treats it only as an opaque handle. */
export type BlockId = string

export type BlockEdit =
  | { kind: 'replace'; blockId: BlockId; text: string }
  | { kind: 'insert_after'; blockId: BlockId; text: string }

export type MissingInputAnswerKind = 'text' | 'multiline' | 'date' | 'number' | 'email' | 'phone'

/** Generic presentation metadata; id is opaque and has no CRM/path semantics. */
export type MissingInputSubject = {
  participantKey: string
  displayName?: string
}

export type MissingInput = {
  id: string
  label: string
  answerKind: MissingInputAnswerKind
  subject?: MissingInputSubject
}

/** A user-supplied authoritative value paired with one opaque requirement ID. */
export type ContractGenerationAnswer = {
  missingInputId: string
  value: string
}

export type GenerationResponse =
  | { status: 'READY'; edits: BlockEdit[] }
  | { status: 'MISSING_INPUT'; missingInputs: MissingInput[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }

export type ReviewResponse =
  | { status: 'PASS' }
  | { status: 'FAIL'; findings: string[] }

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
  if (typeof value.answerKind !== 'string' || !ANSWER_KINDS.has(value.answerKind as MissingInputAnswerKind)) return false
  if (value.subject === undefined) return hasExactKeys(value, ['id', 'label', 'answerKind'])
  if (!isRecord(value.subject)) return false
  const subjectKeys = Object.keys(value.subject)
  if (!hasExactKeys(value, ['id', 'label', 'answerKind', 'subject'])
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
  if (value.kind === 'replace' || value.kind === 'insert_after') {
    return hasExactKeys(value, ['kind', 'blockId', 'text'])
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
