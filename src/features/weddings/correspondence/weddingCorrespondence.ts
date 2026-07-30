/**
 * Wedding correspondence — where the studio contacts the couple.
 * Persisted as weddings.correspondence (jsonb array).
 * Legacy columns correspondence_channel / correspondence_value remain for transition.
 */

export type CorrespondenceChannel = 'email' | 'instagram' | 'facebook'

/** Single saved correspondence row. */
export type WeddingCorrespondenceEntry = {
  id: string
  channel: CorrespondenceChannel
  value: string
}

/** @deprecated Use WeddingCorrespondenceEntry — kept for transitional imports. */
export type WeddingCorrespondence = WeddingCorrespondenceEntry

export const CORRESPONDENCE_CHANNELS: CorrespondenceChannel[] = [
  'email',
  'instagram',
  'facebook',
]

export const CORRESPONDENCE_CHANNEL_LABELS: Record<
  CorrespondenceChannel,
  string
> = {
  email: 'E-mail',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const INSTAGRAM_HANDLE_RE = /^@?[A-Za-z0-9._]{1,30}$/
const INSTAGRAM_URL_RE =
  /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?/i
const FACEBOOK_URL_RE = /^https?:\/\/([a-z0-9-]+\.)?facebook\.com\/.+/i

export function isCorrespondenceChannel(
  value: unknown,
): value is CorrespondenceChannel {
  return value === 'email' || value === 'instagram' || value === 'facebook'
}

export function createCorrespondenceEntryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeEntryValue(
  channel: CorrespondenceChannel,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim()
  if (!value) {
    return { ok: false, error: 'Uzupełnij wartość kontaktu.' }
  }

  if (channel === 'email') {
    const email = value.toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: 'Podaj prawidłowy adres e-mail.' }
    }
    return { ok: true, value: email }
  }

  if (channel === 'instagram') {
    const urlMatch = value.match(INSTAGRAM_URL_RE)
    if (urlMatch) {
      // Preserve a usable profile URL rather than collapsing to a handle only.
      return { ok: true, value: `https://instagram.com/${urlMatch[2]}` }
    }
    const handle = value.startsWith('@') ? value : `@${value}`
    if (!INSTAGRAM_HANDLE_RE.test(handle)) {
      return {
        ok: false,
        error: 'Podaj nazwę profilu Instagram (@nazwa) lub pełny link.',
      }
    }
    return { ok: true, value: handle }
  }

  // facebook — accept URL or plain name; do not invent URLs from names
  return { ok: true, value }
}

/** Parse a single legacy channel/value pair into a one-element collection. */
export function parseLegacyCorrespondence(
  channel: unknown,
  value: unknown,
): WeddingCorrespondenceEntry[] {
  if (!isCorrespondenceChannel(channel)) return []
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return []
  return [{ id: createCorrespondenceEntryId(), channel, value: raw }]
}

function parseCorrespondenceJson(raw: unknown): WeddingCorrespondenceEntry[] {
  if (!Array.isArray(raw)) return []
  const out: WeddingCorrespondenceEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (!isCorrespondenceChannel(row.channel)) continue
    const value = typeof row.value === 'string' ? row.value.trim() : ''
    if (!value) continue
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : createCorrespondenceEntryId()
    out.push({ id, channel: row.channel, value })
  }
  return out
}

/**
 * Prefer jsonb collection; fall back to legacy scalar columns when empty.
 * Avoids duplicating the same legacy pair when both are present.
 */
export function parseWeddingCorrespondenceCollection(input: {
  correspondence?: unknown
  correspondence_channel?: unknown
  correspondence_value?: unknown
}): WeddingCorrespondenceEntry[] {
  const fromJson = parseCorrespondenceJson(input.correspondence)
  if (fromJson.length > 0) return fromJson
  return parseLegacyCorrespondence(
    input.correspondence_channel,
    input.correspondence_value,
  )
}

/** @deprecated Prefer parseWeddingCorrespondenceCollection. */
export function parseWeddingCorrespondence(
  channel: unknown,
  value: unknown,
): WeddingCorrespondenceEntry | null {
  return parseLegacyCorrespondence(channel, value)[0] ?? null
}

export type CorrespondenceListValidation =
  | { ok: true; normalized: WeddingCorrespondenceEntry[] }
  | { ok: false; error: string; rowIndex?: number }

function correspondenceDedupKey(
  channel: CorrespondenceChannel,
  value: string,
): string {
  if (channel === 'instagram') {
    const urlMatch = value.match(INSTAGRAM_URL_RE)
    const handle = (urlMatch ? urlMatch[2] : value.replace(/^@/, '')).toLowerCase()
    return `instagram:${handle}`
  }
  if (channel === 'email') return `email:${value.toLowerCase()}`
  return `facebook:${value.toLowerCase()}`
}

/**
 * Validate + normalize a list of draft rows for persistence.
 * Fully empty rows (no channel + no value) are skipped.
 * Channel without value → error on that row.
 * Exact duplicate channel+normalized value → error.
 */
export function validateWeddingCorrespondenceEntries(
  entries: Array<{
    id?: string
    channel: CorrespondenceChannel | '' | null | undefined
    value: string | null | undefined
  }>,
): CorrespondenceListValidation {
  const normalized: WeddingCorrespondenceEntry[] = []
  const seen = new Set<string>()

  for (let i = 0; i < entries.length; i++) {
    const row = entries[i]
    const channel = row.channel?.trim()
      ? (row.channel as CorrespondenceChannel)
      : null
    const rawValue = (row.value ?? '').trim()

    if (!channel && !rawValue) continue

    if (!channel) {
      return {
        ok: false,
        error: 'Wybierz kanał kontaktu.',
        rowIndex: i,
      }
    }
    if (!isCorrespondenceChannel(channel)) {
      return {
        ok: false,
        error: 'Nieprawidłowy kanał kontaktu.',
        rowIndex: i,
      }
    }
    if (!rawValue) {
      return {
        ok: false,
        error: 'Uzupełnij wartość kontaktu.',
        rowIndex: i,
      }
    }

    const norm = normalizeEntryValue(channel, rawValue)
    if (!norm.ok) {
      return { ok: false, error: norm.error, rowIndex: i }
    }

    const key = correspondenceDedupKey(channel, norm.value)
    if (seen.has(key)) {
      return {
        ok: false,
        error: 'Ten kanał i wartość są już dodane.',
        rowIndex: i,
      }
    }
    seen.add(key)

    normalized.push({
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim()
          : createCorrespondenceEntryId(),
      channel,
      value: norm.value,
    })
  }

  return { ok: true, normalized }
}

/** Validate one row (used by form blur / single-entry helpers). */
export function validateWeddingCorrespondence(input: {
  channel: CorrespondenceChannel | '' | null | undefined
  value: string | null | undefined
  id?: string
}):
  | { ok: true; normalized: WeddingCorrespondenceEntry | null }
  | { ok: false; error: string } {
  const result = validateWeddingCorrespondenceEntries([
    {
      id: input.id,
      channel: input.channel,
      value: input.value,
    },
  ])
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, normalized: result.normalized[0] ?? null }
}

export type CorrespondenceLink =
  | { kind: 'mailto' | 'external'; href: string; label: string }
  | { kind: 'text'; label: string }

/** Safe display + link for Overview sidebar. */
export function getCorrespondenceDisplay(
  entry: Pick<WeddingCorrespondenceEntry, 'channel' | 'value'> | null | undefined,
): CorrespondenceLink | null {
  if (!entry?.value?.trim()) return null
  const { channel, value } = entry
  const label = value.trim()

  if (channel === 'email') {
    return { kind: 'mailto', href: `mailto:${label}`, label }
  }

  if (channel === 'instagram') {
    const urlMatch = label.match(INSTAGRAM_URL_RE)
    if (urlMatch) {
      return {
        kind: 'external',
        href: `https://instagram.com/${urlMatch[2]}`,
        label: `@${urlMatch[2]}`,
      }
    }
    if (INSTAGRAM_HANDLE_RE.test(label)) {
      const handle = label.startsWith('@') ? label.slice(1) : label
      return {
        kind: 'external',
        href: `https://instagram.com/${handle}`,
        label: label.startsWith('@') ? label : `@${label}`,
      }
    }
    return { kind: 'text', label }
  }

  if (FACEBOOK_URL_RE.test(label)) {
    return { kind: 'external', href: label, label }
  }
  return { kind: 'text', label }
}

export function correspondenceValueFieldMeta(
  channel: CorrespondenceChannel | '' | null | undefined,
): { label: string; placeholder: string; type: 'email' | 'text' } {
  switch (channel) {
    case 'email':
      return {
        label: 'Adres e-mail do korespondencji',
        placeholder: 'anna@example.com',
        type: 'email',
      }
    case 'instagram':
      return {
        label: 'Nazwa profilu na Instagramie',
        placeholder: '@anna_i_michal',
        type: 'text',
      }
    case 'facebook':
      return {
        label: 'Nazwa profilu lub link do Facebooka',
        placeholder: 'Anna Kowalska lub pełny link',
        type: 'text',
      }
    default:
      return {
        label: 'Wartość kontaktu',
        placeholder: '',
        type: 'text',
      }
  }
}

/** Serialize domain entries for jsonb column. */
export function serializeCorrespondenceForDb(
  entries: WeddingCorrespondenceEntry[] | null | undefined,
): WeddingCorrespondenceEntry[] {
  return Array.isArray(entries) ? entries : []
}
