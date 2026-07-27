/**
 * Deterministic ValueShape classification from exact physical span text.
 * Uses span text and limited local syntax — never wedding target values.
 */

import { isPlausibleAddressSource } from './addressComponents'
import { parsePolishMoneyAmount, parsePolishMoneyWords } from './polishMoneyParser'
import { validatePolishContractDateToken } from '../polishContractDateValidator'

export type ValueShape =
  | 'person_name'
  | 'address'
  | 'phone'
  | 'date'
  | 'money_numeric'
  | 'money_words'
  | 'location'
  | 'unknown'

export type ValueShapeResult = {
  shape: ValueShape
  confidence: 'high' | 'medium' | 'low'
  evidenceCodes: string[]
}

const PHONE =
  /^(\+48[\s-]?)?(\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{9})$/

const ADDRESS_MARKERS = /\b(ul\.?|al\.?|os\.?|pl\.?|zam\.|zamieszkał|zamieszkal|mieszka)\b/i
const PHONE_MARKERS = /\b(tel\.?|telefon|kom\.|nr\s+tel)\b/i
const DATE_MARKERS = /\b(dnia|dn\.|data)\b/i
const MONEY_MARKERS = /\b(zł|PLN|złotych|złote|złoty|słownie)\b/i
const CONTAMINATION = /NIP|REGON|wykonawc|usługodawc/i

const PERSON_TOKEN = /^[A-ZÀ-ŻĄĆĘŁŃÓŚŹŻ][a-zà-žąćęłńóśźż]+$/u
const PLACE_TOKEN =
  /^(pałac|palac|hotel|kościół|kosciol|dom|sala|restaurac|dwór|dwor|rezydenc|zamek|kościel|klub|centrum|park)/i

function classifyPhone(trimmed: string): ValueShapeResult | null {
  const digits = trimmed.replace(/[^\d+]/g, '')
  if (PHONE.test(trimmed.replace(/\u00a0/g, ' '))) {
    if (/^\d{2}-\d{3}$/.test(trimmed)) return null
    return { shape: 'phone', confidence: 'high', evidenceCodes: ['phone_format'] }
  }
  if (/^\+?48?\d{9}$/.test(digits) || /^\d{9}$/.test(digits)) {
    return { shape: 'phone', confidence: 'high', evidenceCodes: ['phone_digits'] }
  }
  return null
}

function classifyDate(trimmed: string): ValueShapeResult | null {
  if (/^r\.?$/i.test(trimmed)) return null
  const date = validatePolishContractDateToken(trimmed)
  if (date.valid) {
    return { shape: 'date', confidence: 'high', evidenceCodes: ['date_token'] }
  }
  return null
}

function classifyMoneyNumeric(trimmed: string): ValueShapeResult | null {
  if (parsePolishMoneyAmount(trimmed)) {
    return { shape: 'money_numeric', confidence: 'high', evidenceCodes: ['money_numeric'] }
  }
  return null
}

function classifyMoneyWords(trimmed: string): ValueShapeResult | null {
  if (parsePolishMoneyWords(trimmed) !== null) {
    return {
      shape: 'money_words',
      confidence: 'high',
      evidenceCodes: ['money_words'],
    }
  }
  return null
}

function classifyAddress(trimmed: string): ValueShapeResult | null {
  if (PHONE_MARKERS.test(trimmed) && classifyPhone(trimmed)) return null
  if (isPlausibleAddressSource(trimmed) && (ADDRESS_MARKERS.test(trimmed) || /\d{2}-\d{3}/.test(trimmed))) {
    return { shape: 'address', confidence: 'high', evidenceCodes: ['address_components'] }
  }
  if (/\b(ul\.?|al\.?|os\.?)\s+\S+/i.test(trimmed) && /\d/.test(trimmed)) {
    return { shape: 'address', confidence: 'medium', evidenceCodes: ['address_street_number'] }
  }
  return null
}

function classifyPersonName(trimmed: string): ValueShapeResult | null {
  if (
    ADDRESS_MARKERS.test(trimmed) ||
    PHONE_MARKERS.test(trimmed) ||
    DATE_MARKERS.test(trimmed) ||
    MONEY_MARKERS.test(trimmed) ||
    CONTAMINATION.test(trimmed) ||
    /^\d/.test(trimmed)
  ) {
    return null
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length < 1 || tokens.length > 7) return null
  if (tokens.some((t) => PLACE_TOKEN.test(t.replace(/[,.;]+$/, '')))) return null
  const nameLike = tokens.every(
    (t) =>
      t === 'i' ||
      PERSON_TOKEN.test(t) ||
      /^[A-ZÀ-ŻĄĆĘŁŃÓŚŹŻ][a-zà-žąćęłńóśźż]*[ąę]$/u.test(t),
  )
  if (!nameLike) return null
  const nameTokens = tokens.filter((t) => t !== 'i')
  if (nameTokens.length < 1) return null
  return {
    shape: 'person_name',
    confidence: nameTokens.length <= 3 ? 'high' : 'medium',
    evidenceCodes: ['person_tokens'],
  }
}

function classifyLocation(trimmed: string): ValueShapeResult | null {
  if (trimmed.length < 3) return null
  if (classifyPhone(trimmed) || classifyDate(trimmed) || classifyMoneyNumeric(trimmed)) {
    return null
  }
  if (ADDRESS_MARKERS.test(trimmed) && /\d{2}-\d{3}/.test(trimmed)) return null
  if (/^[A-ZÀ-ŻĄĆĘŁŃÓŚŹŻ]/.test(trimmed) && /[a-zà-žąćęłńóśźż]/.test(trimmed)) {
    return { shape: 'location', confidence: 'medium', evidenceCodes: ['location_phrase'] }
  }
  return null
}

export function classifyValueShape(
  exactValue: string,
  localContext?: string,
): ValueShapeResult {
  const trimmed = exactValue.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return { shape: 'unknown', confidence: 'low', evidenceCodes: ['empty'] }
  }

  const phone = classifyPhone(trimmed)
  if (phone) return phone
  const date = classifyDate(trimmed)
  if (date) return date
  const moneyNumeric = classifyMoneyNumeric(trimmed)
  if (moneyNumeric) return moneyNumeric
  const moneyWords = classifyMoneyWords(trimmed)
  if (moneyWords) return moneyWords
  const address = classifyAddress(trimmed)
  if (address) return address

  const person = classifyPersonName(trimmed)
  const location = classifyLocation(trimmed)
  if (person && location && localContext && /\b(?:w|we|na|do|przy)\s+/i.test(localContext)) {
    return location
  }

  return (
    person ??
    location ?? {
      shape: 'unknown',
      confidence: 'low',
      evidenceCodes: ['unclassified'],
    }
  )
}

export function extractLocalSentence(
  blockText: string,
  start: number,
  end: number,
): string {
  const before = blockText.slice(0, start)
  const after = blockText.slice(end)
  const sentenceStart = Math.max(
    before.lastIndexOf('.') + 1,
    before.lastIndexOf(';') + 1,
    before.lastIndexOf('\n') + 1,
    0,
  )
  let sentenceEnd = blockText.length
  for (const ch of ['.', ';', '\n']) {
    const idx = after.indexOf(ch)
    if (idx >= 0) {
      sentenceEnd = Math.min(sentenceEnd, end + idx + (ch === '\n' ? 0 : 1))
    }
  }
  return blockText.slice(sentenceStart, sentenceEnd).trim()
}

export function isRelativePaymentRule(text: string): boolean {
  return /w\s+terminie\s+\d+\s+dni/i.test(text) && !/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/.test(text)
}
