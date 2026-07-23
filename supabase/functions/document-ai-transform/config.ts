/**
 * document-ai-transform — Edge config.
 * Full-document value substitution (not extraction).
 */

function resolveTransformModel(): string {
  const fromEnv = Deno.env.get('OPENAI_TRANSFORM_MODEL')?.trim()
    || Deno.env.get('OPENAI_MODEL')?.trim()
  if (!fromEnv || /^gpt-5/i.test(fromEnv)) {
    return 'gpt-4.1-mini'
  }
  return fromEnv
}

export const DOCUMENT_TRANSFORM_EDGE_CONFIG = {
  model: resolveTransformModel(),
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  maxTextChars: 120_000,
  providerTimeoutMs: 90_000,
  maxOutputTokens: 16_000,
  maxRetries: 1,
} as const
