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
  /** v2.4 = package-aware presence IDs (no contract default values). */
  promptVersion: '2.4.0',
  schemaVersion: '2.4.0',
  analyzerId: 'document-ai',
  analyzerVersion: '2.4.0',
  maxTextChars: 120_000,
  providerTimeoutMs: 45_000,
} as const
