/**
 * Client adapter — invokes document-ai-transform Edge Function.
 * Never talks to OpenAI from the browser.
 */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DOCUMENT_TRANSFORM_CONFIG } from './contractTransformConfig'

export interface TransformParagraph {
  index: number
  text: string
}

export interface ContractTransformRequest {
  paragraphs: TransformParagraph[]
  variables: Record<string, Record<string, string>>
  omittedKeys: string[]
  retryNote?: string
}

export interface ContractTransformResponse {
  paragraphs: TransformParagraph[]
}

export class ContractTransformError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ContractTransformError'
    this.code = code
  }
}

async function readHttpErrorBody(error: unknown): Promise<unknown> {
  if (!(error instanceof FunctionsHttpError)) return null
  const ctx = error.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    return await ctx.json()
  } catch {
    return null
  }
}

export async function invokeContractTransform(
  input: ContractTransformRequest,
): Promise<ContractTransformResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    DOCUMENT_TRANSFORM_CONFIG.clientTimeoutMs,
  )

  try {
    const { data, error } = await supabase.functions.invoke(
      DOCUMENT_TRANSFORM_CONFIG.edgeFunctionName,
      {
        body: {
          paragraphs: input.paragraphs,
          variables: input.variables,
          omittedKeys: input.omittedKeys,
          retryNote: input.retryNote,
          promptVersion: DOCUMENT_TRANSFORM_CONFIG.promptVersion,
          schemaVersion: DOCUMENT_TRANSFORM_CONFIG.schemaVersion,
        },
      },
    )

    if (error) {
      const body = await readHttpErrorBody(error)
      const payload =
        body && typeof body === 'object'
          ? (body as { error?: { code?: string; message?: string } }).error
          : null
      throw new ContractTransformError(
        payload?.code ?? 'provider_unavailable',
        payload?.message ??
          'Nie udało się przetransformować umowy (AI).',
      )
    }

    if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok !== true) {
      const err = (data as { error?: { code?: string; message?: string } })?.error
      throw new ContractTransformError(
        err?.code ?? 'validation_failed',
        err?.message ?? 'Transformacja umowy nie powiodła się.',
      )
    }

    const paragraphs = (data as { paragraphs?: unknown }).paragraphs
    if (!Array.isArray(paragraphs)) {
      throw new ContractTransformError(
        'validation_failed',
        'Brak akapitów w odpowiedzi AI.',
      )
    }

    const parsed: TransformParagraph[] = []
    for (const item of paragraphs) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const index = typeof row.index === 'number' ? row.index : Number(row.index)
      if (!Number.isFinite(index)) continue
      parsed.push({
        index: Math.floor(index),
        text: typeof row.text === 'string' ? row.text : '',
      })
    }

    return { paragraphs: parsed }
  } catch (err) {
    if (err instanceof ContractTransformError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ContractTransformError(
        'provider_timeout',
        'Przekroczono czas oczekiwania na transformację umowy.',
      )
    }
    throw new ContractTransformError(
      'provider_unavailable',
      err instanceof Error ? err.message : 'Transformacja umowy nie powiodła się.',
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

/**
 * Deterministic mock transformer (no LLM): replace slot example texts with values.
 */
export function mockContractTransform(input: {
  paragraphs: TransformParagraph[]
  replacements: Array<{ find: string; replace: string }>
  omittedFinds: string[]
}): ContractTransformResponse {
  const finds = [...input.replacements]
    .filter((r) => r.find.trim().length >= 2)
    .sort((a, b) => b.find.length - a.find.length)

  const paragraphs = input.paragraphs.map((p) => {
    let text = p.text
    for (const find of input.omittedFinds) {
      if (find.trim().length < 2) continue
      if (text.includes(find)) {
        text = text.split(find).join('__________')
      }
    }
    for (const { find, replace } of finds) {
      if (text.includes(find)) {
        text = text.split(find).join(replace)
      }
    }
    return { index: p.index, text }
  })

  return { paragraphs }
}
