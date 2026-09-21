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
} from '../blockIdIntegrity'
import {
  buildProtocolIntegrityRetryHint,
  collectProtocolIntegrityViolations,
  findDestructiveEmptyReplacements,
} from '../sparseProtocolIntegrity'
import { parseSparseV2FromResponse } from '../parseSparseV2Response'
import type { TransformFunctionsInvoke } from '../transformApi'

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

const PARSE_RETRY_HINT =
  'Return ONLY valid JSON matching the schema: { "changedBlocks": [ { "blockId": string, "text": string } ] }. No markdown.'

/**
 * Factory: returns an invoke compatible with runSparseProductTransform / runFullAiRewrite.
 */
export function createLocalFullRewriteInvoke(input: {
  apiKey: string
  usage: Cg2InvokeUsage
}): TransformFunctionsInvoke {
  const { apiKey, usage } = input
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
    let configuredMaxOutputTokens = computeMaxOutputTokens({
      blockCount: slim.length,
      characterCount: sourceCharacterCount,
      attempt: 1,
    })

    const t0 = Date.now()
    usage.calls += 1
    const first = await callOpenAi({
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
            code: 'provider_api_error',
            message: 'OpenAI request failed',
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
      usage.calls += 1
      configuredMaxOutputTokens = computeMaxOutputTokens({
        blockCount: slim.length,
        characterCount: sourceCharacterCount,
        attempt: 2,
      })
      const second = await callOpenAi({
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
      usage.calls += 1
      const second = await callOpenAi({
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
      let integrity = collectProtocolIntegrityViolations({
        changedBlocks: parse.changedBlocks,
        sourceBlocks: slim,
      })
      // CG4 + CG6.1: at most ONE shared protocol-integrity retry
      if (integrity.needsProtocolRetry) {
        usage.retries += 1
        usage.calls += 1
        protocolRetryUsed = true
        protocolRetryKinds = [
          ...new Set(integrity.violations.map((v) => v.kind)),
        ]
        const second = await callOpenAi({
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
            integrity = collectProtocolIntegrityViolations({
              changedBlocks: reparse.changedBlocks,
              sourceBlocks: slim,
            })
          }
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
