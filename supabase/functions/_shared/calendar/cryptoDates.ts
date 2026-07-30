/** Shared calendar-date helpers for Edge Functions (Deno). */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/

export function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const match = DATE_RE.exec(value.trim())
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

export function addOneCalendarDay(isoDate: string): string {
  const base = toCalendarDate(isoDate)
  if (!base) throw new Error(`Invalid calendar date: ${isoDate}`)
  const [y, m, d] = base.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + 1)
  return utc.toISOString().slice(0, 10)
}

export function toIcsDateValue(isoDate: string): string {
  const base = toCalendarDate(isoDate)
  if (!base) throw new Error(`Invalid calendar date: ${isoDate}`)
  return base.replaceAll('-', '')
}

export function todayCalendarDate(
  timeZone = 'Europe/Warsaw',
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) return now.toISOString().slice(0, 10)
  return `${y}-${m}-${d}`
}

export function isCalendarDateOnOrAfter(
  eventDate: string,
  referenceDate: string,
): boolean {
  const a = toCalendarDate(eventDate)
  const b = toCalendarDate(referenceDate)
  if (!a || !b) return false
  return a >= b
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n')
}

const CRLF = '\r\n'
const FOLD_LIMIT = 75

export function foldIcsLine(line: string): string {
  if (line.length <= FOLD_LIMIT) return line
  const chunks: string[] = []
  let remaining = line
  let first = true
  while (remaining.length > 0) {
    const limit = first ? FOLD_LIMIT : FOLD_LIMIT - 1
    if (remaining.length <= limit) {
      chunks.push(first ? remaining : ` ${remaining}`)
      break
    }
    const piece = remaining.slice(0, limit)
    chunks.push(first ? piece : ` ${piece}`)
    remaining = remaining.slice(limit)
    first = false
  }
  return chunks.join(CRLF)
}

export function stableAppleEventUid(
  entityType: string,
  entityId: string,
  domain = 'ourwed.app',
): string {
  return `${entityType}-${entityId}@${domain}`
}

function formatIcsUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

export type CanonicalEvent = {
  entityType: 'wedding' | 'session'
  entityId: string
  startDate: string
  endDateExclusive: string
  title: string
  eligible: boolean
  fingerprint: string
}

export function buildAppleIcsDocument(
  events: CanonicalEvent[],
  now = new Date(),
): string {
  const stamp = formatIcsUtcStamp(now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OurWed//Calendar//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OurWed',
    'X-WR-CALDESC:Śluby i sesje z OurWed (tylko do odczytu)',
  ]

  for (const event of events) {
    if (!event.eligible) continue
    const uid = stableAppleEventUid(event.entityType, event.entityId)
    const seq = Math.abs(
      Array.from(event.fingerprint).reduce(
        (acc, ch) => (acc + ch.charCodeAt(0)) % 1_000_000,
        0,
      ),
    )
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART;VALUE=DATE:${toIcsDateValue(event.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${toIcsDateValue(event.endDateExclusive)}`)
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`)
    lines.push(`SEQUENCE:${seq}`)
    lines.push(`LAST-MODIFIED:${stamp}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join(CRLF) + CRLF
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function randomPkceVerifier(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return base64UrlEncode(buf)
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/** AES-GCM encrypt with key from env (base64 32 bytes) or passphrase-derived. */
export async function encryptSecret(
  plaintext: string,
  keyMaterial: string,
): Promise<string> {
  const key = await importAesKey(keyMaterial)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const packed = new Uint8Array(iv.length + cipher.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(cipher), iv.length)
  return base64UrlEncode(packed)
}

export async function decryptSecret(
  packedB64: string,
  keyMaterial: string,
): Promise<string> {
  const key = await importAesKey(keyMaterial)
  const packed = base64UrlDecode(packedB64)
  const iv = packed.slice(0, 12)
  const data = packed.slice(12)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  )
  return new TextDecoder().decode(plain)
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const b64 = padded + '='.repeat(padLen)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function importAesKey(keyMaterial: string): Promise<CryptoKey> {
  let raw: Uint8Array
  try {
    raw = base64UrlDecode(keyMaterial)
  } catch {
    raw = new TextEncoder().encode(keyMaterial)
  }
  if (raw.length !== 32) {
    const hash = await crypto.subtle.digest('SHA-256', raw)
    raw = new Uint8Array(hash)
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export function logCalendar(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields: Record<string, unknown>,
): void {
  const safe = { ...fields }
  for (const key of Object.keys(safe)) {
    const lower = key.toLowerCase()
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('authorization')
    ) {
      delete safe[key]
    }
  }
  const payload = { message, ...safe }
  if (level === 'error') console.error('[calendar]', payload)
  else if (level === 'warn') console.warn('[calendar]', payload)
  else console.info('[calendar]', payload)
}
