/**
 * Client config for contract transformation (mirrors Edge).
 */

export const DOCUMENT_TRANSFORM_CONFIG = {
  edgeFunctionName: 'document-ai-transform',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  clientTimeoutMs: 100_000,
  maxTextChars: 120_000,
  maxQualityRetries: 1,
} as const
