/**
 * Reliability gate for automatic Geoapify geocode acceptance.
 *
 * Uses Geoapify's own `rank` + `result_type` fields only
 * (see https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/).
 *
 * Manual photographer selection (autocomplete) bypasses this gate.
 */

export interface GeoapifyRankSignals {
  confidence?: number
  confidence_city_level?: number
  confidence_street_level?: number
  confidence_building_level?: number
  match_type?: string
  popularity?: number
  importance?: number
}

export interface GeoapifyReliabilityInput {
  resultType?: string | null
  rank?: GeoapifyRankSignals | null
}

/** Geoapify docs sample ACCEPT_LEVEL is 0.95; venues often land ~0.7–0.8. */
export const GEOAPIFY_AUTO_ACCEPT_CONFIDENCE = 0.7

/**
 * When overall confidence is low (e.g. Polish abbreviations like "św."),
 * Geoapify may still confirm the city. Accept only with a strong city signal
 * and a place-level (not city-fallback) match.
 */
export const GEOAPIFY_CITY_LEVEL_ACCEPT = 0.95

/** match_type values that mean “fell back to a coarse geography”. */
const WEAK_MATCH_TYPES = new Set([
  'match_by_city_or_disrict', // Geoapify spelling
  'match_by_city_or_district',
  'match_by_country_or_state',
  'match_by_postcode',
])

/** result_type values too coarse for a wedding place pin. */
const COARSE_RESULT_TYPES = new Set([
  'city',
  'county',
  'state',
  'country',
  'postcode',
  'suburb',
  'district',
  'unknown',
])

const PLACE_LEVEL_RESULT_TYPES = new Set(['amenity', 'building', 'street'])

const PLACE_LEVEL_MATCH_TYPES = new Set([
  'full_match',
  'inner_part',
  'match_by_building',
  'match_by_street',
])

export type GeoapifyReliabilityReason =
  | 'accepted_confidence'
  | 'accepted_city_level_place_match'
  | 'rejected_missing_rank'
  | 'rejected_weak_match_type'
  | 'rejected_coarse_result_type'
  | 'rejected_low_confidence'

export interface GeoapifyReliabilityDecision {
  reliable: boolean
  reason: GeoapifyReliabilityReason
}

/**
 * Decide whether an automatic (non-interactive) geocode hit is safe to store
 * with coordinates / place_id.
 */
export function evaluateGeoapifyReliability(
  input: GeoapifyReliabilityInput,
): GeoapifyReliabilityDecision {
  const rank = input.rank
  const confidence = rank?.confidence
  if (rank == null || typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return { reliable: false, reason: 'rejected_missing_rank' }
  }

  const matchType = rank.match_type?.trim() || ''
  if (WEAK_MATCH_TYPES.has(matchType)) {
    return { reliable: false, reason: 'rejected_weak_match_type' }
  }

  const resultType = input.resultType?.trim() || ''
  if (COARSE_RESULT_TYPES.has(resultType)) {
    return { reliable: false, reason: 'rejected_coarse_result_type' }
  }

  if (confidence >= GEOAPIFY_AUTO_ACCEPT_CONFIDENCE) {
    return { reliable: true, reason: 'accepted_confidence' }
  }

  const cityLevel = rank.confidence_city_level
  if (
    typeof cityLevel === 'number' &&
    Number.isFinite(cityLevel) &&
    cityLevel >= GEOAPIFY_CITY_LEVEL_ACCEPT &&
    PLACE_LEVEL_RESULT_TYPES.has(resultType) &&
    PLACE_LEVEL_MATCH_TYPES.has(matchType)
  ) {
    // Geoapify: low confidence can still be correct with abbreviations/misspellings.
    return { reliable: true, reason: 'accepted_city_level_place_match' }
  }

  return { reliable: false, reason: 'rejected_low_confidence' }
}

export function isGeoapifyGeocodeReliable(
  input: GeoapifyReliabilityInput,
): boolean {
  return evaluateGeoapifyReliability(input).reliable
}
