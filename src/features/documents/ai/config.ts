/**
 * Single place to change Gemini model / prompt / schema versions (frontend).
 * Edge Function mirrors these in `supabase/functions/document-ai-analysis/config.ts`.
 */

export const DOCUMENT_AI_CONFIG = {
  /** Edge Function name — React invokes only this, never Gemini directly. */
  edgeFunctionName: 'document-ai-analysis',
  /** Gemini model id (must match Edge Function). */
  model: 'gemini-2.5-flash',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  analyzerId: 'gemini',
  analyzerVersion: '1.0.0',
  /** Soft client timeout (ms) for the Edge Function call. */
  clientTimeoutMs: 55_000,
  /** Max characters of extracted text sent to the backend. */
  maxTextChars: 120_000,
} as const

export type DocumentAiModelId = typeof DOCUMENT_AI_CONFIG.model
