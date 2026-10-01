/** Minimal semantic-to-editor protocol for the future Option B generation flow. */
/** Reuse an existing editor block ID; the model treats it only as an opaque handle. */
export type BlockId = string

export type BlockEdit =
  | { kind: 'replace'; blockId: BlockId; text: string }
  | { kind: 'insert_after'; blockId: BlockId; text: string }

export type GenerationResponse =
  | { status: 'READY'; edits: BlockEdit[] }
  | { status: 'MISSING_INPUT'; missingInputs: string[] }
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

function isBlockEdit(value: unknown): value is BlockEdit {
  if (!isRecord(value) || !isNonEmptyString(value.blockId) || !isNonEmptyString(value.text)) return false
  if (value.kind === 'replace' || value.kind === 'insert_after') {
    return hasExactKeys(value, ['kind', 'blockId', 'text'])
  }
  return false
}

/** Runtime boundary for untrusted structured model output; rejects mixed or extended branches. */
export function isGenerationResponse(value: unknown): value is GenerationResponse {
  if (!isRecord(value)) return false
  if (value.status === 'READY') {
    return hasExactKeys(value, ['status', 'edits'])
      && Array.isArray(value.edits)
      && value.edits.every(isBlockEdit)
  }
  if (value.status === 'MISSING_INPUT') {
    return hasExactKeys(value, ['status', 'missingInputs'])
      && isStringList(value.missingInputs)
      && value.missingInputs.length > 0
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
