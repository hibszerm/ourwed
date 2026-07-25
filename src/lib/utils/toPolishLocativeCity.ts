/**
 * Deterministic Polish locative (miejscownik) for city names used in contracts
 * (“w Zabrzu”, “w Krakowie”). No AI / no external API.
 *
 * Returns undefined when a safe form cannot be produced.
 */

/** Lowercased NFC key → canonical locative form (preserve Polish chars). */
const LOCATIVE_EXCEPTIONS: Record<string, string> = {
  zabrze: 'Zabrzu',
  warszawa: 'Warszawie',
  kraków: 'Krakowie',
  krakow: 'Krakowie',
  poznań: 'Poznaniu',
  poznan: 'Poznaniu',
  katowice: 'Katowicach',
  tychy: 'Tychach',
  bytom: 'Bytomiu',
  wrocław: 'Wrocławiu',
  wroclaw: 'Wrocławiu',
  gdańsk: 'Gdańsku',
  gdansk: 'Gdańsku',
  łódź: 'Łodzi',
  lodz: 'Łodzi',
  sopot: 'Sopocie',
  lublin: 'Lublinie',
  szczecin: 'Szczecinie',
  rzeszów: 'Rzeszowie',
  rzeszow: 'Rzeszowie',
  zakopane: 'Zakopanem',
  'bielsko-biała': 'Bielsku-Białej',
  'bielsko-biala': 'Bielsku-Białej',
  // Common extras (safe dictionary entries)
  gdynia: 'Gdyni',
  radom: 'Radomiu',
  kielce: 'Kielcach',
  opole: 'Opolu',
  toruń: 'Toruniu',
  torun: 'Toruniu',
  białystok: 'Białymstoku',
  bialystok: 'Białymstoku',
  częstochowa: 'Częstochowie',
  czestochowa: 'Częstochowie',
  gliwice: 'Gliwicach',
  sosnowiec: 'Sosnowcu',
  'zielona góra': 'Zielonej Górze',
  'zielona gora': 'Zielonej Górze',
}

function normalizeCityKey(raw: string): string {
  return raw
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pl-PL')
}

function lookupException(normalized: string): string | undefined {
  return LOCATIVE_EXCEPTIONS[normalized]
}

/**
 * Conservative single-token suffix rules — only patterns that are reliably locative.
 * Returns undefined when unsure.
 */
function conservativeSuffixRule(token: string): string | undefined {
  const n = token.normalize('NFC')
  if (n.length < 3) return undefined
  // Reject digits / odd punctuation
  if (/[0-9/\\_]/.test(n)) return undefined

  const lower = n.toLocaleLowerCase('pl-PL')

  // -ów / -ow → -owie (Rzeszów)
  if (/ów$/i.test(n) || /ow$/i.test(n)) {
    return n.replace(/ów$/i, 'owie').replace(/ow$/i, 'owie')
  }
  // -sk → -sku (Gdańsk) — already in dict; keep as rule
  if (/sk$/i.test(n)) {
    return `${n}u`
  }
  // -ń → -niu (Poznań)
  if (/ń$/i.test(n)) {
    return n.replace(/ń$/i, 'niu')
  }
  // -ice → -icach (Katowice, Gliwice)
  if (/ice$/i.test(n)) {
    return n.replace(/ice$/i, 'icach')
  }
  // -y (plural-like) → -ach (Tychy)
  if (/y$/i.test(n) && !/owy$/i.test(n)) {
    return n.replace(/y$/i, 'ach')
  }
  // -awa → -awie (Warszawa)
  if (/awa$/i.test(n)) {
    return n.replace(/awa$/i, 'awie')
  }
  // -owa → -owej (Częstochowa-style already in dict; Zielona Góra parts)
  if (/owa$/i.test(n)) {
    return n.replace(/owa$/i, 'owej')
  }
  // Soft -e town names → -u (Zabrze) — NOT Zakopane (exception)
  if (/[bdfghlmnrstwzżźćńś]e$/i.test(lower) && !/ane$/i.test(lower)) {
    return `${n.slice(0, -1)}u`
  }
  // -in → -inie (Szczecin, Lublin already covered; Sopot uses -cie)
  if (/in$/i.test(n)) {
    return `${n}ie`
  }
  // -ot → -ocie (Sopot)
  if (/ot$/i.test(n)) {
    return n.replace(/ot$/i, 'ocie')
  }
  // -om → -omiu (Bytom)
  if (/om$/i.test(n)) {
    return `${n}iu`
  }

  void lower
  return undefined
}

function titlePreservePolish(form: string, sourceToken: string): string {
  // Prefer dictionary casing; for rule output, capitalize like the source token.
  if (!sourceToken) return form
  if (sourceToken[0] === sourceToken[0]!.toLocaleUpperCase('pl-PL')) {
    return (
      form.charAt(0).toLocaleUpperCase('pl-PL') + form.slice(1)
    )
  }
  return form
}

function inflectToken(token: string): string | undefined {
  const key = normalizeCityKey(token)
  const fromDict = lookupException(key)
  if (fromDict) return fromDict
  const ruled = conservativeSuffixRule(token.trim())
  if (!ruled) return undefined
  return titlePreservePolish(ruled, token.trim())
}

/**
 * Convert a nominative city name to Polish locative (after “w …”).
 * @returns locative form, or undefined when unsafe / missing
 */
export function toPolishLocativeCity(
  city: string | null | undefined,
): string | undefined {
  if (city == null) return undefined
  const trimmed = city.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!trimmed) return undefined

  const wholeKey = normalizeCityKey(trimmed)
  const whole = lookupException(wholeKey)
  if (whole) return whole

  // Hyphenated: inflect each side when both succeed
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const inflected = parts.map((p) => inflectToken(p))
      if (inflected.every(Boolean)) {
        return inflected.join('-')
      }
    }
    return undefined
  }

  // Multi-word without dictionary entry — do not guess
  if (/\s/.test(trimmed)) {
    return undefined
  }

  return inflectToken(trimmed)
}

/** Dev / test helper — lists known exception keys. */
export function knownLocativeCityCount(): number {
  return Object.keys(LOCATIVE_EXCEPTIONS).length
}
