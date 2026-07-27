/**
 * Polish contractual role-phrase anchors for the client party clause.
 *
 * Grammatical gender/number variants and role-label forms locate the clause —
 * they must NEVER decide readiness. Shared by candidate detection and the
 * slot binder.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'

/** Participles / verbal adjectives used before „dalej …” role labels. */
export const CLIENT_PARTY_ROLE_PARTICIPLES = [
  'zwaną',
  'zwanego',
  'zwanym',
  'zwanej',
  'zwani',
  'zwane',
  'zwanych',
  'zwanymi',
  'zwany',
  'określaną',
  'określanego',
  'określanym',
  'określanej',
  'określani',
  'określane',
  'określonych',
  'określonymi',
  'określany',
] as const

/**
 * Canonical stems for client-side contractual labels (case-insensitive).
 * Matching uses normalizeClientPartyRoleLabel — exact case is not required.
 */
export type ClientPartyRoleFamily = 'couple' | 'client'

const CLIENT_LABEL_STEMS: Array<{
  family: ClientPartyRoleFamily
  /** Lowercased stems / phrases matched against normalized label text. */
  stems: string[]
}> = [
  {
    family: 'couple',
    stems: [
      'para młoda',
      'parą młodą',
      'pary młodej',
      'parze młodej',
      'młodą parą',
      'narzeczeni',
      'narzeczonymi',
      'narzeczonych',
      'nowożeńcy',
      'nowożeńcami',
      'nowożeńców',
    ],
  },
  {
    family: 'client',
    stems: [
      'klient',
      'klienta',
      'klientem',
      'klientowi',
      'klientka',
      'klientki',
      'klientką',
      'klientce',
      'klienci',
      'klientów',
      'klientami',
      'klientom',
      'zamawiający',
      'zamawiającego',
      'zamawiającym',
      'zamawiająca',
      'zamawiającą',
      'zamawiającej',
      'zamawiającymi',
      'zamawiających',
      'usługobiorca',
      'usługobiorcą',
      'usługobiorcy',
      'usługobiorcami',
      'zleceniodawca',
      'zleceniodawcą',
      'zleceniodawcy',
      'zleceniodawcami',
    ],
  },
]

/** Provider-side labels — never client anchors. */
const PROVIDER_LABEL_STEMS = [
  'fotograf',
  'fotografem',
  'fotografa',
  'fotografami',
  'filmowiec',
  'filmowcem',
  'filmowca',
  'kamerzysta',
  'kamerzystą',
  'kamerzystami',
  'wykonawca',
  'wykonawcą',
  'wykonawcami',
  'usługodawca',
  'usługodawcą',
  'usługodawcami',
  'studio',
]

function stripQuotes(s: string): string {
  return s.replace(/^[„"'\s]+|[„"'\s.]+$/g, '').trim()
}

/**
 * Normalize a contractual role label to a family, or null if unknown/provider.
 */
export function normalizeClientPartyRoleLabel(
  sourceText: string,
): ClientPartyRoleFamily | null {
  const raw = stripQuotes(canonicalizeParagraphText(sourceText)).toLocaleLowerCase(
    'pl-PL',
  )
  if (!raw) return null
  if (PROVIDER_LABEL_STEMS.some((s) => raw === s || raw.startsWith(s + ' '))) {
    return null
  }
  // Exact / prefix stem match (handles Klientami, Klientów, …)
  for (const group of CLIENT_LABEL_STEMS) {
    for (const stem of group.stems) {
      if (raw === stem || raw.startsWith(stem)) return group.family
    }
  }
  // Loose contains for multi-word couple phrases already covered; also
  // "Parą Młodą" after quote stripping.
  if (/par[aąy]\s+młod/i.test(raw)) return 'couple'
  if (/klient/i.test(raw)) return 'client'
  if (/zamawiaj/i.test(raw)) return 'client'
  if (/usługobior/i.test(raw) || /zleceniodaw/i.test(raw)) return 'client'
  if (/narzecz|nowożeń/i.test(raw)) return 'couple'
  return null
}

export function isProviderPartyRoleLabel(sourceText: string): boolean {
  const raw = stripQuotes(canonicalizeParagraphText(sourceText)).toLocaleLowerCase(
    'pl-PL',
  )
  return PROVIDER_LABEL_STEMS.some((s) => raw === s || raw.startsWith(s))
}

/** Representative quoted label forms for exact-anchor generation (binder). */
export const CLIENT_PARTY_ROLE_LABELS = [
  '„Parą Młodą”',
  '"Parą Młodą"',
  '„Zamawiającego”',
  '"Zamawiającego"',
  '„Zamawiającą”',
  '"Zamawiającą"',
  '„Zamawiającymi”',
  '"Zamawiającymi"',
  '„Zamawiający”',
  '"Zamawiający"',
  '„Klientem”',
  '"Klientem"',
  '„Klientami”',
  '"Klientami"',
  '„Klientką”',
  '"Klientką"',
  '„Klientką”.',
  '„Klientami”.',
  '„Usługobiorcą”',
  '"Usługobiorcą"',
  '„Zleceniodawcą”',
  '"Zleceniodawcą"',
  '„Narzeczonymi”',
  '"Narzeczonymi"',
  '„Nowożeńcami”',
  '"Nowożeńcami"',
] as const

/**
 * Exact right-anchor strings for legacy `findFirstAnchor` / slotBinder.
 * Prefer findClientPartyRoleAnchor for detection.
 */
export function buildClientPartyRightAnchors(): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    if (seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  for (const participle of CLIENT_PARTY_ROLE_PARTICIPLES) {
    for (const label of CLIENT_PARTY_ROLE_LABELS) {
      push(`, ${participle} dalej ${label}`)
      push(` ${participle} dalej ${label}`)
      push(`, ${participle} dalej ${label},`)
    }
  }

  for (const label of CLIENT_PARTY_ROLE_LABELS) {
    push(`, dalej jako ${label}`)
    push(` dalej jako ${label}`)
    push(`, dalej jako ${label},`)
  }

  return out
}

export type ClientPartyRoleAnchorHit = {
  /** Full matched phrase (e.g. `, zwanymi dalej „Klientami”`). */
  matchedText: string
  start: number
  end: number
  roleLabel: string
  family: ClientPartyRoleFamily
  normalizedForm: string
}

const ROLE_ANCHOR_RE =
  /(?:^|[,\s])\s*((?:zwan[a-ząćęłńóśźż]*|określan[a-ząćęłńóśźż]*)\s+dalej|dalej\s+jako)\s+[„"']?([^„"'.,;\n]+)[„"']?/giu

/**
 * Find the earliest client-party role phrase in text.
 * Rejects provider labels (Fotografem, Filmowcem, …).
 */
export function findClientPartyRoleAnchor(
  text: string,
): ClientPartyRoleAnchorHit | null {
  const h = canonicalizeParagraphText(text)
  let best: ClientPartyRoleAnchorHit | null = null
  ROLE_ANCHOR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ROLE_ANCHOR_RE.exec(h)) != null) {
    const roleLabel = stripQuotes(m[2] ?? '')
    if (isProviderPartyRoleLabel(roleLabel)) continue
    const family = normalizeClientPartyRoleLabel(roleLabel)
    if (!family) continue
    // Include leading comma/space in matched span for binder compatibility.
    const matchedText = m[0]!
    const start = m.index
    const end = start + matchedText.length
    const hit: ClientPartyRoleAnchorHit = {
      matchedText,
      start,
      end,
      roleLabel,
      family,
      normalizedForm: family,
    }
    if (!best || hit.start < best.start) best = hit
  }
  return best
}

/** Loose cue: document likely contains a client-party introduction. */
export const CLIENT_PARTY_CLAUSE_CUE_RE =
  /Parą\s+Młod[aą]|Parą\s+Mlod[aą]|Zamawiając|Klient|Usługobior|Zleceniodaw|Narzecz|Nowożeń|zwan[aąeyiychogo]*\s+dalej|określan[aąeyiychogo]*\s+dalej|dalej\s+jako|pomiędzy/iu
