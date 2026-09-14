/**
 * Deterministic DEV intent parsing for Zapytaj OurWed.
 * Extracts person/date from Polish natural phrases — never send whole sentences
 * into wedding text search.
 *
 * Local parser and (future) Edge LLM both produce AssistantSemanticRequest.
 */

import { parsePolishDatePhrase } from '../dates'
import type {
  AssistantSemanticRequest,
  PlaceRoleFilter,
} from '../types'

const MONTH_WORD =
  'stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia'

const STOPWORDS = new Set(
  [
    'ile',
    'do',
    'zapłaty',
    'zaplaty',
    'zapłacić',
    'zaplacic',
    'zostało',
    'zostalo',
    'pozostało',
    'pozostalo',
    'wpłacone',
    'wplacone',
    'wpłacono',
    'wplacono',
    'dopłaty',
    'doplaty',
    'dopłata',
    'doplata',
    'rozliczenie',
    'rozliczenia',
    'finanse',
    'ma',
    'mam',
    'musi',
    'jeszcze',
    'u',
    'dla',
    'gdzie',
    'przygotowania',
    'przygotowań',
    'przygotowan',
    'przygotowanie',
    'ceremonia',
    'ceremonii',
    'ceremonię',
    'ceremonie',
    'przyjęcie',
    'przyjecie',
    'przyjęciu',
    'przyjeciu',
    'wesele',
    'wesela',
    'pokaż',
    'pokaz',
    'plan',
    'dnia',
    'harmonogram',
    'godziny',
    'otwórz',
    'otworz',
    'zlecenie',
    'zlecenia',
    'ślub',
    'slub',
    'ślubu',
    'slubu',
    'sesję',
    'sesje',
    'sesja',
    'sesji',
    'co',
    'dalej',
    'krok',
    'następny',
    'nastepny',
    'jutro',
    'dziś',
    'dzis',
    'pojutrze',
    'sobotę',
    'sobote',
    'na',
    'z',
    'w',
    'o',
    'której',
    'ktorej',
    'i',
    'a',
    'jest',
    'jestem',
    'moja',
    'moje',
    'tego',
    'tej',
    'ten',
    'ta',
    'jak',
    'jakie',
    'jaka',
    'jaki',
    'jaką',
    'jaka',
    'wygląda',
    'wyglada',
    'kwota',
    'wartość',
    'wartosc',
    'umowy',
    'pakiet',
    'termin',
    'data',
    'proszę',
    'prosze',
    'mi',
    'się',
    'sie',
    'czy',
    'może',
    'moze',
    'nowe',
    'nowy',
    'dodaj',
    'stwórz',
    'stworz',
    'zadanie',
    'zadania',
    'zadań',
    'zadan',
    'przy',
    'robię',
    'robie',
    'zrobić',
    'zrobic',
  ].map((s) => s.toLowerCase()),
)

/** @deprecated Prefer AssistantSemanticRequest via parseAssistantSemanticRequest */
export type AssistantDevIntent =
  | { kind: 'schedule'; datePhrase: string }
  | { kind: 'finance'; person: string | null; dateHint: string | null }
  | { kind: 'places'; person: string | null; dateHint: string | null }
  | { kind: 'day_plan'; person: string | null; dateHint: string | null }
  | { kind: 'tasks'; person: string | null; dateHint: string | null }
  | { kind: 'next_action'; person: string | null; dateHint: string | null }
  | { kind: 'open_wedding'; person: string | null; dateHint: string | null }
  | { kind: 'open_session'; person: string | null }
  | { kind: 'open_resource'; person: string | null; dateHint: string | null }
  | {
      kind: 'create_wedding'
      partner1: string
      partner2: string
      date: string
    }
  | {
      kind: 'create_task'
      title: string
      duePhrase: string | null
      weddingQuery: string | null
    }
  | { kind: 'unsupported' }
  | { kind: 'unrecognized' }

export function normalizeAssistantQuery(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[?.!…]+$/g, '')
    .trim()
}

/** Strip common Polish case endings so "Aleksandry" can match "Aleksandra". */
export function polishPersonSearchQueries(name: string): string[] {
  const raw = name.trim()
  if (!raw) return []
  const out = new Set<string>([raw])

  const lower = raw.toLowerCase()
  // Natalii / Julii → Natalia / Julia
  if (lower.endsWith('ii') && lower.length > 4) {
    out.add(`${raw.slice(0, -1)}a`)
  }
  // Aleksandry → Aleksandra
  if (/y$/i.test(raw) && raw.length > 4) {
    out.add(`${raw.slice(0, -1)}a`)
  }
  // Juliią / Julią → Julia
  if (/[ąę]$/i.test(raw) && raw.length > 3) {
    out.add(`${raw.slice(0, -1)}a`)
  }
  // Kanickiej → Kanicka (adjective/surname genitive-ish)
  if (/iej$/i.test(raw) && raw.length > 5) {
    out.add(`${raw.slice(0, -3)}a`)
  }
  if (/ego$/i.test(raw) && raw.length > 5) {
    out.add(raw.slice(0, -3))
  }
  if (/emu$/i.test(raw) && raw.length > 5) {
    out.add(raw.slice(0, -3))
  }
  // Light stem for includes() (Aleksandr ⊂ Aleksandra) — still exact substring, not fuzzy edit distance
  if (raw.length >= 5) {
    out.add(raw.slice(0, raw.length - 1))
  }
  if (raw.length >= 6) {
    out.add(raw.slice(0, Math.min(6, raw.length)))
  }

  return [...out]
}

export function extractDateHint(text: string): {
  hint: string | null
  withoutDate: string
} {
  const named = text.match(
    new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTH_WORD})(?:\\s+\\d{4})?)\\b`, 'i'),
  )
  if (named?.[1]) {
    return {
      hint: named[1].trim(),
      withoutDate: text.replace(named[0], ' ').replace(/\s+/g, ' ').trim(),
    }
  }
  const dotted = text.match(
    /\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/,
  )
  if (dotted?.[1]) {
    return {
      hint: dotted[1].trim(),
      withoutDate: text.replace(dotted[0], ' ').replace(/\s+/g, ' ').trim(),
    }
  }
  return { hint: null, withoutDate: text }
}

export function extractPersonName(text: string): string | null {
  const { withoutDate } = extractDateHint(text)
  const cleaned = normalizeAssistantQuery(withoutDate)

  const patterns: RegExp[] = [
    /\b(?:u|dla|przy)\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)\b/i,
    /\bzleceni[ea]\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)\b/i,
    /\b(?:ślub|slub|sesj[aęi])\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)\b/i,
    /\b([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)\s+ma\b/i,
    /\bma\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)\b/i,
    /\bz\s+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}(?:\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,})?)(?:\s|$)/i,
  ]

  for (const re of patterns) {
    const m = cleaned.match(re)
    const candidate = m?.[1]?.trim()
    if (candidate && isPersonCandidate(candidate)) {
      return candidate
    }
  }

  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t.toLowerCase()))
    .filter((t) => /^[\p{L}]+$/u.test(t))

  if (tokens.length === 0) return null
  // Prefer last 1–2 content tokens (name / name+surname)
  if (tokens.length >= 2) {
    const two = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`
    if (isPersonCandidate(two)) return two
  }
  return tokens[tokens.length - 1] ?? null
}

function isPersonCandidate(candidate: string): boolean {
  const parts = candidate.split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 2) return false
  return parts.every((p) => p.length >= 3 && !STOPWORDS.has(p.toLowerCase()))
}

/** True when wedding ISO date matches day.month hint (year optional). */
export function weddingMatchesDateHint(
  weddingDate: string | null | undefined,
  hint: string,
  todayKey?: string,
): boolean {
  if (!weddingDate) return false
  const iso = weddingDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false

  const hintTrim = hint.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(hintTrim)) {
    return iso === hintTrim
  }

  const dotted = hintTrim.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/)
  if (dotted) {
    const day = Number(dotted[1])
    const month = Number(dotted[2])
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    if (dotted[3]) {
      let year = Number(dotted[3])
      if (dotted[3].length === 2) year += 2000
      return iso === `${year}-${mm}-${dd}`
    }
    return iso.endsWith(`-${mm}-${dd}`)
  }

  const parsed = parsePolishDatePhrase(hintTrim, todayKey)
  if (parsed) {
    const namedNoYear = hintTrim.match(
      new RegExp(`^\\d{1,2}\\s+(?:${MONTH_WORD})$`, 'i'),
    )
    if (namedNoYear) {
      return iso.slice(5) === parsed.slice(5)
    }
    return iso === parsed
  }

  return false
}

function placeRoleFromText(lower: string): PlaceRoleFilter {
  if (/\bprzygotowa/i.test(lower)) return 'preparations'
  if (/\bceremon/i.test(lower)) return 'ceremony'
  // "przyjęcie" / "sali" / "sala" — avoid trailing \b after stem (breaks "przyjęcie")
  if (
    /\bprzyj[eę]c/i.test(lower) ||
    /\bsal[aeiyęą]\b/i.test(lower) ||
    /\bwesel/i.test(lower)
  ) {
    return 'reception'
  }
  if (/\bślub\b|\bslub\b/i.test(lower) && !/\bzlecen/i.test(lower)) {
    return 'all'
  }
  return 'all'
}

/** Day-plan focus from utterance — never treat bare "o której" as ceremony. */
function dayPlanFocusFromText(lower: string): 'ceremony' | 'preparations' | 'full' {
  if (/\bprzygotowa/i.test(lower) && !/\bceremon/i.test(lower)) {
    return 'preparations'
  }
  if (/\bceremon/i.test(lower) && !/\bprzygotowa/i.test(lower)) {
    return 'ceremony'
  }
  if (/\bplan\s+dnia\b|\bharmonogram\b/i.test(lower)) return 'full'
  return 'full'
}

function weddingResolver(
  text: string,
  dateHint: string | null,
): { personQuery: string | null; dateHint: string | null } {
  return {
    personQuery: extractPersonName(text),
    dateHint,
  }
}

/**
 * Primary entry: natural language → semantic request.
 * Edge LLM should eventually emit the same structure.
 */
export function parseAssistantSemanticRequest(
  raw: string,
): AssistantSemanticRequest {
  const text = normalizeAssistantQuery(raw)
  const lower = text.toLowerCase()

  if (
    /\b(usuń|usun|delete|generuj\s+umow|wyślij\s+anket|wyslij\s+anket|travel|dojazd)\b/i.test(
      lower,
    ) ||
    /\b(zapłać|zaplac)\b/i.test(lower) ||
    /\b(oznacz\s+jako\s+opłac|zmień\s+wartość|zmien\s+wartosc|dodaj\s+płatność|dodaj\s+platnosc)\b/i.test(
      lower,
    )
  ) {
    return { kind: 'unsupported' }
  }

  const createWedding = text.match(
    /(?:stwórz|stworz|dodaj)\s+ślub\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+(.+?)\s+i\s+(.+)/i,
  )
  if (createWedding) {
    return {
      kind: 'prepare_create_wedding',
      date: createWedding[1]!.trim(),
      partner1: createWedding[2]!.trim(),
      partner2: createWedding[3]!.trim().replace(/[?.!]+$/g, ''),
    }
  }

  // "dodaj zadanie Julii na jutro: zadzwonić" | "dodaj zadanie do X na jutro: ..."
  const createTaskColon = text.match(
    /(?:dodaj|stwórz|stworz)\s+zadanie(?:\s+(?:do\s+)?(.+?))?(?:\s+na\s+(jutro|dziś|dzis|pojutrze|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?))?\s*:\s*(.+)/i,
  )
  if (createTaskColon) {
    return {
      kind: 'prepare_create_task',
      weddingQuery: createTaskColon[1]?.trim() || null,
      duePhrase: createTaskColon[2]?.trim() || null,
      title: createTaskColon[3]!.trim().replace(/[?.!]+$/g, ''),
    }
  }

  // Next action BEFORE schedule ("co mam zrobić z X" ≠ "co mam jutro")
  const { hint: dateHintEarly } = extractDateHint(text)
  if (
    /\bco\s+dalej\b/i.test(lower) ||
    /\bco\s+mam\s+zrobić\s+z\b/i.test(lower) ||
    /\bco\s+mam\s+zrobic\s+z\b/i.test(lower) ||
    /\bjaki\s+(jest\s+)?następn/i.test(lower) ||
    /\bnastępn(y|ym)\s+krok/i.test(lower)
  ) {
    return {
      kind: 'wedding_next_action',
      resolver: weddingResolver(text, dateHintEarly),
    }
  }

  // Schedule — before finance so "co mam jutro" wins over loose "mam"
  if (
    /^co\s+mam\s+/i.test(lower) ||
    /\bco\s+mam\s+(jutro|dziś|dzis|pojutrze|\d|w\s+)/i.test(lower) ||
    /\bco\s+robię\s+(jutro|dziś|dzis)/i.test(lower) ||
    /\bjakie\s+mam\s+(jutro|dziś|dzis).*(zlecen|ślub|slub|sesj)/i.test(lower) ||
    /\bco\s+jest\s+w\s+sobot/i.test(lower)
  ) {
    // Distinguish "co mam zrobić przy Julii" (tasks) from schedule
    if (
      /\b(zrobić|zrobic|zadani)/i.test(lower) &&
      /\b(przy|u|dla)\b/i.test(lower)
    ) {
      // fall through to tasks
    } else {
      const dateMatch =
        lower.match(/co\s+mam\s+(.+)$/i) ||
        lower.match(/co\s+robię\s+(.+)$/i) ||
        lower.match(/co\s+jest\s+(.+)$/i) ||
        lower.match(/jakie\s+mam\s+(.+?)(?:\s+zlecen|\s+ślub|\s+slub|$)/i)
      return {
        kind: 'schedule',
        datePhrase: (dateMatch?.[1] ?? 'jutro').replace(/[?.!]+$/g, '').trim(),
      }
    }
  }

  const { hint: dateHint } = extractDateHint(text)

  if (
    /\b(zapłat|zaplat|finanse|pozostał|pozostal|wpłac|wplac|do\s+zapłaty|do\s+zaplaty|dopłat|doplat|rozliczen|wartość\s+umow|wartosc\s+umow)\b/i.test(
      lower,
    ) ||
    /\bile\s+(jeszcze\s+)?(zostało|zostalo|ma)\b/i.test(lower)
  ) {
    return {
      kind: 'wedding_finances',
      resolver: weddingResolver(text, dateHint),
    }
  }

  if (
    /\bplan\s+dnia\b/i.test(lower) ||
    /\bharmonogram\b/i.test(lower) ||
    /\bjak\s+wygląda\s+dzień\b/i.test(lower) ||
    /\bjak\s+wyglada\s+dzien\b/i.test(lower) ||
    /\bjakie\s+ma\s+godziny\b/i.test(lower) ||
    /\bo\s+której\b/i.test(lower) ||
    /\bo\s+ktorej\b/i.test(lower)
  ) {
    return {
      kind: 'wedding_day_plan',
      resolver: weddingResolver(text, dateHint),
      focus: dayPlanFocusFromText(lower),
    }
  }

  if (
    /\b(przygotowa|ceremon|przyj[eę]c|miejsc|wesel|sal[aeiyęą])/i.test(
      lower,
    ) ||
    (/\bgdzie\b/i.test(lower) &&
      /\b(przygotowa|ceremon|przyj[eę]c|ślub|slub|wesel|sal[aeiyęą])/i.test(
        lower,
      ))
  ) {
    return {
      kind: 'wedding_places',
      resolver: weddingResolver(text, dateHint),
      requestedRole: placeRoleFromText(lower),
    }
  }

  if (
    /\bzadani/i.test(lower) ||
    (/\bco\s+mam\s+zrobić\b/i.test(lower) && /\b(przy|u)\b/i.test(lower)) ||
    /\bjakie\s+mam\s+(zrobić|zadani)/i.test(lower)
  ) {
    return {
      kind: 'wedding_tasks',
      resolver: weddingResolver(text, dateHint),
    }
  }

  // Contextual short follow-ups BEFORE open (bare "otwórz" needs session wedding)
  if (/^(a\s+)?(plan\s+dnia|harmonogram)\??$/i.test(lower)) {
    return {
      kind: 'wedding_day_plan',
      resolver: { personQuery: null, dateHint: null },
      focus: 'full',
    }
  }
  if (/^(a\s+)?gdzie\s+(ma\s+)?przygotowa/i.test(lower)) {
    return {
      kind: 'wedding_places',
      resolver: { personQuery: null, dateHint: null },
      requestedRole: 'preparations',
    }
  }
  if (
    /^(a\s+)?ile\s+(zostało|zostalo)?\s*(do\s+zapłaty|do\s+zaplaty)?\??$/i.test(
      lower,
    ) ||
    /^ile\s+zostało\s+do\s+zapłaty\??$/i.test(lower)
  ) {
    return {
      kind: 'wedding_finances',
      resolver: { personQuery: null, dateHint: null },
    }
  }
  if (/^otwórz$|^otworz$/i.test(lower)) {
    return {
      kind: 'open_wedding',
      resolver: { personQuery: null, dateHint: null },
    }
  }
  if (/^co\s+dalej\??$/i.test(lower)) {
    return {
      kind: 'wedding_next_action',
      resolver: { personQuery: null, dateHint: null },
    }
  }

  if (/\b(otwórz|otworz|pokaż|pokaz)\b/i.test(lower)) {
    if (/\bsesj/i.test(lower)) {
      return {
        kind: 'open_session',
        resolver: { personQuery: extractPersonName(text) },
      }
    }
    if (/\b(zleceni[ea]?|ślub|slub)\b/i.test(lower)) {
      return {
        kind: 'open_wedding',
        resolver: weddingResolver(text, dateHint),
      }
    }
    // bare "otwórz" / "pokaż X"
    return {
      kind: 'open_resource',
      resolver: weddingResolver(text, dateHint),
    }
  }

  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) {
    const personOnly = extractPersonName(text)
    if (personOnly) {
      return {
        kind: 'open_resource',
        resolver: { personQuery: personOnly, dateHint },
      }
    }
  }

  return { kind: 'unrecognized' }
}

/**
 * Infer finance metric aspect from utterance using existing finance vocabulary.
 * Used to bind collection aggregate follow-ups — not a one-off phrase table.
 * Returns null when no explicit money metric cue is present.
 */
export function inferFinanceAspectFromUtterance(
  utterance: string | null | undefined,
): 'remaining' | 'paid' | 'contract_value' | null {
  const text = (utterance ?? '').trim()
  if (!text) return null
  const lower = normalizeAssistantQuery(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')

  // Contract value before paid/remaining so "łączna wartość" wins.
  if (
    /\bwartosc\b/i.test(lower) ||
    /\blaczn\w*\s+(wartosc|kwot)/i.test(lower) ||
    /\bwartosc\s+umow/i.test(lower)
  ) {
    return 'contract_value'
  }

  // Paid — exclude "ile jeszcze …" remaining family.
  if (
    /\bwplac\w*\b/i.test(lower) ||
    /\b(otrzymal|dostal\s+juz)\w*\b/i.test(lower)
  ) {
    if (!/\bile\s+jeszcze\b/i.test(lower) && !/\b(zostal|pozostal)/i.test(lower)) {
      return 'paid'
    }
  }

  // Remaining — same cues that already gate wedding_finances locally.
  if (
    /\b(zostal|pozostal|do\s+zaplat|doplat|wisz)\w*\b/i.test(lower) ||
    /\bile\s+(jeszcze\s+)?(zostal|ma)\b/i.test(lower) ||
    /\bile\s+jeszcze\b/i.test(lower)
  ) {
    return 'remaining'
  }

  return null
}

/**
 * Principle-based repair of place/time scope from the user utterance.
 * Used for Edge + local paths so visible answers keep role ownership.
 * Does not hardcode person names or venue strings.
 */
export function refineSemanticRequestFromUtterance(
  request: AssistantSemanticRequest,
  utterance: string | null | undefined,
): AssistantSemanticRequest {
  const text = (utterance ?? '').trim()
  if (!text) return request
  const lower = normalizeAssistantQuery(text).toLowerCase()

  const mentionsPrep = /\bprzygotowa/i.test(lower)
  const mentionsCeremony = /\bceremon/i.test(lower)
  const mentionsReception =
    /\bprzyj[eę]c/i.test(lower) ||
    /\bsal[aeiyęą]\b/i.test(lower) ||
    /\bwesel/i.test(lower)
  const isLocationAsk = /\bgdzie\b/i.test(lower)
  const isTimeAsk = /\bo\s+kt[oó]rej\b/i.test(lower)

  const inferredPlaceRole = (): PlaceRoleFilter => {
    if (mentionsPrep) return 'preparations'
    if (mentionsCeremony) return 'ceremony'
    if (mentionsReception) return 'reception'
    return 'all'
  }

  const inferredDayFocus = (): 'ceremony' | 'preparations' | 'full' =>
    dayPlanFocusFromText(lower)

  // Upgrade unrecognized finance metric asks (Edge miss) via local finance parse.
  if (request.kind === 'unrecognized' || request.kind === 'unsupported') {
    const financeAspect = inferFinanceAspectFromUtterance(text)
    if (financeAspect) {
      const parsed = parseAssistantSemanticRequest(text)
      if (parsed.kind === 'wedding_finances') {
        return {
          ...parsed,
          financeAspect: parsed.financeAspect ?? financeAspect,
        }
      }
    }
  }

  // Attach explicit metric aspect onto wedding_finances when missing.
  if (request.kind === 'wedding_finances' && !request.financeAspect) {
    const financeAspect = inferFinanceAspectFromUtterance(text)
    if (financeAspect) {
      return { ...request, financeAspect }
    }
  }

  // Location question misclassified as day_plan → places (never ceremony card)
  if (
    request.kind === 'wedding_day_plan' &&
    isLocationAsk &&
    !isTimeAsk &&
    (mentionsPrep || mentionsCeremony || mentionsReception)
  ) {
    const role = inferredPlaceRole()
    return {
      kind: 'wedding_places',
      resolver: request.resolver,
      requestedRole: role === 'all' ? 'reception' : role,
      participantKey: request.participantKey ?? null,
      participantRole: request.participantRole ?? null,
    }
  }

  if (request.kind === 'wedding_day_plan') {
    if (mentionsPrep && !mentionsCeremony && request.focus !== 'preparations') {
      return { ...request, focus: 'preparations' }
    }
    if (mentionsCeremony && !mentionsPrep && request.focus !== 'ceremony') {
      return { ...request, focus: 'ceremony' }
    }
    // Bare "o której" must not stay locked on ceremony without ceremony cue
    if (
      isTimeAsk &&
      !mentionsCeremony &&
      !mentionsPrep &&
      request.focus === 'ceremony'
    ) {
      return { ...request, focus: 'full' }
    }
  }

  if (request.kind === 'wedding_places') {
    const role = inferredPlaceRole()
    if (role !== 'all' && role !== request.requestedRole) {
      return { ...request, requestedRole: role }
    }
  }

  if (
    (request.kind === 'unrecognized' || request.kind === 'unsupported') &&
    isLocationAsk &&
    (mentionsPrep || mentionsCeremony || mentionsReception)
  ) {
    const role = inferredPlaceRole()
    return {
      kind: 'wedding_places',
      resolver: {
        personQuery: extractPersonName(text),
        dateHint: null,
      },
      requestedRole: role === 'all' ? 'reception' : role,
      participantKey: null,
      participantRole: null,
    }
  }

  if (
    (request.kind === 'unrecognized' || request.kind === 'unsupported') &&
    isTimeAsk
  ) {
    return {
      kind: 'wedding_day_plan',
      resolver: {
        personQuery: extractPersonName(text),
        dateHint: null,
      },
      focus: inferredDayFocus(),
      participantKey: null,
      participantRole: null,
    }
  }

  return request
}

/** Legacy adapter used by older tests. */
export function parseAssistantDevIntent(raw: string): AssistantDevIntent {
  const s = parseAssistantSemanticRequest(raw)
  switch (s.kind) {
    case 'schedule':
      return { kind: 'schedule', datePhrase: s.datePhrase }
    case 'wedding_finances':
      return {
        kind: 'finance',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'wedding_places':
      return {
        kind: 'places',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'wedding_day_plan':
      return {
        kind: 'day_plan',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'wedding_tasks':
      return {
        kind: 'tasks',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'wedding_next_action':
      return {
        kind: 'next_action',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'open_wedding':
      return {
        kind: 'open_wedding',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'open_session':
      return { kind: 'open_session', person: s.resolver.personQuery }
    case 'open_resource':
      return {
        kind: 'open_resource',
        person: s.resolver.personQuery,
        dateHint: s.resolver.dateHint,
      }
    case 'prepare_create_wedding':
      return {
        kind: 'create_wedding',
        partner1: s.partner1,
        partner2: s.partner2,
        date: s.date,
      }
    case 'prepare_create_task':
      return {
        kind: 'create_task',
        title: s.title,
        duePhrase: s.duePhrase,
        weddingQuery: s.weddingQuery,
      }
    case 'unsupported':
      return { kind: 'unsupported' }
    case 'unrecognized':
    case 'aggregate':
      return { kind: 'unrecognized' }
    default: {
      const _e: never = s
      void _e
      return { kind: 'unrecognized' }
    }
  }
}
