import {
  acceptSessionAnswers,
  canResumeContractGenerationSession,
  sessionMatchesScope,
  type ContractGenerationSession,
  type ContractGenerationSessionScope,
} from './generationSession.ts'
import type { ContractGenerationAnswer, MissingInput } from './generationProtocol.ts'

export type ContractGenerationStartRequest = { weddingId: string; requestId: string }
export type ContractGenerationContinueRequest = {
  sessionId: string
  answers: ContractGenerationAnswer[]
}
export type ContractGenerationRecoverRequest = {
  weddingId: string
  sessionId?: string
  requestId?: string
}
export type ContractGenerationCandidateRequest = {
  weddingId: string
  candidateId: string
}

export type ContractGenerationBoundaryResponse =
  | { status: 'awaiting_input'; sessionId: string; missingInputs: MissingInput[] }
  | { status: 'ready'; sessionId: string; candidateId: string; templateId: string; templateVersionId: string }
  | { status: 'processing'; sessionId: string }
  | { status: 'unresolved_conflict'; sessionId: string; message: string }
  | { status: 'precondition'; code: 'setup_required' }
  | { status: 'error'; code: 'unauthorized' | 'forbidden' }
  | { status: 'stale'; code: 'authority_changed' | 'session_invalid' }
  | { status: 'failure'; code: 'generation_safety' | 'temporary_failure' }

export type BoundaryCandidate = { bytes: ArrayBuffer; changedBlocks: unknown[] }
export type BoundaryRunResult =
  | { status: 'MISSING_INPUT'; missingInputs: MissingInput[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }
  | { status: 'FAILED' }
  | { status: 'READY'; candidate: BoundaryCandidate }

export type ServerBoundaryContext = {
  scope: ContractGenerationSessionScope
  sourceBytes: ArrayBuffer
  sourceSha256: string
  authorityFingerprint: string
  /** Built afresh from current server records for this single Generator invocation. */
  authority: unknown
}

export type ServerBoundaryDependencies = {
  now?: () => Date
  loadContext: (userId: string, weddingId: string, answers: ContractGenerationAnswer[]) => Promise<ServerBoundaryContext | null>
  createSession: (input: {
    userId: string
    weddingId: string
    requestId: string
    scope: ContractGenerationSessionScope
    sourceSha256: string
    authorityFingerprint: string
    executionId: string
  }) => Promise<ContractGenerationSession | null>
  getSession: (sessionId: string) => Promise<ContractGenerationSession | null>
  getSessionByIdempotencyKey: (userId: string, requestId: string) => Promise<ContractGenerationSession | null>
  getAuthorityFingerprint: (userId: string, sessionId: string) => Promise<string | null>
  claimContinuation: (input: { sessionId: string; userId: string; executionId: string }) => Promise<ContractGenerationSession | null>
  saveMissing: (input: { sessionId: string; executionId: string; missingInputs: MissingInput[]; answers: ContractGenerationAnswer[]; authorityFingerprint: string }) => Promise<boolean>
  persistAcceptedCandidate: (input: { sessionId: string; executionId: string; candidate: BoundaryCandidate; authorityFingerprint: string }) => Promise<string | null>
  markFailure: (sessionId: string, executionId: string, code: 'failed' | 'stale') => Promise<void>
  generate: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[]) => Promise<BoundaryRunResult>
  verifyConflict: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[], conflicts: string[]) => Promise<'confirmed' | 'rejected'>
  review: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[], candidate: BoundaryCandidate) => Promise<'pass' | 'fail'>
  newId: () => string
}

function validStartRequest(value: unknown): value is ContractGenerationStartRequest {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof (value as Record<string, unknown>).weddingId === 'string'
    && typeof (value as Record<string, unknown>).requestId === 'string'
    && (value as Record<string, string>).weddingId.trim()
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((value as Record<string, string>).requestId))
}

function validContinueRequest(value: unknown): value is ContractGenerationContinueRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 2 && typeof item.sessionId === 'string' && item.sessionId.trim().length > 0
    && Array.isArray(item.answers) && item.answers.every((answer) => {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false
      const row = answer as Record<string, unknown>
      return Object.keys(row).length === 2 && typeof row.missingInputId === 'string'
        && typeof row.value === 'string'
    })
}

function validRecoverRequest(value: unknown): value is ContractGenerationRecoverRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const hasSessionId = typeof item.sessionId === 'string' && item.sessionId.trim().length > 0
  const hasRequestId = typeof item.requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)
  return typeof item.weddingId === 'string' && item.weddingId.trim().length > 0
    && (hasSessionId !== hasRequestId)
    && Object.keys(item).length === 2
}

function validCandidateRequest(value: unknown): value is ContractGenerationCandidateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 2
    && typeof item.weddingId === 'string' && item.weddingId.trim().length > 0
    && typeof item.candidateId === 'string' && item.candidateId.trim().length > 0
}

/** One provider invocation per request; all authority is freshly loaded by loadContext. */
export function createContractGenerationBoundary(deps: ServerBoundaryDependencies) {
  const now = deps.now ?? (() => new Date())

  async function execute(
    session: ContractGenerationSession,
    context: ServerBoundaryContext,
    answers: ContractGenerationAnswer[],
    executionId: string,
  ): Promise<ContractGenerationBoundaryResponse> {
    try {
      const generated = await deps.generate(context, answers)
      if (generated.status === 'MISSING_INPUT') {
        if (!generated.missingInputs.length || new Set(generated.missingInputs.map((item) => item.id)).size !== generated.missingInputs.length) {
          await deps.markFailure(session.id, executionId, 'failed')
          return { status: 'failure', code: 'generation_safety' }
        }
        const saved = await deps.saveMissing({
          sessionId: session.id,
          executionId,
          missingInputs: generated.missingInputs,
          answers,
          authorityFingerprint: context.authorityFingerprint,
        })
        if (!saved) await deps.markFailure(session.id, executionId, 'failed')
        return saved
          ? { status: 'awaiting_input', sessionId: session.id, missingInputs: generated.missingInputs }
          : { status: 'failure', code: 'temporary_failure' }
      }
      if (generated.status === 'CONFLICT_INPUT') {
        const verification = await deps.verifyConflict(context, answers, generated.conflicts)
        await deps.markFailure(session.id, executionId, 'failed')
        return verification === 'confirmed'
          ? { status: 'unresolved_conflict', sessionId: session.id, message: 'The contract contains an unresolved conflict. Review the source details before generating again.' }
          : { status: 'failure', code: 'generation_safety' }
      }
      if (generated.status === 'FAILED') {
        await deps.markFailure(session.id, executionId, 'failed')
        return { status: 'failure', code: 'generation_safety' }
      }

      // The current state is reloaded after Generator execution. Never accept a
      // candidate if any relevant authority or the source has changed.
      const latest = await deps.loadContext(session.ownerUserId, session.weddingId, answers)
      if (!latest || !sessionMatchesScope(session, latest.scope)
        || latest.sourceSha256 !== session.sourceSha256
        || latest.authorityFingerprint !== context.authorityFingerprint) {
        await deps.markFailure(session.id, executionId, 'stale')
        return { status: 'stale', code: 'authority_changed' }
      }
      if (await deps.review(latest, answers, generated.candidate) !== 'pass') {
        await deps.markFailure(session.id, executionId, 'failed')
        return { status: 'failure', code: 'generation_safety' }
      }
      const beforePersist = await deps.loadContext(session.ownerUserId, session.weddingId, answers)
      if (!beforePersist || !sessionMatchesScope(session, beforePersist.scope)
        || beforePersist.sourceSha256 !== session.sourceSha256
        || beforePersist.authorityFingerprint !== context.authorityFingerprint) {
        await deps.markFailure(session.id, executionId, 'stale')
        return { status: 'stale', code: 'authority_changed' }
      }
      const candidateId = await deps.persistAcceptedCandidate({
        sessionId: session.id,
        executionId,
        candidate: generated.candidate,
        authorityFingerprint: context.authorityFingerprint,
      })
      if (!candidateId) await deps.markFailure(session.id, executionId, 'failed')
      return candidateId
        ? { status: 'ready', sessionId: session.id, candidateId, templateId: session.templateId, templateVersionId: session.templateVersionId }
        : { status: 'failure', code: 'temporary_failure' }
    } catch {
      await deps.markFailure(session.id, executionId, 'failed').catch(() => undefined)
      return { status: 'failure', code: 'temporary_failure' }
    }
  }

  return {
    async start(userId: string, request: unknown): Promise<ContractGenerationBoundaryResponse> {
      if (!validStartRequest(request)) return { status: 'failure', code: 'generation_safety' }
      const context = await deps.loadContext(userId, request.weddingId.trim(), [])
      if (!context) return { status: 'precondition', code: 'setup_required' }
      if (context.scope.ownerUserId !== userId || context.scope.weddingId !== request.weddingId.trim()
        || context.scope.sourceSha256 !== context.sourceSha256) return { status: 'stale', code: 'session_invalid' }
      const existing = await deps.getSessionByIdempotencyKey(userId, request.requestId)
      if (existing) return existingStartResult(existing, userId, request.weddingId.trim(), context.scope, now())
      const executionId = deps.newId()
      const session = await deps.createSession({
        userId,
        weddingId: request.weddingId.trim(),
        requestId: request.requestId,
        scope: context.scope,
        sourceSha256: context.sourceSha256,
        authorityFingerprint: context.authorityFingerprint,
        executionId,
      })
      if (!session) {
        const replay = await deps.getSessionByIdempotencyKey(userId, request.requestId)
        return replay
          ? existingStartResult(replay, userId, request.weddingId.trim(), context.scope, now())
          : { status: 'stale', code: 'session_invalid' }
      }
      return execute(session, context, [], executionId)
    },

    async continue(userId: string, request: unknown): Promise<ContractGenerationBoundaryResponse> {
      if (!validContinueRequest(request)) return { status: 'failure', code: 'generation_safety' }
      const current = await deps.getSession(request.sessionId)
      if (!current || current.ownerUserId !== userId) return { status: 'stale', code: 'session_invalid' }
      if (!canResumeContractGenerationSession(current, current, now())) return { status: 'stale', code: 'session_invalid' }
      const accepted = acceptSessionAnswers(current, request.answers, now())
      if (!accepted.ok) return { status: 'stale', code: 'session_invalid' }
      const executionId = deps.newId()
      const session = await deps.claimContinuation({ sessionId: request.sessionId, userId, executionId })
      if (!session) return { status: 'stale', code: 'session_invalid' }
      let context: ServerBoundaryContext | null
      try {
        context = await deps.loadContext(userId, current.weddingId, accepted.answers)
      } catch {
        await deps.markFailure(current.id, executionId, 'failed')
        return { status: 'failure', code: 'temporary_failure' }
      }
      if (!context || !sessionMatchesScope(current, context.scope)
        || context.sourceSha256 !== current.sourceSha256) {
        await deps.markFailure(current.id, executionId, 'stale')
        return { status: 'stale', code: 'session_invalid' }
      }
      return execute(session, context, accepted.answers, executionId)
    },

    async recover(userId: string, request: unknown): Promise<ContractGenerationBoundaryResponse> {
      if (!validRecoverRequest(request)) return { status: 'failure', code: 'generation_safety' }
      const session = request.sessionId
        ? await deps.getSession(request.sessionId)
        : await deps.getSessionByIdempotencyKey(userId, request.requestId!)
      if (!session || session.ownerUserId !== userId || session.weddingId !== request.weddingId) {
        return { status: 'stale', code: 'session_invalid' }
      }
      if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now().getTime()) {
        return { status: 'stale', code: 'session_invalid' }
      }
      if (session.state === 'processing') return { status: 'processing', sessionId: session.id }
      if (session.state !== 'awaiting_input' && session.state !== 'completed') {
        return { status: 'stale', code: 'session_invalid' }
      }
      const [context, savedFingerprint] = await Promise.all([
        deps.loadContext(userId, session.weddingId, session.answers),
        deps.getAuthorityFingerprint(userId, session.id),
      ])
      if (!context || !sessionMatchesScope(session, context.scope)
        || context.sourceSha256 !== session.sourceSha256
        || !savedFingerprint || context.authorityFingerprint !== savedFingerprint) {
        return { status: 'stale', code: 'authority_changed' }
      }
      if (session.state === 'awaiting_input') {
        if (!canResumeContractGenerationSession(session, context.scope, now())) {
          return { status: 'stale', code: 'session_invalid' }
        }
        return { status: 'awaiting_input', sessionId: session.id, missingInputs: session.missingInputs }
      }
      return { status: 'ready', sessionId: session.id, candidateId: session.id, templateId: session.templateId, templateVersionId: session.templateVersionId }
    },
  }
}

function existingStartResult(
  session: ContractGenerationSession,
  userId: string,
  weddingId: string,
  scope: ContractGenerationSessionScope,
  now: Date,
): ContractGenerationBoundaryResponse {
  if (session.ownerUserId !== userId || session.weddingId !== weddingId || !sessionMatchesScope(session, scope)) {
    return { status: 'stale', code: 'session_invalid' }
  }
  if (session.state === 'awaiting_input' && canResumeContractGenerationSession(session, scope, now)) {
    return { status: 'awaiting_input', sessionId: session.id, missingInputs: session.missingInputs }
  }
  if (session.state === 'completed') return { status: 'ready', sessionId: session.id, candidateId: session.id, templateId: session.templateId, templateVersionId: session.templateVersionId }
  return { status: 'failure', code: 'temporary_failure' }
}

export function parseContractGenerationAction(value: unknown):
  | { action: 'start'; request: ContractGenerationStartRequest }
  | { action: 'continue'; request: ContractGenerationContinueRequest }
  | { action: 'recover'; request: ContractGenerationRecoverRequest }
  | { action: 'candidate'; request: ContractGenerationCandidateRequest }
  | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const envelope = value as Record<string, unknown>
  if (Object.keys(envelope).length !== 3 || envelope.version !== 1) return null
  if (envelope.action === 'start' && validStartRequest(envelope.request)) return { action: 'start', request: envelope.request }
  if (envelope.action === 'continue' && validContinueRequest(envelope.request)) return { action: 'continue', request: envelope.request }
  if (envelope.action === 'recover' && validRecoverRequest(envelope.request)) return { action: 'recover', request: envelope.request }
  if (envelope.action === 'candidate' && validCandidateRequest(envelope.request)) return { action: 'candidate', request: envelope.request }
  return null
}
