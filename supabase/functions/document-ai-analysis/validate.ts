/**
 * Compact semantic extraction validation (Edge).
 * Package slots are presence-only IDs — never numeric values from the contract.
 */

export type EdgeErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'provider_timeout'
  | 'provider_rate_limit'
  | 'provider_unavailable'
  | 'invalid_json'
  | 'validation_failed'
  | 'empty_response'
  | 'unknown'

export interface ValidatedSemanticExtraction {
  contractName: string
  packageSuggestion: string | null
  coupleVariables: string[]
  studioVariables: string[]
  packageVariables: string[]
  possibleVariables: string[]
  schemaVersion: string
  promptVersion: string
  model: string
}

const PACKAGE_SUGGESTIONS = new Set([
  'Photography',
  'Video',
  'Photography + Video',
])

const ALLOWED_COUPLE = new Set([
  'bride_first_name',
  'bride_last_name',
  'bride_phone',
  'bride_email',
  'bride_address',
  'bride_pesel',
  'pesel',
  'groom_first_name',
  'groom_last_name',
  'groom_phone',
  'groom_email',
  'groom_address',
  'groom_pesel',
  'wedding_date',
  'ceremony_time',
  'couple_names',
  'schedule',
  'wedding_schedule',
  'ceremony_location',
  'reception_location',
  'preparation_location',
  'package',
  'additional_notes',
  'notes',
  'wedding_planner_name',
  'wedding_planner_phone',
  'wedding_planner_email',
  'food_for_crew',
  'marketing_consent',
])

const ALLOWED_STUDIO = new Set([
  'company_name',
  'studio_name',
  'company_owner',
  'owner',
  'company_tax_id',
  'company_nip',
  'company_address',
  'studio_address',
  'company_email',
  'studio_email',
  'company_phone',
  'studio_phone',
  'company_website',
  'studio_website',
  'company_bank_account',
  'bank_account',
  'company_iban',
  'iban',
  'company_swift',
  'swift',
  'company_regon',
  'company_vat',
  'vat',
  'company_instagram',
  'instagram',
  'company_facebook',
  'facebook',
  'photographer_name',
  'studio_logo',
  'company_logo',
  'studio_signature',
  'company_signature',
  'signature',
  'company_stamp',
  'stamp',
])

const ALLOWED_PACKAGE = new Set([
  'package_name',
  'package_price',
  'price',
  'contract_price',
  'deposit_amount',
  'deposit',
  'deposit_type',
  'deposit_percent',
  'remaining_payment',
  'payment_deadline',
  'payment_due_days',
  'payment_installments',
  'delivery_time',
  'delivery_days',
  'included_services',
  'photographers_count',
  'videographers_count',
  'working_hours',
  'overtime_price',
  'mileage_limit',
  'mileage_price',
  'accommodation',
  'travel_fee',
  'album_included',
  'usb_included',
  'online_gallery',
  'engagement_session',
  'wedding_session',
  'number_of_revisions',
  'assistants',
  'drone_included',
  'drone',
  'film_duration',
  'film_delivery_method',
  'film_delivery_format',
  'postproduction_duration',
  'post_production_duration',
])

const ALLOWED_PRESENCE = new Set([...ALLOWED_COUPLE, ...ALLOWED_STUDIO])

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return fenced ? fenced[1]!.trim() : trimmed
}

export function parseAnalysisJsonText(text: string): unknown {
  const cleaned = stripCodeFences(text)
  if (!cleaned) throw new Error('empty')
  return JSON.parse(cleaned)
}

function normalizeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function asIdList(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = normalizeId(item)
    if (!id || !allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function mergeUnique(base: string[], extra: string[]): string[] {
  const seen = new Set(base)
  const out = [...base]
  for (const id of extra) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * When the model puts a known allow-list ID in possibleVariables,
 * promote it to the correct bucket instead of discarding it.
 */
function rescueKnownIdsFromPossibles(value: unknown): {
  couple: string[]
  studio: string[]
  package: string[]
} {
  const couple: string[] = []
  const studio: string[] = []
  const pkg: string[] = []
  if (!Array.isArray(value)) return { couple, studio, package: pkg }
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = normalizeId(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (ALLOWED_PACKAGE.has(id)) pkg.push(id)
    else if (ALLOWED_COUPLE.has(id)) couple.push(id)
    else if (ALLOWED_STUDIO.has(id)) studio.push(id)
  }
  return { couple, studio, package: pkg }
}

/** Allow-listed IDs + freeform snake_case suggestions for unknown changing fields. */
function asPossibleIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = normalizeId(item)
    if (!id || seen.has(id)) continue
    const allowListed = ALLOWED_PRESENCE.has(id) || ALLOWED_PACKAGE.has(id)
    const freeform = /^[a-z][a-z0-9_]{2,64}$/.test(id)
    if (!allowListed && !freeform) continue
    // Package IDs belong in packageVariables, not possibles
    if (ALLOWED_PACKAGE.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Accept string[] or legacy [{id,value}] — keep IDs only, drop values. */
function asPackageIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    let raw = ''
    if (typeof item === 'string') raw = item
    else if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>
      if (typeof row.id === 'string') raw = row.id
      else if (typeof row.key === 'string') raw = row.key
    }
    const id = normalizeId(raw)
    if (!id || !ALLOWED_PACKAGE.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function normalizePackageSuggestion(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  if (PACKAGE_SUGGESTIONS.has(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  if (/photo.*video|foto.*video|photography\s*\+\s*video/.test(lower)) {
    return 'Photography + Video'
  }
  if (/video|wideo|film/.test(lower) && !/photo|foto/.test(lower)) {
    return 'Video'
  }
  if (/photo|foto|fotograf/.test(lower)) {
    return 'Photography'
  }
  return null
}

export function validateAndNormalizeAnalysis(
  raw: unknown,
  _allowedKeys: Set<string>,
  meta: {
    schemaVersion: string
    promptVersion: string
    model: string
  },
): ValidatedSemanticExtraction {
  if (!raw || typeof raw !== 'object') {
    throw new Error('not_object')
  }
  const obj = raw as Record<string, unknown>

  let coupleVariables = asIdList(obj.coupleVariables, ALLOWED_COUPLE)
  let studioVariables = asIdList(obj.studioVariables, ALLOWED_STUDIO)
  let packageVariables = asPackageIdList(
    obj.packageVariables ?? obj.templateDefaults ?? obj.defaults,
  )

  // Rescue known allow-list IDs mis-bucketed into possibleVariables.
  // Dropping them was a first-loss failure: the model already found the concept.
  const rescued = rescueKnownIdsFromPossibles(obj.possibleVariables)
  coupleVariables = mergeUnique(coupleVariables, rescued.couple)
  studioVariables = mergeUnique(studioVariables, rescued.studio)
  packageVariables = mergeUnique(packageVariables, rescued.package)

  let possibleVariables = asPossibleIdList(obj.possibleVariables)

  if (
    coupleVariables.length === 0 &&
    studioVariables.length === 0 &&
    Array.isArray(obj.variables)
  ) {
    const legacy = asIdList(obj.variables, ALLOWED_PRESENCE)
    coupleVariables = legacy.filter((id) => ALLOWED_COUPLE.has(id))
    studioVariables = legacy.filter((id) => ALLOWED_STUDIO.has(id))
  }

  const confirmed = new Set([...coupleVariables, ...studioVariables])
  possibleVariables = possibleVariables.filter((id) => !confirmed.has(id))

  // Package IDs must not appear in couple/studio lists
  coupleVariables = coupleVariables.filter((id) => !ALLOWED_PACKAGE.has(id))
  studioVariables = studioVariables.filter((id) => !ALLOWED_PACKAGE.has(id))
  possibleVariables = possibleVariables.filter((id) => !ALLOWED_PACKAGE.has(id))

  if (
    coupleVariables.length === 0 &&
    studioVariables.length === 0 &&
    possibleVariables.length === 0 &&
    packageVariables.length === 0
  ) {
    throw new Error('missing_variables')
  }

  const contractName =
    typeof obj.contractName === 'string' ? obj.contractName.trim() : ''

  return {
    contractName,
    packageSuggestion: normalizePackageSuggestion(obj.packageSuggestion),
    coupleVariables,
    studioVariables,
    packageVariables,
    possibleVariables,
    schemaVersion: meta.schemaVersion,
    promptVersion: meta.promptVersion,
    model: meta.model,
  }
}
