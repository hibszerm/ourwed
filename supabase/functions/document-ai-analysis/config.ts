/**
 * document-ai-analysis — single place to change model / versions (Edge).
 * Keep in sync with `src/features/documents/ai/config.ts`.
 */

export const DOCUMENT_AI_EDGE_CONFIG = {
  model: Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-flash-latest',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  analyzerId: 'gemini',
  analyzerVersion: '1.0.0',
  maxTextChars: 120_000,
  geminiTimeoutMs: 45_000,
} as const
