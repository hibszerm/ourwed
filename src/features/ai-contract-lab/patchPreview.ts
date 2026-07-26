/**
 * OLD → NEW patch preview with safety checks.
 */

export type PatchPreview = {
  oldValue: string
  newValue: string
  exactPatchSpan: string
  beforeContext: string
  afterContext: string
  beforePhrase: string
  afterPhrase: string
  valid: boolean
  failureReason: string | null
}

export function buildPatchPreview(input: {
  exactSourceText: string
  replacementText: string
  prefixContext?: string | null
  suffixContext?: string | null
  anchorText?: string | null
}): PatchPreview {
  const oldValue = input.exactSourceText
  const newValue = input.replacementText
  let before = input.prefixContext?.trim() ?? ''
  let after = input.suffixContext?.trim() ?? ''

  // Derive short context from anchor when prefix/suffix missing
  if ((!before || !after) && input.anchorText && oldValue) {
    const idx = input.anchorText.indexOf(oldValue)
    if (idx >= 0) {
      if (!before) {
        before = input.anchorText.slice(Math.max(0, idx - 40), idx)
      }
      if (!after) {
        after = input.anchorText.slice(
          idx + oldValue.length,
          idx + oldValue.length + 40,
        )
      }
    }
  }

  const beforePhrase = `${before}[${oldValue}]${after}`
  const afterPhrase = `${before}[${newValue}]${after}`

  const safety = validatePatchPreview({
    beforeContext: before,
    exactSourceText: oldValue,
    replacementText: newValue,
    afterContext: after,
  })

  return {
    oldValue,
    newValue,
    exactPatchSpan: oldValue,
    beforeContext: before,
    afterContext: after,
    beforePhrase,
    afterPhrase,
    valid: safety.ok,
    failureReason: safety.reason,
  }
}

export function validatePatchPreview(input: {
  beforeContext: string
  exactSourceText: string
  replacementText: string
  afterContext: string
}): { ok: boolean; reason: string | null } {
  const before = input.beforeContext
  const after = input.afterContext
  const oldV = input.exactSourceText
  const neu = input.replacementText

  if (!oldV.trim() || !neu.trim()) {
    return { ok: false, reason: 'Empty old or new value' }
  }
  if (oldV === neu) {
    return { ok: false, reason: 'preview.before === preview.after' }
  }

  const composedBefore = `${before}${oldV}${after}`
  const composedAfter = `${before}${neu}${after}`
  if (composedBefore === composedAfter) {
    return { ok: false, reason: 'preview.before === preview.after' }
  }

  // Prefix/suffix must remain
  if (before && !composedAfter.startsWith(before)) {
    return { ok: false, reason: 'Prefix disappears in preview' }
  }
  if (after && !composedAfter.endsWith(after)) {
    return { ok: false, reason: 'Suffix disappears in preview' }
  }

  // Double currency
  if (/(zł|pln)\s*(zł|pln)/i.test(composedAfter)) {
    return { ok: false, reason: 'Duplicate currency suffix' }
  }
  // Double r.
  if (/r\.\s*r\./i.test(composedAfter) || /\d{4}r\.r\./i.test(composedAfter)) {
    return { ok: false, reason: 'Duplicate r. suffix' }
  }
  // Double package label
  if (/pakiecie\s+pakiecie/i.test(composedAfter)) {
    return { ok: false, reason: 'Duplicated package label' }
  }
  // Bad spacing around brackets content
  if (/\s{2,}/.test(neu) && !/\d\s\d{3}/.test(neu)) {
    // allow thousand separators
  }
  if (/^\s|\s$/.test(neu) && neu.trim() !== neu) {
    return { ok: false, reason: 'Invalid spacing in replacement' }
  }

  return { ok: true, reason: null }
}
