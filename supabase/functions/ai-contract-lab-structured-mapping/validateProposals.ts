import { ALLOWED_FIELD_KEYS } from './registry.ts'

const MAX_EXACT_LEN = 500

export function validateStructuredProposals(
  parsed: unknown,
  blocksById: Map<string, string>,
): { ok: true } | { ok: false; reason: string } {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'not_object' }
  }
  const fields = (parsed as Record<string, unknown>).fields
  if (!Array.isArray(fields)) return { ok: false, reason: 'missing_fields' }

  const allowed = new Set<string>(ALLOWED_FIELD_KEYS)

  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'invalid_field' }
    }
    const f = raw as Record<string, unknown>
    const fieldKey = f.fieldKey
    const blockId = f.blockId
    const exactValue = f.exactValue

    if (typeof fieldKey !== 'string' || !allowed.has(fieldKey)) {
      return { ok: false, reason: `invented_field_key:${fieldKey}` }
    }
    if (typeof blockId !== 'string' || !blocksById.has(blockId)) {
      return { ok: false, reason: 'invalid_block_id' }
    }
    if (typeof exactValue !== 'string' || !exactValue.trim()) {
      return { ok: false, reason: 'empty_exact_value' }
    }
    if (exactValue.length > MAX_EXACT_LEN) {
      return { ok: false, reason: 'exact_value_too_long' }
    }

    const blockText = blocksById.get(blockId)!
    if (!blockText.includes(exactValue)) {
      return { ok: false, reason: 'exact_value_not_in_block' }
    }
  }

  const immutableFindings = (parsed as Record<string, unknown>).immutableFindings
  if (Array.isArray(immutableFindings)) {
    for (const raw of immutableFindings) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: 'invalid_immutable' }
      }
      const im = raw as Record<string, unknown>
      const blockId = im.blockId
      const exactValue = im.exactValue
      if (typeof blockId !== 'string' || !blocksById.has(blockId)) {
        return { ok: false, reason: 'invalid_immutable_block_id' }
      }
      if (typeof exactValue !== 'string' || !exactValue.trim()) {
        return { ok: false, reason: 'empty_immutable_exact_value' }
      }
      const blockText = blocksById.get(blockId)!
      if (!blockText.includes(exactValue)) {
        return { ok: false, reason: 'immutable_exact_not_in_block' }
      }
    }
  }

  return { ok: true }
}
