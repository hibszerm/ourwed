/**
 * Single place to change model / prompt / schema versions (frontend).
 * Edge Function mirrors these in `supabase/functions/document-ai-analysis/config.ts`.
 */

export const DOCUMENT_AI_CONFIG = {
  /** Edge Function name — React invokes only this, never the AI provider directly. */
  edgeFunctionName: 'document-ai-analysis',
  /** Default model id (Edge may override via OPENAI_MODEL secret). */
  model: 'gpt-5-mini',
  /** v2.4 = package-aware presence IDs (no contract default values). */
  promptVersion: '2.4.0',
  schemaVersion: '2.4.0',
  analyzerId: 'document-ai',
  analyzerVersion: '2.4.0',
  /** Soft client timeout (ms) for the Edge Function call. */
  clientTimeoutMs: 55_000,
  /** Max characters of extracted text sent to the backend. */
  maxTextChars: 120_000,
} as const

export type DocumentAiModelId = typeof DOCUMENT_AI_CONFIG.model
