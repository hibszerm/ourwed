/**
 * Presentation-only intent classification for display policy.
 * Conservative lexical matching — Polish primary. No NLP / no model.
 */

export type PresentationIntent =
  | 'phone'
  | 'email'
  | 'address'
  | 'questionnaire'
  | 'wedding'
  | 'session'
  | 'calendar'
  | 'finance'
  | 'aggregate'
  | 'collection'
  | 'distance'
  | 'general'

function normalizeUtterance(raw: string): string {
  return raw
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAny(hay: string, needles: readonly string[]): boolean {
  return needles.some((n) => hay.includes(n))
}

const DISTANCE = [
  'daleko',
  'dystans',
  'trasa',
  'dojazd',
  'ile km',
  'ile kilometr',
  'jak daleko',
  'droga do',
] as const

const COLLECTION = [
  'jakie mam zlecenia',
  'jakie mam wesela',
  'jakie mam sesje',
  'jakie zlecenia',
  'jakie wesela',
  'jakie sesje',
  'pokaz je',
  'pokaż je',
  'pokaz wesela',
  'pokaż wesela',
  'pokaz zlecenia',
  'pokaż zlecenia',
  'pokaz sesje',
  'pokaż sesje',
  'lista zlecen',
  'lista wesel',
  'lista sesji',
  'ktore to',
  'które to',
  'jakie to wesela',
  'jakie to zlecenia',
  'do konca roku',
  'do końca roku',
  'w tym roku',
] as const

const AGGREGATE = [
  'ile wesel',
  'ile sesji',
  'ile zlecen',
  'ile mam',
  'liczba wesel',
  'liczba sesji',
  'ile mam wesel',
  'ile mam sesji',
] as const

const QUESTIONNAIRE = [
  'ankieta',
  'ankiety',
  'ankiete',
  'przedslubn',
] as const

const FINANCE = [
  'zaplat',
  'pozostal',
  'wplac',
  'platnosc',
  'platnosci',
  'finanse',
  'kwota',
  'cena',
  'wartosc',
  'do zaplaty',
  'oplacon',
] as const

const PHONE = [
  'telefon',
  'numer telefonu',
  'numer do',
  'zadzwon',
  'zadzwonic',
  'kontakt telefoniczny',
  'jej numer',
  'jego numer',
  'podaj numer',
  'jaki numer',
] as const

const EMAIL = [
  'email',
  'e-mail',
  'mail',
  'adres mailowy',
  'adres email',
  'napisz mail',
] as const

const ADDRESS = [
  'adres',
  'gdzie',
  'lokalizacja',
  'dojazd',
  'nawiguj',
  'nawigacja',
  'przygotowania',
  'przygotowuje',
  'ceremonia',
  'przyjecie',
  'sala',
] as const

const SESSION = ['sesja', 'sesji', 'sesje', 'sesje ', 'sesję'] as const

const CALENDAR = [
  'kiedy',
  'termin',
  'wolny termin',
  'dostepny',
  'kalendarz',
  'co mam jutro',
  'co mam dzisiaj',
  'co mam dzis',
  'co mam pojutrze',
  'co mam w',
  'plan na jutro',
  'plan na dzisiaj',
] as const

const WEDDING = [
  'opowiedz',
  'slub',
  'zlecenie',
  'wesele',
  'wesela',
  'co wiesz o',
  'jak wyglada',
  'szczegoly zlecenia',
] as const

/**
 * High-confidence presentation intent only.
 * First matching specific category wins; else general.
 */
export function classifyPresentationIntent(utterance: string): PresentationIntent {
  const u = normalizeUtterance(utterance)
  if (!u) return 'general'

  if (hasAny(u, AGGREGATE)) return 'aggregate'
  if (hasAny(u, COLLECTION)) return 'collection'
  if (hasAny(u, DISTANCE)) return 'distance'
  if (hasAny(u, QUESTIONNAIRE)) return 'questionnaire'
  if (hasAny(u, FINANCE)) return 'finance'
  if (hasAny(u, PHONE)) return 'phone'
  // Avoid classifying "mail" inside unrelated words — already normalized
  if (hasAny(u, EMAIL) && !u.includes('email marketing')) return 'email'
  if (hasAny(u, ADDRESS)) return 'address'
  if (hasAny(u, SESSION)) return 'session'
  if (hasAny(u, CALENDAR)) return 'calendar'
  if (hasAny(u, WEDDING)) return 'wedding'

  return 'general'
}
