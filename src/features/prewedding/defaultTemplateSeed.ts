/**
 * Explicit "Użyj domyślnej" / getOrSeedDefault decision.
 *
 * source_key marks ORIGIN of a copied OurWed preset. It is not a live sync pointer.
 *
 * Official V1 presets (photo / video / photo+video) satisfy the default-template
 * requirement. Never insert generic pre_wedding_default_v2 beside them.
 *
 * Never UPDATE an existing user-owned template (including older v1 origin
 * rows). If a legacy account has no official presets and no v2 origin row,
 * insert a NEW v2 row. Future versions must be a new source_key + a new copy.
 */

export type PreWeddingDefaultSeedDecision =
  | { action: 'return_current' }
  | { action: 'return_official' }
  | { action: 'insert_current'; isDefault: boolean }

export function decidePreWeddingDefaultSeed(input: {
  /** True when a row with DEFAULT_TEMPLATE_SOURCE_KEY already exists (any archive state). */
  hasCurrentSourceKey: boolean
  /** True when any official V1 preset source_key already exists (any archive state). */
  hasOfficialPresetSourceKey?: boolean
  /** True when another active, non-archived default already exists for pre_wedding. */
  hasActiveDefault: boolean
}): PreWeddingDefaultSeedDecision {
  if (input.hasOfficialPresetSourceKey) return { action: 'return_official' }
  if (input.hasCurrentSourceKey) return { action: 'return_current' }
  return {
    action: 'insert_current',
    isDefault: !input.hasActiveDefault,
  }
}
