import {
  isMissingInput,
  isMissingInputList,
  type ContractGenerationAnswer,
  type MissingInput,
} from './generationProtocol.ts'

export type ContractGenerationSessionState =
  | 'processing'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'abandoned'

/** Durable continuation metadata only; current normalized legal authority is rebuilt for every run. */
export type ContractGenerationSession = {
  id: string
  ownerUserId: string
  weddingId: string
  templateId: string
  templateVersionId: string
  sourceSha256: string
  state: ContractGenerationSessionState
  missingInputs: MissingInput[]
  /** Every distinct requirement definition emitted in this session, including answered rounds. */
  missingInputHistory: MissingInput[]
  /** False only when stored history is malformed; such sessions must fail before provider execution. */
  missingInputHistoryValid?: boolean
  answers: ContractGenerationAnswer[]
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export type ResolvedMissingInput = {
  requirement: MissingInput
  answer: { value: string }
}

export type StoredMissingInputState = {
  version: 1
  pending: MissingInput[]
  history: MissingInput[]
}

export function storeMissingInputState(pending: MissingInput[], history: MissingInput[]): StoredMissingInputState {
  return { version: 1, pending, history }
}

/** Read the legacy array shape while preserving its definitions; reject malformed newer envelopes. */
export function readMissingInputState(value: unknown): StoredMissingInputState | null {
  if (Array.isArray(value)) {
    if (!value.every((item) => isMissingInput(item))) return null
    return { version: 1, pending: value, history: value }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const stored = value as Record<string, unknown>
  if (Object.keys(stored).length !== 3 || stored.version !== 1
    || !Array.isArray(stored.pending) || !stored.pending.every((item) => isMissingInput(item))
    || !Array.isArray(stored.history) || !stored.history.every((item) => isMissingInput(item))) return null
  const pending = stored.pending as MissingInput[]
  const history = stored.history as MissingInput[]
  if (new Set(history.map((item) => item.id)).size !== history.length
    || new Set(pending.map((item) => item.id)).size !== pending.length) return null
  const byId = new Map(history.map((item) => [item.id, item]))
  if (!pending.every((item) => sameMissingInput(byId.get(item.id), item))) return null
  return { version: 1, pending, history }
}

export function appendMissingInputHistory(
  history: readonly MissingInput[],
  emitted: readonly MissingInput[],
): MissingInput[] | null {
  const ids = new Set<string>()
  for (const requirement of history) {
    if (!isMissingInput(requirement) || ids.has(requirement.id)) return null
    ids.add(requirement.id)
  }
  for (const requirement of emitted) {
    if (!isMissingInput(requirement) || ids.has(requirement.id)) return null
    ids.add(requirement.id)
  }
  return [...history, ...emitted]
}

export function resolveMissingInputAnswers(
  history: readonly MissingInput[],
  answers: readonly ContractGenerationAnswer[],
): ResolvedMissingInput[] | null {
  const requirements = new Map<string, MissingInput>()
  for (const requirement of history) {
    if (!isMissingInput(requirement) || requirements.has(requirement.id)) return null
    requirements.set(requirement.id, requirement)
  }
  const seenAnswers = new Set<string>()
  const resolved: ResolvedMissingInput[] = []
  for (const answer of answers) {
    if (!isAnswer(answer) || seenAnswers.has(answer.missingInputId)) return null
    const requirement = requirements.get(answer.missingInputId)
    if (!requirement || !answer.value.trim()) return null
    seenAnswers.add(answer.missingInputId)
    resolved.push({ requirement, answer: { value: answer.value } })
  }
  return resolved
}

function sameMissingInput(left: MissingInput | undefined, right: MissingInput): boolean {
  return Boolean(left && left.id === right.id && left.label === right.label && left.answerKind === right.answerKind
    && JSON.stringify(left.subject) === JSON.stringify(right.subject))
}

export type ContractGenerationSessionScope = Pick<
  ContractGenerationSession,
  'ownerUserId' | 'weddingId' | 'templateId' | 'templateVersionId' | 'sourceSha256'
>

export type SessionAnswerValidation =
  | { ok: true; answers: ContractGenerationAnswer[] }
  | { ok: false; reason: 'session_not_awaiting_input' | 'session_expired' | 'missing_input_set_invalid' | 'unknown_requirement' | 'duplicate_answer' | 'blank_answer' | 'incomplete_answers' }

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSessionState(value: unknown): value is ContractGenerationSessionState {
  return value === 'processing' || value === 'awaiting_input' || value === 'completed' || value === 'failed' || value === 'abandoned'
}

function isAnswer(value: unknown): value is ContractGenerationAnswer {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && nonBlank((value as Record<string, unknown>).missingInputId)
    && typeof (value as Record<string, unknown>).value === 'string')
}

export function isContractGenerationSession(value: unknown): value is ContractGenerationSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const session = value as Record<string, unknown>
  const expectedKeys = ['id', 'ownerUserId', 'weddingId', 'templateId', 'templateVersionId', 'sourceSha256', 'state', 'missingInputs', 'missingInputHistory', 'answers', 'expiresAt', 'createdAt', 'updatedAt']
  const optionalKeys = ['missingInputHistoryValid']
  if (Object.keys(session).length !== expectedKeys.length + (Object.hasOwn(session, 'missingInputHistoryValid') ? 1 : 0)
    || expectedKeys.some((key) => !Object.hasOwn(session, key))
    || Object.keys(session).some((key) => !expectedKeys.includes(key) && !optionalKeys.includes(key))) return false
  if (Object.hasOwn(session, 'missingInputHistoryValid') && typeof session.missingInputHistoryValid !== 'boolean') return false
  if (!nonBlank(session.id) || !nonBlank(session.ownerUserId) || !nonBlank(session.weddingId)
    || !nonBlank(session.templateId) || !nonBlank(session.templateVersionId)
    || !(typeof session.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(session.sourceSha256))
    || !isSessionState(session.state)
    || !Array.isArray(session.missingInputs) || !session.missingInputs.every((item) => isMissingInput(item))
    || !Array.isArray(session.missingInputHistory) || !session.missingInputHistory.every((item) => isMissingInput(item))
    || session.missingInputHistoryValid === false
    || !Array.isArray(session.answers) || !session.answers.every((answer) => isAnswer(answer) && Boolean(answer.value.trim()))
    || !nonBlank(session.expiresAt) || !nonBlank(session.createdAt) || !nonBlank(session.updatedAt)) return false
  const answerIds = (session.answers as ContractGenerationAnswer[]).map((answer) => answer.missingInputId)
  const missingIds = (session.missingInputs as MissingInput[]).map((item) => item.id)
  const historyIds = (session.missingInputHistory as MissingInput[]).map((item) => item.id)
  const historyById = new Map((session.missingInputHistory as MissingInput[]).map((item) => [item.id, item]))
  return new Set(answerIds).size === answerIds.length
    && new Set(missingIds).size === missingIds.length
    && new Set(historyIds).size === historyIds.length
    && (session.missingInputs as MissingInput[]).every((item) => sameMissingInput(historyById.get(item.id), item))
    && resolveMissingInputAnswers(session.missingInputHistory as MissingInput[], session.answers as ContractGenerationAnswer[]) !== null
    && (session.state !== 'awaiting_input' || (session.missingInputs as MissingInput[]).length > 0)
}

/** Input IDs are compared as opaque values; no parsing or field mapping is performed. */
export function sessionMatchesScope(
  session: ContractGenerationSession,
  expected: ContractGenerationSessionScope,
): boolean {
  return session.ownerUserId === expected.ownerUserId
    && session.weddingId === expected.weddingId
    && session.templateId === expected.templateId
    && session.templateVersionId === expected.templateVersionId
    && session.sourceSha256 === expected.sourceSha256
}

export function canResumeContractGenerationSession(
  session: ContractGenerationSession,
  expected: ContractGenerationSessionScope,
  now = new Date(),
): boolean {
  return session.state === 'awaiting_input'
    && sessionMatchesScope(session, expected)
    && Number.isFinite(Date.parse(session.expiresAt))
    && Date.parse(session.expiresAt) > now.getTime()
}

/** Bridge opaque session answer IDs into the existing normalized input adapter. */
export function answersForContractGenerationInput(
  answers: readonly ContractGenerationAnswer[],
): Array<{ id: string; value: string }> {
  return answers.map(({ missingInputId, value }) => ({ id: missingInputId, value }))
}

/** Accepts the complete current form submission and keeps it separate from canonical CRM fields. */
export function acceptSessionAnswers(
  session: ContractGenerationSession,
  submitted: readonly ContractGenerationAnswer[],
  now = new Date(),
): SessionAnswerValidation {
  if (session.state !== 'awaiting_input') return { ok: false, reason: 'session_not_awaiting_input' }
  if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now.getTime()) {
    return { ok: false, reason: 'session_expired' }
  }
  if (!isMissingInputList(session.missingInputs)) return { ok: false, reason: 'missing_input_set_invalid' }
  const requirements = new Set(session.missingInputs.map((item) => item.id))
  const existing = new Set(session.answers.map((answer) => answer.missingInputId))
  const received = new Set<string>()
  for (const answer of submitted) {
    if (!isAnswer(answer)) return { ok: false, reason: 'unknown_requirement' }
    if (existing.has(answer.missingInputId) || received.has(answer.missingInputId)) {
      return { ok: false, reason: 'duplicate_answer' }
    }
    if (!requirements.has(answer.missingInputId)) {
      return { ok: false, reason: 'unknown_requirement' }
    }
    if (!answer.value.trim()) return { ok: false, reason: 'blank_answer' }
    received.add(answer.missingInputId)
  }
  if (received.size !== requirements.size) return { ok: false, reason: 'incomplete_answers' }
  return {
    ok: true,
    answers: [...session.answers, ...submitted.map((answer) => ({
      missingInputId: answer.missingInputId,
      value: answer.value.trim(),
    }))],
  }
}
