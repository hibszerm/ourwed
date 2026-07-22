/**
 * Lightweight validation of Gemini JSON (Edge).
 * Frontend re-validates against Variable Registry.
 */

export type EdgeErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'timeout'
  | 'invalid_json'
  | 'validation_failed'
  | 'gemini_unavailable'
  | 'rate_limit'
  | 'empty_response'
  | 'unknown'

export interface ValidatedAnalysis {
  schemaVersion: string
  model: string
  promptVersion: string
  documentType: string
  overallConfidence: number
  fields: Array<{
    id: string
    label: string
    registryKey: string | null
    value: string | null
    confidence: number
    paragraphIndex: number | null
    status: 'suggested'
  }>
  sections: Array<{ title: string; order: number }>
  clauses: Array<{
    id: string
    type: string
    title?: string
    confidence: number
  }>
  warnings: string[]
}

function clamp01(n: unknown, fallback = 0.5): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return fenced ? fenced[1]!.trim() : trimmed
}

export function parseGeminiJsonText(text: string): unknown {
  const cleaned = stripCodeFences(text)
  if (!cleaned) throw new Error('empty')
  return JSON.parse(cleaned)
}

export function validateAndNormalizeAnalysis(
  raw: unknown,
  allowedKeys: Set<string>,
  meta: {
    schemaVersion: string
    promptVersion: string
    model: string
  },
): ValidatedAnalysis {
  if (!raw || typeof raw !== 'object') {
    throw new Error('not_object')
  }
  const obj = raw as Record<string, unknown>
  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : []

  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : null
  if (!fieldsRaw) throw new Error('missing_fields')

  const fields = fieldsRaw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error('bad_field')
    const row = item as Record<string, unknown>
    let registryKey: string | null =
      typeof row.registryKey === 'string' ? row.registryKey.trim() : null
    if (registryKey === '') registryKey = null
    if (registryKey && !allowedKeys.has(registryKey)) {
      warnings.push(`Dropped unknown registryKey: ${registryKey}`)
      registryKey = null
    }

    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `ai-field-${index + 1}`
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : 'Dynamic field'

    const value =
      typeof row.value === 'string'
        ? row.value
        : row.value === null
          ? null
          : null

    const paragraphIndex =
      typeof row.paragraphIndex === 'number' && row.paragraphIndex >= 0
        ? Math.floor(row.paragraphIndex)
        : null

    return {
      id,
      label,
      registryKey,
      value,
      confidence: clamp01(row.confidence, 0.7),
      paragraphIndex,
      status: 'suggested' as const,
    }
  })

  const sections = Array.isArray(obj.sections)
    ? obj.sections
        .map((s, i) => {
          if (!s || typeof s !== 'object') return null
          const row = s as Record<string, unknown>
          if (typeof row.title !== 'string' || !row.title.trim()) return null
          return {
            title: row.title.trim(),
            order:
              typeof row.order === 'number' && row.order >= 0
                ? Math.floor(row.order)
                : i,
          }
        })
        .filter((s): s is { title: string; order: number } => s != null)
    : []

  const clauses = Array.isArray(obj.clauses)
    ? obj.clauses
        .map((c, i) => {
          if (!c || typeof c !== 'object') return null
          const row = c as Record<string, unknown>
          if (typeof row.type !== 'string' || !row.type.trim()) return null
          return {
            id:
              typeof row.id === 'string' && row.id.trim()
                ? row.id.trim()
                : `ai-clause-${i + 1}`,
            type: row.type.trim(),
            title: typeof row.title === 'string' ? row.title : undefined,
            confidence: clamp01(row.confidence, 0.7),
          }
        })
        .filter(
          (
            c,
          ): c is {
            id: string
            type: string
            title?: string
            confidence: number
          } => c != null,
        )
    : []

  return {
    schemaVersion:
      typeof obj.schemaVersion === 'string'
        ? obj.schemaVersion
        : meta.schemaVersion,
    model: typeof obj.model === 'string' ? obj.model : meta.model,
    promptVersion:
      typeof obj.promptVersion === 'string'
        ? obj.promptVersion
        : meta.promptVersion,
    documentType:
      typeof obj.documentType === 'string' && obj.documentType.trim()
        ? obj.documentType.trim()
        : 'contract',
    overallConfidence: clamp01(obj.overallConfidence, 0.5),
    fields,
    sections,
    clauses,
    warnings,
  }
}
