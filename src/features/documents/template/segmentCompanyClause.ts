/**
 * Segment company / provider party clauses into minimal physical entities.
 */

const PERSON_RE =
  /([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+)+)/gu

const LEGAL_FORM_SUFFIX =
  /(?:\s+(?:s\.c\.|sp\.\s*z\s*o\.o\.|spółka\s+cywilna|sp\.\s*j\.|sp\.\s*k\.))/iu

export interface CompanyClauseSegment {
  companyName: {
    text: string
    /** Offset relative to `afterFirm` start. */
    startRel: number
    endRel: number
  } | null
  legalForm: string | null
  representatives: Array<{ text: string; startRel: number; endRel: number }>
  cityLocative: { text: string; startAbsHint: string } | null
  address: { text: string; startAbsHint: string } | null
  /** Absolute paragraph cues for city/address search in full text. */
  seatCue: boolean
}

/**
 * Extract the minimal trade name from text immediately after „pod firmą ”.
 * Stops before partner names, seat, or address.
 * Does not treat Title-Case brand names (e.g. Video Productions) as persons.
 */
export function extractMinimalCompanyNameAfterFirm(
  afterFirm: string,
): { text: string; startRel: number; endRel: number } | null {
  const trimmedStart = afterFirm.replace(/^\s+/, '')
  const lead = afterFirm.length - trimmedStart.length
  if (!trimmedStart) return null

  // Prefer: BRAND + optional legal form (stops before following person names)
  const withForm =
    /^([A-Za-zĄĆĘŁŃÓŚŹŻ0-9][A-Za-zĄĆĘŁŃÓŚŹŻ0-9 .&'"-]{0,48}?(?:\s+s\.c\.|\s+sp\.\s*z\s*o\.o\.|\s+spółka\s+cywilna|\s+sp\.\s*j\.|\s+sp\.\s*k\.))/u.exec(
      trimmedStart,
    )
  if (withForm) {
    const text = withForm[1]!.trim()
    return {
      text,
      startRel: lead,
      endRel: lead + withForm[1]!.length,
    }
  }

  // Structural cuts — role anchors, seat, registry, address
  let cut = trimmedStart.length
  const structural = [
    /,\s*zwan/iu,
    /\s+zwan[aąye]/iu,
    /\s+z\s+siedzib/iu,
    /,\s*(?:z\s+siedzib|NIP|REGON|ul\.|stałe|tel\.|przy\s+ul)/iu,
    /\s+stałe\s+miejsce/iu,
    /,\s*NIP\b/iu,
    /\s+NIP\b/iu,
  ]
  for (const re of structural) {
    const m = re.exec(trimmedStart)
    if (m?.index != null) cut = Math.min(cut, m.index)
  }

  const window = trimmedStart.slice(0, cut)

  // Person names only after a non-empty brand prefix (never cut at index 0 —
  // Title-Case brands like "Video Productions" look like Firstname Lastname).
  const people = [...window.matchAll(new RegExp(PERSON_RE.source, 'gu'))]
  for (const m of people) {
    if (m.index == null || m.index === 0) continue
    const before = window.slice(0, m.index).trim()
    if (before.length >= 3) {
      cut = Math.min(cut, m.index)
      break
    }
  }

  let raw = trimmedStart.slice(0, cut).trim().replace(/[,\s]+$/u, '')
  if (!raw || raw.length < 2) return null
  if (raw.length > 80) return null

  const endRel = lead + trimmedStart.indexOf(raw) + raw.length
  return { text: raw, startRel: lead + trimmedStart.indexOf(raw), endRel }
}

/**
 * Full segmentation of a company party clause.
 */
export function segmentCompanyPartyClause(
  paragraphText: string,
  firmMatchIndex: number,
  firmMatchLength: number,
): CompanyClauseSegment {
  const afterFirm = paragraphText.slice(firmMatchIndex + firmMatchLength)
  const companyName = extractMinimalCompanyNameAfterFirm(afterFirm)

  let legalForm: string | null = null
  if (companyName) {
    const fm = LEGAL_FORM_SUFFIX.exec(companyName.text)
    if (fm) legalForm = fm[0]!.trim()
  }

  const representatives: CompanyClauseSegment['representatives'] = []
  // Partners listed after company name until z siedzibą
  if (companyName) {
    const afterName = afterFirm.slice(companyName.endRel)
    const untilSeat = afterName.split(/\bz\s+siedzib/iu)[0] ?? afterName
    const people = [...untilSeat.matchAll(new RegExp(PERSON_RE.source, 'gu'))]
    for (const m of people) {
      if (m.index == null) continue
      const text = m[1]!.trim()
      // Skip if this person is somehow still inside companyName
      if (companyName.text.includes(text)) continue
      representatives.push({
        text,
        startRel: companyName.endRel + m.index,
        endRel: companyName.endRel + m.index + text.length,
      })
    }
  }

  let cityLocative: CompanyClauseSegment['cityLocative'] = null
  const cityM =
    /z\s+siedzib[aą]\s+w\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ\-]*(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*)*)/u.exec(
      paragraphText,
    )
  if (cityM) {
    cityLocative = { text: cityM[1]!, startAbsHint: cityM[0]! }
  }

  let address: CompanyClauseSegment['address'] = null
  const addrM =
    /przy\s+(ul\.?\s*[^,;]{3,80}|ulicy\s+[^,;]{3,80})/iu.exec(paragraphText) ??
    /(?:stałe miejsce[^:]*:\s*)((?:ul\.|al\.)[^,]{5,80})/iu.exec(paragraphText)
  if (addrM) {
    const text = (addrM[1] ?? addrM[0]!).replace(/^przy\s+/i, '').trim()
    address = { text, startAbsHint: addrM[0]! }
  }

  return {
    companyName,
    legalForm,
    representatives,
    cityLocative,
    address,
    seatCue: /z\s+siedzib/i.test(paragraphText),
  }
}
