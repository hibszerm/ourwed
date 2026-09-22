/**
 * Production-equivalent local invoke for CG2.
 * Uses the SAME prompt/schema/token/retry policy as
 * supabase/functions/ai-contract-full-rewrite.
 *
 * Does NOT use Supabase Edge auth (CRM-clean).
 * Requires OPENAI_API_KEY in the process environment (owner-injected).
 */

import {
  SYSTEM_PROMPT,
  buildUserPayload,
  computeMaxOutputTokens,
  shouldRetryIncomplete,
  resolveModelFromEnv,
  FULL_AI_PROMPT_VERSION,
  FULL_AI_RESPONSE_VERSION,
} from '../fullAiRewritePromptShared'
import {
  buildFullAiJsonSchemaForBlockIds,
  normalizeIdenticalChangedBlockDuplicates,
} from '../blockIdIntegrity'
import {
  buildProtocolIntegrityRetryHint,
  collectProtocolIntegrityViolations,
  findDestructiveEmptyReplacements,
} from '../sparseProtocolIntegrity'
import { parseSparseV2FromResponse } from '../parseSparseV2Response'
import type { TransformFunctionsInvoke } from '../transformApi'
import { buildProviderRequestIdentityDiagnostics, type ProviderRequestIdentityDiagnostics } from '../providerRequestIdentityDiagnostics'

function resolveModel(): string {
  return resolveModelFromEnv((name) => process.env[name])
}

export type Cg2InvokeUsage = {
  calls: number
  retries: number
  inputTokens: number
  outputTokens: number
  latenciesMs: number[]
  model: string
  promptVersion: string
  providerRequestIdentityDiagnostics?: ProviderRequestIdentityDiagnostics
  protocolDiagnostics?: Array<{
    responseAttempt: number
    needsProtocolRetry: boolean
    violationKinds: string[]
    affectedBlockIds: Array<{ blockId: string; sourceExists: boolean; replacementEmpty: boolean; replacementLength: number; protected: boolean }>
    changedBlocksCount: number
    normalizedChangedBlocksCount: number
    financeEvidenceCount: number
    retryRequested: boolean
    financeEvidence: Array<{ sourceBlockId: string; financeConcept: string }>
    dateEvidenceCount: number
    dateEvidence: Array<{ sourceBlockId: string; dateConcept: string }>
    duplicateChangedBlocks?: Array<{
      blockId: string
      occurrenceCount: number
      duplicateClassification: 'IDENTICAL' | 'CONFLICTING'
      allFingerprintsEqual: boolean
      identicalNormalizationApplied: boolean
      normalizedOccurrenceCount: number
      occurrences: Array<{ blockId: string; occurrenceIndex: number; replacementLength: number; fingerprint: string; sourceExists: boolean; protected?: boolean; replacementEmpty: boolean }>
    }>
  }>
}

export function createUsageTracker(): Cg2InvokeUsage {
  return {
    calls: 0,
    retries: 0,
    inputTokens: 0,
    outputTokens: 0,
    latenciesMs: [],
    model: resolveModel(),
    promptVersion: FULL_AI_PROMPT_VERSION,
    protocolDiagnostics: [],
  }
}

function readUsage(body: unknown): { input?: number; output?: number } {
  if (!body || typeof body !== 'object') return {}
  const usage = (body as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return {}
  const u = usage as Record<string, unknown>
  return {
    input:
      typeof u.input_tokens === 'number'
        ? u.input_tokens
        : typeof u.prompt_tokens === 'number'
          ? u.prompt_tokens
          : undefined,
    output:
      typeof u.output_tokens === 'number'
        ? u.output_tokens
        : typeof u.completion_tokens === 'number'
          ? u.completion_tokens
          : undefined,
  }
}

async function callOpenAi(input: {
  apiKey: string
  model: string
  maxOutputTokens: number
  userPayload: string
  validBlockIds: readonly string[]
  extraUserHint?: string
}): Promise<{ ok: true; body: unknown } | { ok: false; httpStatus: number; body: unknown }> {
  const userContent = input.extraUserHint
    ? `${input.userPayload}\n\n${input.extraUserHint}`
    : input.userPayload
  const schema = buildFullAiJsonSchemaForBlockIds(input.validBlockIds)
  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_output_tokens: input.maxOutputTokens,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schema.name,
          strict: true,
          schema: schema.schema,
        },
      },
    }),
  })
  const body = await openaiRes.json()
  if (!openaiRes.ok) return { ok: false, httpStatus: openaiRes.status, body }
  return { ok: true, body }
}

export function safeProviderDiagnostic(httpStatus: number, body: unknown): string {
  const root = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const error = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : root
  const type = typeof error.type === 'string' ? error.type : typeof error.code === 'string' ? error.code : 'provider_error'
  const message = typeof error.message === 'string'
    ? error.message.replace(/[\r\n]+/g, ' ').replace(/(?:authorization|bearer|api[_-]?key|secret|token)\s*[:=]?\s*\S+/gi, '[redacted]').slice(0, 500)
    : 'request rejected'
  return `OpenAI HTTP ${httpStatus} ${type}: ${message}`
}

const PARSE_RETRY_HINT =
  'Return ONLY valid JSON matching the schema. Use changedBlocks for sparse edits and always include financeEvidence and dateEvidence (null when none). No markdown.'

/**
 * Factory: returns an invoke compatible with runSparseProductTransform / runFullAiRewrite.
 */
export function createLocalFullRewriteInvoke(input: {
  apiKey: string
  usage: Cg2InvokeUsage
  maxPaidCalls?: number
}): TransformFunctionsInvoke {
  const { apiKey, usage, maxPaidCalls } = input
  const model = resolveModel()
  usage.model = model

  return async (functionName, options) => {
    if (functionName !== 'ai-contract-full-rewrite') {
      return {
        data: null,
        error: { message: `unexpected function ${functionName}` },
      }
    }

    const body = options.body
    const documentBlocks = Array.isArray(body.documentBlocks)
      ? (body.documentBlocks as Array<Record<string, unknown>>)
      : []
    if (documentBlocks.length === 0) {
      return {
        data: {
          ok: false,
          error: { code: 'invalid_request', message: 'documentBlocks required' },
        },
        error: null,
      }
    }

    const slim = documentBlocks.map((b) => ({
      blockId: String(b.blockId),
      text: String(b.text ?? ''),
      kind: b.kind,
      paragraphIndex: b.paragraphIndex,
      tableIndex: b.tableIndex,
      rowIndex: b.rowIndex,
      cellIndex: b.cellIndex,
      tableContext: b.tableContext,
      modelContext: b.modelContext,
    }))
    const userPayload = buildUserPayload({
      documentBlocks: slim,
      transformationDataset: body.transformationDataset ?? {},
      protectedDataSummary:
        body.protectedDataSummary && typeof body.protectedDataSummary === 'object'
          ? (body.protectedDataSummary as {
              exactCount: number
              patternCount: number
            })
          : { exactCount: 0, patternCount: 0 },
      requiredReplacements: body.requiredReplacements ?? [],
      structuralContext: body.structuralContext,
    })

    const sourceCharacterCount = slim.reduce((n, b) => n + b.text.length, 0)
    const validBlockIds = slim
      .filter((b) => (b.modelContext as { modelEditable?: boolean } | undefined)?.modelEditable !== false)
      .map((b) => b.blockId)
    // Structural-only snapshot immediately before the provider call. Never persist the payload or text.
    usage.providerRequestIdentityDiagnostics = buildProviderRequestIdentityDiagnostics({
      sourceBlocks: slim,
      editableBlockIds: validBlockIds,
      otherContext: {
        structuralContext: body.structuralContext,
        requiredReplacements: body.requiredReplacements,
        transformationDataset: body.transformationDataset,
      },
    })
    let budgetExhausted = false
    const invokeProvider = async (args: Parameters<typeof callOpenAi>[0]) => {
      if (maxPaidCalls !== undefined && usage.calls >= maxPaidCalls) {
        budgetExhausted = true
        return { ok: false as const, budgetExhausted: true as const, httpStatus: 0, body: null }
      }
      usage.calls += 1
      return { ...(await callOpenAi(args)), budgetExhausted: false as const }
    }
    let configuredMaxOutputTokens = computeMaxOutputTokens({
      blockCount: slim.length,
      characterCount: sourceCharacterCount,
      attempt: 1,
    })

    const t0 = Date.now()
    const first = await invokeProvider({
      apiKey,
      model,
      maxOutputTokens: configuredMaxOutputTokens,
      userPayload,
      validBlockIds,
    })
    if (!first.ok) {
      usage.latenciesMs.push(Date.now() - t0)
      return {
        data: {
          ok: false,
          error: {
            code: first.budgetExhausted ? 'paid_call_budget_exhausted' : 'provider_api_error',
            message: first.budgetExhausted ? 'Paid provider-call budget exhausted' : safeProviderDiagnostic(first.httpStatus, first.body),
            retryable: first.httpStatus >= 500,
          },
        },
        error: null,
      }
    }

    let openaiBody = first.body
    let u = readUsage(openaiBody)
    if (u.input) usage.inputTokens += u.input
    if (u.output) usage.outputTokens += u.output

    let parse = parseSparseV2FromResponse({
      body: openaiBody,
      applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
    })

    const status =
      openaiBody && typeof openaiBody === 'object'
        ? String((openaiBody as Record<string, unknown>).status ?? 'unknown')
        : 'unknown'
    const incompleteReason =
      !parse.ok && parse.code === 'incomplete_response'
        ? parse.incompleteReason
        : undefined

    if (
      !parse.ok &&
      status === 'incomplete' &&
      shouldRetryIncomplete({
        attempt: 1,
        incompleteReason: incompleteReason ?? null,
      })
    ) {
      usage.retries += 1
      configuredMaxOutputTokens = computeMaxOutputTokens({
        blockCount: slim.length,
        characterCount: sourceCharacterCount,
        attempt: 2,
      })
      const second = await invokeProvider({
        apiKey,
        model,
        maxOutputTokens: configuredMaxOutputTokens,
        userPayload,
        validBlockIds,
      })
      if (second.ok) {
        openaiBody = second.body
        u = readUsage(openaiBody)
        if (u.input) usage.inputTokens += u.input
        if (u.output) usage.outputTokens += u.output
        parse = parseSparseV2FromResponse({
          body: openaiBody,
          applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
        })
      }
    }

    if (!parse.ok && parse.code !== 'incomplete_response') {
      usage.retries += 1
      const second = await invokeProvider({
        apiKey,
        model,
        maxOutputTokens: configuredMaxOutputTokens,
        userPayload,
        validBlockIds,
        extraUserHint: PARSE_RETRY_HINT,
      })
      if (second.ok) {
        openaiBody = second.body
        u = readUsage(openaiBody)
        if (u.input) usage.inputTokens += u.input
        if (u.output) usage.outputTokens += u.output
        parse = parseSparseV2FromResponse({
          body: openaiBody,
          applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
        })
      }
    }

    let protocolRetryUsed = false
    let protocolRetryKinds: string[] = []
    let changedBlocks = parse.ok ? parse.changedBlocks : []
    if (parse.ok) {
      const normalized = normalizeIdenticalChangedBlockDuplicates({
        changedBlocks: parse.changedBlocks,
        sourceBlocks: slim,
      })
      changedBlocks = normalized.changedBlocks
      let integrity = collectProtocolIntegrityViolations({
        changedBlocks,
        sourceBlocks: slim,
      })
      usage.protocolDiagnostics!.push({
        responseAttempt: 1,
        needsProtocolRetry: integrity.needsProtocolRetry,
        violationKinds: integrity.violations.map((v) => v.kind),
        affectedBlockIds: integrity.violations.map((v) => {
          const row = changedBlocks.find((b) => b.blockId === v.blockId)
          return { blockId: v.blockId, sourceExists: slim.some((b) => b.blockId === v.blockId), replacementEmpty: row?.text.trim().length === 0, replacementLength: row?.text.length ?? 0, protected: Boolean(slim.find((b) => b.blockId === v.blockId)?.modelContext && (slim.find((b) => b.blockId === v.blockId)!.modelContext as { modelEditable?: boolean }).modelEditable === false) }
        }),
        changedBlocksCount: parse.changedBlocks.length,
        normalizedChangedBlocksCount: changedBlocks.length,
        financeEvidenceCount: parse.financeEvidence.length,
        retryRequested: integrity.needsProtocolRetry,
        financeEvidence: parse.financeEvidence.map((e) => ({ sourceBlockId: e.sourceBlockId, financeConcept: e.financeConcept })),
        dateEvidenceCount: parse.dateEvidence.length,
        dateEvidence: parse.dateEvidence.map((e) => ({ sourceBlockId: e.sourceBlockId, dateConcept: e.dateConcept })),
        duplicateChangedBlocks: normalized.duplicateDiagnostics,
      })
      // CG4 + CG6.1: at most ONE shared protocol-integrity retry
      if (integrity.needsProtocolRetry) {
        usage.retries += 1
        protocolRetryUsed = true
        protocolRetryKinds = [
          ...new Set(integrity.violations.map((v) => v.kind)),
        ]
        const second = await invokeProvider({
          apiKey,
          model,
          maxOutputTokens: configuredMaxOutputTokens,
          userPayload,
          validBlockIds,
          extraUserHint: buildProtocolIntegrityRetryHint({
            violations: integrity.violations,
            allowedBlockIds: validBlockIds,
          }),
        })
        if (second.ok) {
          openaiBody = second.body
          const u2 = readUsage(openaiBody)
          if (u2.input) usage.inputTokens += u2.input
          if (u2.output) usage.outputTokens += u2.output
          const reparse = parseSparseV2FromResponse({
            body: openaiBody,
            applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
          })
          if (reparse.ok) {
            parse = reparse
            const retryNormalized = normalizeIdenticalChangedBlockDuplicates({
              changedBlocks: reparse.changedBlocks,
              sourceBlocks: slim,
            })
            changedBlocks = retryNormalized.changedBlocks
            integrity = collectProtocolIntegrityViolations({
              changedBlocks,
              sourceBlocks: slim,
            })
          }
      }
    }

    if (budgetExhausted) {
      usage.latenciesMs.push(Date.now() - t0)
      return {
        data: {
          ok: false,
          error: {
            code: 'paid_call_budget_exhausted',
            message: 'Paid provider-call budget exhausted before retry',
            retryable: false,
          },
        },
        error: null,
      }
    }

    // Never apply invented IDs — keep valid only (may be empty)
      changedBlocks = integrity.partition.valid

      // CG6.1: never auto-restore-and-pass empty clears — fail closed if still present
      const stillEmpty = findDestructiveEmptyReplacements({
        changedBlocks,
        sourceBlocks: slim,
      })
      if (stillEmpty.length > 0) {
        usage.latenciesMs.push(Date.now() - t0)
        return {
          data: {
            ok: false,
            error: {
              code: 'destructive_empty_replacement',
              message: `empty replacement for non-empty source block: ${stillEmpty.map((e) => e.blockId).join(', ')}`,
              retryable: false,
              protocolRetryUsed,
              protocolRetryKinds,
              offendingBlockIds: stillEmpty.map((e) => e.blockId),
            },
          },
          error: null,
        }
      }
    }

    usage.latenciesMs.push(Date.now() - t0)

    if (!parse.ok) {
      return {
        data: {
          ok: false,
          error: {
            code: parse.code,
            message: parse.message,
            retryable: parse.retryable,
          },
        },
        error: null,
      }
    }

    // Shape expected by transformApi.invokeTransform
    return {
      data: {
        ok: true,
        changedBlocks,
        financeEvidence: parse.financeEvidence,
        dateEvidence: parse.dateEvidence,
        model,
        promptVersion: FULL_AI_PROMPT_VERSION,
        responseVersion: FULL_AI_RESPONSE_VERSION,
        diagnostics: {
          attemptCount: usage.calls,
          configuredMaxOutputTokens,
          sourceBlockCount: slim.length,
          sourceCharacterCount,
          changedBlockCount: changedBlocks.length,
          inputTokens: u.input,
          outputTokens: u.output,
          protocolBlockIdRetryUsed: protocolRetryUsed,
          protocolIntegrityRetryUsed: protocolRetryUsed,
          protocolRetryKinds,
        },
      },
      error: null,
    }
  }
}

export { FULL_AI_PROMPT_VERSION, FULL_AI_RESPONSE_VERSION, SYSTEM_PROMPT }
