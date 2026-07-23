/**
 * Map free-text AI variable labels → Variable Registry keys.
 * Deterministic OurWed logic — never invents keys outside the registry.
 */

import {
  DOCUMENT_VARIABLES,
  DOCUMENT_VARIABLE_SECTIONS,
  getVariableDef,
  isKnownVariableKey,
} from '@/features/documents/registry/variableRegistry'
import type { DocumentVariableSection } from '@/types/documents'
import { normalizeQuestionLabel } from '@/lib/forms/contractQuestionCatalog'

/** Explicit English / Polish aliases → registry key. */
const LABEL_ALIASES: Record<string, string> = {
  // Bride
  'bride first name': 'bride.firstName',
  'bride firstname': 'bride.firstName',
  'bride name': 'bride.firstName',
  'bride imie': 'bride.firstName',
  'imie panny mlodej': 'bride.firstName',
  'panna mloda imie': 'bride.firstName',
  'bride surname': 'bride.lastName',
  'bride last name': 'bride.lastName',
  'bride lastname': 'bride.lastName',
  'bride nazwisko': 'bride.lastName',
  'nazwisko panny mlodej': 'bride.lastName',
  'bride phone': 'bride.phone',
  'bride telephone': 'bride.phone',
  'bride telefon': 'bride.phone',
  'telefon panny mlodej': 'bride.phone',
  'bride email': 'bride.email',
  'bride e-mail': 'bride.email',
  'email panny mlodej': 'bride.email',
  'bride address': 'bride.address',
  'bride adres': 'bride.address',
  'adres panny mlodej': 'bride.address',

  // Groom
  'groom first name': 'groom.firstName',
  'groom firstname': 'groom.firstName',
  'groom name': 'groom.firstName',
  'groom imie': 'groom.firstName',
  'imie pana mlodego': 'groom.firstName',
  'pan mlody imie': 'groom.firstName',
  'groom surname': 'groom.lastName',
  'groom last name': 'groom.lastName',
  'groom lastname': 'groom.lastName',
  'groom nazwisko': 'groom.lastName',
  'nazwisko pana mlodego': 'groom.lastName',
  'groom phone': 'groom.phone',
  'groom telephone': 'groom.phone',
  'groom telefon': 'groom.phone',
  'telefon pana mlodego': 'groom.phone',
  'groom email': 'groom.email',
  'groom e-mail': 'groom.email',
  'email pana mlodego': 'groom.email',
  'groom address': 'groom.address',
  'groom adres': 'groom.address',
  'adres pana mlodego': 'groom.address',

  // Wedding
  'wedding date': 'wedding.date',
  'date of wedding': 'wedding.date',
  'data slubu': 'wedding.date',
  'data wesela': 'wedding.date',
  'ceremony time': 'wedding.ceremonyTime',
  'godzina ceremonii': 'wedding.ceremonyTime',
  'wedding time': 'wedding.ceremonyTime',
  'couple names': 'wedding.coupleNames',
  'imiona pary': 'wedding.coupleNames',

  // Package / money
  package: 'package.name',
  'package name': 'package.name',
  'selected package': 'package.name',
  pakiet: 'package.name',
  'nazwa pakietu': 'package.name',
  price: 'package.price',
  'contract price': 'package.price',
  'total price': 'package.price',
  'contract value': 'package.price',
  cena: 'package.price',
  'wartosc umowy': 'package.price',
  deposit: 'package.deposit',
  zadatek: 'package.deposit',
  zaliczka: 'package.deposit',
  'remaining payment': 'package.remaining',
  'remaining balance': 'package.remaining',
  remaining: 'package.remaining',
  'pozostala kwota': 'package.remaining',
  'deposit paid': 'payments.depositPaid',
  'total paid': 'payments.totalPaid',

  // Locations
  'ceremony location': 'location.ceremony',
  'ceremony venue': 'location.ceremony',
  'wedding ceremony location': 'location.ceremony',
  ceremonii: 'location.ceremony',
  ceremonia: 'location.ceremony',
  'miejsce ceremonii': 'location.ceremony',
  'reception location': 'location.reception',
  'reception venue': 'location.reception',
  przyjecie: 'location.reception',
  'miejsce przyjecia': 'location.reception',
  'preparation location': 'location.preparation',
  'getting ready location': 'location.preparation',
  przygotowania: 'location.preparation',
  'miejsce przygotowan': 'location.preparation',

  // Studio
  'company name': 'studio.name',
  'studio name': 'studio.name',
  'business name': 'studio.name',
  'nazwa studia': 'studio.name',
  'nazwa firmy': 'studio.name',
  'company tax number': 'studio.nip',
  'tax number': 'studio.nip',
  'company nip': 'studio.nip',
  nip: 'studio.nip',

  // Additional
  'contract number': 'additional.contractNumber',
  'numer umowy': 'additional.contractNumber',
  city: 'additional.city',
  miasto: 'additional.city',

  // Promoted recurring business concepts
  'wedding planner name': 'wedding.plannerName',
  'wedding planner': 'wedding.plannerName',
  'planner name': 'wedding.plannerName',
  'wedding planner phone': 'wedding.plannerPhone',
  'planner phone': 'wedding.plannerPhone',
  'wedding planner email': 'wedding.plannerEmail',
  'planner email': 'wedding.plannerEmail',
  'food for crew': 'wedding.foodForCrew',
  'crew food': 'wedding.foodForCrew',
  'meals for crew': 'wedding.foodForCrew',
  'wyzywienie ekipy': 'wedding.foodForCrew',
  'marketing consent': 'couple.marketingConsent',
  'photo marketing consent': 'couple.marketingConsent',
  'zgoda marketingowa': 'couple.marketingConsent',
  'drone included': 'package.droneIncluded',
  drone: 'package.droneIncluded',
  'film duration': 'package.filmDuration',
  'video duration': 'package.filmDuration',
  'film delivery method': 'package.filmDeliveryMethod',
  'film delivery format': 'package.filmDeliveryFormat',
  'post production duration': 'package.postproductionDuration',
  'postproduction duration': 'package.postproductionDuration',
  'editing duration': 'package.postproductionDuration',
}

function sectionLabel(sectionId: DocumentVariableSection): string {
  return (
    DOCUMENT_VARIABLE_SECTIONS.find((s) => s.id === sectionId)?.label ?? sectionId
  )
}

function buildRegistryAliasMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [alias, key] of Object.entries(LABEL_ALIASES)) {
    if (isKnownVariableKey(key)) {
      map.set(normalizeQuestionLabel(alias), key)
    }
  }
  for (const def of DOCUMENT_VARIABLES) {
    const pl = normalizeQuestionLabel(def.labelPl)
    const section = normalizeQuestionLabel(sectionLabel(def.section))
    map.set(pl, def.key)
    map.set(normalizeQuestionLabel(`${section} ${def.labelPl}`), def.key)
    map.set(normalizeQuestionLabel(`${section} — ${def.labelPl}`), def.key)
    map.set(normalizeQuestionLabel(def.key.replace(/\./g, ' ')), def.key)
  }
  return map
}

const ALIAS_MAP = buildRegistryAliasMap()

/**
 * Resolve an AI-emitted label to a Variable Registry key, or null if unknown.
 */
export function matchLabelToRegistryKey(label: string): string | null {
  const normalized = normalizeQuestionLabel(label)
  if (!normalized) return null

  const exact = ALIAS_MAP.get(normalized)
  if (exact) return exact

  // Prefer longer alias hits so "bride first name" wins over "name".
  let best: { key: string; len: number } | null = null
  for (const [alias, key] of ALIAS_MAP) {
    if (alias.length < 5) continue
    if (!normalized.includes(alias)) continue
    if (!best || alias.length > best.len) {
      best = { key, len: alias.length }
    }
  }
  return best?.key ?? null
}

/** Prefer Polish registry / section label for review UI when matched. */
export function displayLabelForMatch(
  aiLabel: string,
  registryKey: string | null,
): string {
  if (!registryKey) return aiLabel.trim() || 'Informacja'
  const def = getVariableDef(registryKey)
  if (!def) return aiLabel.trim() || 'Informacja'
  const section = sectionLabel(def.section)
  if (
    ['Imię', 'Nazwisko', 'Telefon', 'E-mail', 'Adres'].includes(def.labelPl)
  ) {
    return `${section} — ${def.labelPl}`
  }
  return def.labelPl
}
