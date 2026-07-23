/**
 * Single place to change model / prompt / schema versions (frontend).
 * Edge Function mirrors these in `supabase/functions/document-ai-analysis/config.ts`.
 */

export const DOCUMENT_AI_CONFIG = {
  /** Edge Function name — React invokes only this, never the AI provider directly. */
  edgeFunctionName: 'document-ai-analysis',
  /** Default model id (Edge may override via OPENAI_MODEL secret). */
  model: 'gpt-5-mini',
  /** v3.2.3 = pendrive emits film_delivery_format + usb_included. */
  promptVersion: '3.2.3',
  schemaVersion: '3.2.3',
  analyzerId: 'document-ai',
  analyzerVersion: '3.2.3',
  /** Soft client timeout (ms) for the Edge Function call. */
  clientTimeoutMs: 55_000,
  /** Max characters of extracted text sent to the backend. */
  maxTextChars: 120_000,
} as const

export type DocumentAiModelId = typeof DOCUMENT_AI_CONFIG.model
