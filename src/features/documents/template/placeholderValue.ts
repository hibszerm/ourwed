/**
 * Detect placeholder-only values that must never be treated as resolved
 * package / wedding material content.
 */

const PLACEHOLDER_WORDS =
  /^(?:do\s+uzupełnienia|uzupełnij|placeholder|tbd|n\/?a|xxx+|…|\.{3,})$/iu

/** True when the text is only a blank / underscore / hyphen placeholder. */
export function isPlaceholderOnlyValue(
  value: string | null | undefined,
): boolean {
  if (value == null) return true
  const trimmed = value
    .replace(/\u00a0|\u202f|\u2007/g, ' ')
    .trim()
  if (!trimmed) return true

  // Underscores, dotted blanks, repeated hyphens, empty brackets
  if (/^[_‐\-–—.\s]+$/.test(trimmed)) return true
  if (/^[[({]\s*[\])}]$/.test(trimmed)) return true
  if (/^_{3,}$/.test(trimmed.replace(/\s/g, ''))) return true
  if (/^\.{3,}$/.test(trimmed)) return true
  if (/^[-–—]{2,}$/.test(trimmed)) return true
  if (PLACEHOLDER_WORDS.test(trimmed)) return true

  // Mostly underscores with optional spaces: "____ ____"
  const compact = trimmed.replace(/\s+/g, '')
  if (compact.length >= 3 && /^_+$/.test(compact)) return true

  return false
}

/** Package / deliverable roles where a placeholder is never a safe preserved value. */
export const MATERIAL_PACKAGE_REGISTRY_KEYS = new Set([
  'film_duration',
  'teaser_duration',
  'teaser',
  'package_duration',
  'coverage_hours',
  'working_hours',
  'photo_count',
  'album_count',
  'videographers_count',
  'photographers_count',
  'operators_count',
  'package_item',
  'package_contents',
])

export function isMaterialPackageRegistryKey(key: string): boolean {
  const k = key.trim().toLowerCase()
  if (MATERIAL_PACKAGE_REGISTRY_KEYS.has(k)) return true
  if (/teaser|highlight|film_duration|photo_count|album|operator|videographer|coverage_hours|package_duration/i.test(
    k,
  )) {
    return true
  }
  return false
}
