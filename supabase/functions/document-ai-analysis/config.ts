/**
 * document-ai-analysis — model / versions (Edge).
 *
 * This endpoint is structured JSON extraction only.
 * Do NOT use GPT-5 here — it spends the output budget on reasoning.
 */

function resolveExtractionModel(): string {
  const fromEnv = Deno.env.get('OPENAI_MODEL')?.trim()
  // Never allow GPT-5 on this endpoint (reasoning burns max_output_tokens).
  if (!fromEnv || /^gpt-5/i.test(fromEnv)) {
    return 'gpt-4.1-mini'
  }
  return fromEnv
}

export const DOCUMENT_AI_EDGE_CONFIG = {
  model: resolveExtractionModel(),
  /** v3.2.3 = pendrive emits film_delivery_format + usb_included. */
  promptVersion: '3.2.3',
  schemaVersion: '3.2.3',
  analyzerId: 'document-ai',
  analyzerVersion: '3.2.3',
  maxTextChars: 120_000,
  providerTimeoutMs: 45_000,
} as const
