/**
 * Shared AI Contract Lab OpenAI payload shaping + size gates.
 * Mirrored by the Edge Function (Deno) — keep constants in sync with
 * supabase/functions/ai-contract-lab-analyze/config.ts
 */

export const LAB_PROVIDER_TIMEOUT_MS = 120_000
export const LAB_FALLBACK_CONTRACT_MODEL = 'gpt-5-mini'
export const LAB_OPENAI_CONTRACT_MODEL_ENV = 'OPENAI_CONTRACT_MODEL'
export const LAB_MAX_BODY_ANCHORS = 500
export const LAB_MAX_ANCHOR_CHARACTERS = 120_000
export const LAB_MAX_SERIALIZED_PAYLOAD_BYTES = Math.floor(1.5 * 1024 * 1024)
export const LAB_CONTEXT_CHARS = 240

export type SlimAnchor = {
  anchorId: string
  text: string
  contextBefore: string
  contextAfter: string
  container: string
}

export type SlimCatalogField = {
  key: string
  label: string
  category: string
  formattedValue: string | null
  available: boolean
  dataType: string
}

function collapseWhitespace(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ')
}

export function capContext(value: string, max = LAB_CONTEXT_CHARS): string {
  const cleaned = collapseWhitespace(value).trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max)
}

/** Slim anchors for OpenAI — no XML, no run metadata, no paragraphIndex. */
export function slimTextAnchorsForAi(
  anchors: Array<{
    anchorId: string
    text: string
    contextBefore?: string
    contextAfter?: string
    container?: string
  }>,
): SlimAnchor[] {
  return anchors
    .filter((a) => a.text.trim())
    .map((a) => ({
      anchorId: a.anchorId,
      text: a.text, // never truncate anchor text
      contextBefore: capContext(a.contextBefore ?? ''),
      contextAfter: capContext(a.contextAfter ?? ''),
      container: a.container ?? 'body',
    }))
}

/**
 * Catalog for OpenAI — available fields keep values; unavailable keep labels
 * only (needed for missing-field matching) without null value noise duplicated.
 */
export function slimFieldCatalogForAi(
  fields: Array<{
    key: string
    label: string
    category: string
    formattedValue: string | null
    dataType: string
  }>,
): SlimCatalogField[] {
  return fields.map((f) => {
    const formatted =
      f.formattedValue != null ? collapseWhitespace(f.formattedValue).trim() : null
    return {
      key: f.key,
      label: f.label,
      category: f.category,
      formattedValue: formatted || null,
      available: Boolean(formatted),
      dataType: f.dataType,
    }
  })
}

export function measureAnchorCharacters(anchors: SlimAnchor[]): number {
  return anchors.reduce((sum, a) => sum + a.text.length, 0)
}

export type PayloadSizeGate =
  | { ok: true; inputBytes: number; inputCharacters: number; schemaBytes: number }
  | {
      ok: false
      code: 'document_too_large'
      reason: 'anchor_count' | 'anchor_characters' | 'serialized_payload'
      inputBytes: number
      inputCharacters: number
      anchorCount: number
    }

export function validateAiPayloadSize(input: {
  textAnchors: SlimAnchor[]
  fieldCatalog: SlimCatalogField[]
  schemaJson: string
}): PayloadSizeGate {
  const anchorCount = input.textAnchors.length
  const inputCharacters = measureAnchorCharacters(input.textAnchors)
  const serialized = JSON.stringify({
    textAnchors: input.textAnchors,
    fieldCatalog: input.fieldCatalog,
  })
  const inputBytes = new TextEncoder().encode(serialized).byteLength
  const schemaBytes = new TextEncoder().encode(input.schemaJson).byteLength

  if (anchorCount > LAB_MAX_BODY_ANCHORS) {
    return {
      ok: false,
      code: 'document_too_large',
      reason: 'anchor_count',
      inputBytes,
      inputCharacters,
      anchorCount,
    }
  }
  if (inputCharacters > LAB_MAX_ANCHOR_CHARACTERS) {
    return {
      ok: false,
      code: 'document_too_large',
      reason: 'anchor_characters',
      inputBytes,
      inputCharacters,
      anchorCount,
    }
  }
  if (inputBytes > LAB_MAX_SERIALIZED_PAYLOAD_BYTES) {
    return {
      ok: false,
      code: 'document_too_large',
      reason: 'serialized_payload',
      inputBytes,
      inputCharacters,
      anchorCount,
    }
  }

  return { ok: true, inputBytes, inputCharacters, schemaBytes }
}

export function computeLabMaxOutputTokens(anchorCount: number): number {
  return Math.min(16_000, Math.max(4_000, 2_000 + anchorCount * 100))
}

export function buildDocumentAnalysisPayload(input: {
  anchors: Array<{
    anchorId: string
    text: string
    contextBefore?: string
    contextAfter?: string
    container?: string
  }>
  fields: Array<{
    key: string
    label: string
    category: string
    formattedValue: string | null
    dataType: string
  }>
}): { textAnchors: SlimAnchor[]; fieldCatalog: SlimCatalogField[] } {
  return {
    textAnchors: slimTextAnchorsForAi(input.anchors),
    fieldCatalog: slimFieldCatalogForAi(input.fields),
  }
}

export function mapLabAnalyzeErrorMessage(code: string): {
  message: string
  retryable: boolean
} {
  switch (code) {
    case 'provider_timeout':
      return {
        message:
          'Analiza trwała zbyt długo. Spróbuj ponownie. Jeśli problem się powtórzy, użyj krótszego dokumentu. Oryginalny dokument nie został zmieniony.',
        retryable: true,
      }
    case 'document_too_large':
      return {
        message:
          'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę. Oryginalny dokument nie został zmieniony.',
        retryable: false,
      }
    case 'provider_rate_limit':
    case 'rate_limit':
      return {
        message:
          'Limit zapytań AI został wyczerpany. Spróbuj ponownie za chwilę. Oryginalny dokument nie został zmieniony.',
        retryable: true,
      }
    case 'unauthorized':
    case 'provider_auth':
      return {
        message:
          'Autoryzacja dostawcy AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
        retryable: false,
      }
    case 'invalid_json':
    case 'invalid_provider_output':
    case 'validation_failed':
      return {
        message:
          'AI zwróciło nieprawidłowy wynik. Spróbuj ponownie. Oryginalny dokument nie został zmieniony.',
        retryable: true,
      }
    default:
      return {
        message:
          'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
        retryable: true,
      }
  }
}
