import type {
  BusinessUnderstanding,
  BusinessUnderstandingItem,
  ChangingSource,
} from './types'

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const s = asString(item)
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function asSource(value: unknown): ChangingSource | undefined {
  const s = asString(value).toLowerCase()
  if (s === 'couple' || s === 'company' || s === 'package' || s === 'other') {
    return s
  }
  return undefined
}

function asNamedItems(value: unknown): BusinessUnderstandingItem[] {
  if (!Array.isArray(value)) return []
  const out: BusinessUnderstandingItem[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = asString(row.name)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name,
      source: asSource(row.source),
      reason: asString(row.reason) || undefined,
    })
  }
  return out
}

export function parseBusinessUnderstanding(
  raw: unknown,
): BusinessUnderstanding {
  if (!raw || typeof raw !== 'object') {
    throw new Error('business_understanding_invalid')
  }
  const obj = raw as Record<string, unknown>
  const workflow =
    obj.workflow && typeof obj.workflow === 'object'
      ? (obj.workflow as Record<string, unknown>)
      : {}

  return {
    businessType: asString(obj.businessType) || 'unknown',
    workflow: {
      beforeWedding: asStringList(workflow.beforeWedding),
      weddingDay: asStringList(workflow.weddingDay),
      afterWedding: asStringList(workflow.afterWedding),
    },
    changingInformation: asNamedItems(obj.changingInformation),
    constantInformation: asNamedItems(obj.constantInformation),
    missingInformationNeeded: asNamedItems(obj.missingInformationNeeded),
    promptVersion: asString(obj.promptVersion) || undefined,
    model: asString(obj.model) || undefined,
  }
}
