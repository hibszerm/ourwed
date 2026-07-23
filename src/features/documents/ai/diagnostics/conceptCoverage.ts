/**
 * Business-concept coverage for extraction diagnostics.
 *
 * Coverage is ONLY allowed via:
 * 1. Exact registry variable resolution
 * 2. Explicit alias → registry key(s) in SEMANTIC_MAP
 * 3. Explicit expansion / any-of mappings in SEMANTIC_MAP
 *
 * Never cover via category similarity or loose keyword overlap.
 * Unknown concepts → Missing.
 */

import {
  resolveToRegistryKey,
  registryPolishLabel,
} from '@/features/documents/ai/canonicalVariableIds'
import { matchLabelToRegistryKey } from '@/features/documents/ai/matchVariableLabel'
import { getPackageVariableDef } from '@/features/documents/registry/packageVariables'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { ConceptCoverageStatus } from './types'

export type { ConceptCoverageStatus } from './types'

export interface ProductionAtom {
  /** Registry key (or package registry key). */
  id: string
  label: string
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

export function normalizeConceptName(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelForKey(key: string): string {
  const system = SystemVariableRegistry.get(key)
  if (system) return system.label
  const pkg = getPackageVariableDef(key)
  if (pkg) return pkg.labelPl
  try {
    return registryPolishLabel(key)
  } catch {
    return key.replace(/[_.]/g, ' ')
  }
}

/**
 * Resolve any production id / legacy dotted key / alias → canonical primary
 * registry id (snake_case). This is the ONLY key space used for coverage joins.
 */
export function canonicalCoverageId(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const system = SystemVariableRegistry.get(trimmed)
  if (system) return system.id

  const pkg = getPackageVariableDef(trimmed)
  if (pkg) {
    const primary = SystemVariableRegistry.get(pkg.id)
    return primary?.id ?? pkg.id
  }

  // Last resort: couple/company presence resolver may return legacy keys.
  const fromPresence = resolveToRegistryKey(trimmed)
  if (fromPresence) {
    const viaLegacy = SystemVariableRegistry.get(fromPresence)
    if (viaLegacy) return viaLegacy.id
  }

  return null
}

/** Resolve production id / registry key into an atom. Labels alone are ignored. */
export function toProductionAtom(raw: string): ProductionAtom | null {
  const id = canonicalCoverageId(raw)
  if (!id) return null

  return {
    id,
    label: labelForKey(id),
  }
}

export function buildProductionAtomSet(input: {
  registryKeys: string[]
  labels: string[]
  validatedIds: string[]
}): Map<string, ProductionAtom> {
  const map = new Map<string, ProductionAtom>()
  const push = (raw: string) => {
    const atom = toProductionAtom(raw)
    if (!atom) return
    if (!map.has(atom.id)) map.set(atom.id, atom)
  }
  for (const k of input.registryKeys) push(k)
  for (const id of input.validatedIds) push(id)
  // Labels are NOT used for matching — only registry-resolved atoms.
  void input.labels
  return map
}

/**
 * Explicit semantic mapping table.
 * `aliases` are normalized Pass-1 concept phrases (exact match after normalize).
 * `covers` are canonical primary registry IDs (snake_case) that regenerate the concept.
 * Legacy dotted keys are also accepted and normalized via canonicalCoverageId.
 *
 * mode:
 * - single: one key; 1 hit → covered / covered_mapped
 * - any: any one of covers → covered
 * - expanded: need minForFull of covers; 2+ → expanded; 1..<min → partial
 */
export type SemanticMapping = {
  id: string
  aliases: string[]
  covers: string[]
  mode: 'single' | 'any' | 'expanded'
  minForFull: number
}

/**
 * ONLY these phrases map to production variables.
 * Everything else stays Missing unless exact registry resolution succeeds.
 */
export const SEMANTIC_MAP: SemanticMapping[] = [
  // —— Bride / groom names ——
  {
    id: 'bride_full_name',
    aliases: [
      'bride full name',
      'bride name',
      'bride names',
      'brides name',
      'brides full name',
      'name of the bride',
      'bride imie i nazwisko',
      'imie i nazwisko panny mlodej',
      'panna mloda',
      'panny mlodej',
    ],
    covers: ['bride.firstName', 'bride.lastName'],
    mode: 'expanded',
    minForFull: 2,
  },
  {
    id: 'groom_full_name',
    aliases: [
      'groom full name',
      'groom name',
      'groom names',
      'grooms name',
      'grooms full name',
      'name of the groom',
      'groom imie i nazwisko',
      'imie i nazwisko pana mlodego',
      'pan mlody',
      'pana mlodego',
    ],
    covers: ['groom.firstName', 'groom.lastName'],
    mode: 'expanded',
    minForFull: 2,
  },
  {
    id: 'couple_names',
    aliases: [
      'couple names',
      'client names',
      'clients names',
      'names of the couple',
      'wedding couple names',
      'imiona pary',
      'imiona i nazwiska pary',
      'dane pary',
    ],
    covers: [
      'bride.firstName',
      'bride.lastName',
      'groom.firstName',
      'groom.lastName',
      'wedding.coupleNames',
    ],
    mode: 'expanded',
    minForFull: 2,
  },
  {
    id: 'bride_first_name',
    aliases: [
      'bride first name',
      'bride firstname',
      'imie panny mlodej',
      'bride given name',
    ],
    covers: ['bride.firstName'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'bride_last_name',
    aliases: [
      'bride last name',
      'bride lastname',
      'bride surname',
      'nazwisko panny mlodej',
    ],
    covers: ['bride.lastName'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_first_name',
    aliases: [
      'groom first name',
      'groom firstname',
      'imie pana mlodego',
      'groom given name',
    ],
    covers: ['groom.firstName'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_last_name',
    aliases: [
      'groom last name',
      'groom lastname',
      'groom surname',
      'nazwisko pana mlodego',
    ],
    covers: ['groom.lastName'],
    mode: 'single',
    minForFull: 1,
  },

  // —— Contact ——
  {
    id: 'client_phone',
    aliases: [
      'client phone',
      'clients phone',
      'client telephone',
      'contact phone',
      'couple phone',
      'phone number',
      'telephone',
      'telefon',
      'telefon kontaktowy',
    ],
    covers: ['bride.phone', 'groom.phone'],
    mode: 'any',
    minForFull: 1,
  },
  {
    id: 'client_email',
    aliases: [
      'client email',
      'clients email',
      'client e mail',
      'contact email',
      'couple email',
      'email address',
      'e mail',
      'email',
    ],
    covers: ['bride.email', 'groom.email'],
    mode: 'any',
    minForFull: 1,
  },
  {
    id: 'contact_details',
    aliases: [
      'contact details',
      'contact information',
      'contacts',
      'couple contact',
      'client contact',
      'client contacts',
      'dane kontaktowe',
      'kontakt',
    ],
    covers: ['bride.phone', 'bride.email', 'groom.phone', 'groom.email'],
    mode: 'expanded',
    minForFull: 2,
  },
  {
    id: 'bride_phone',
    aliases: [
      'bride phone',
      'bride telephone',
      'bride mobile',
      'telefon panny mlodej',
    ],
    covers: ['bride.phone'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'bride_email',
    aliases: [
      'bride email',
      'bride e mail',
      'email panny mlodej',
      'e mail panny mlodej',
    ],
    covers: ['bride.email'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_phone',
    aliases: [
      'groom phone',
      'groom telephone',
      'groom mobile',
      'telefon pana mlodego',
    ],
    covers: ['groom.phone'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_email',
    aliases: [
      'groom email',
      'groom e mail',
      'email pana mlodego',
      'e mail pana mlodego',
    ],
    covers: ['groom.email'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'bride_address',
    aliases: ['bride address', 'bride home address', 'adres panny mlodej'],
    covers: ['bride.address'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_address',
    aliases: ['groom address', 'groom home address', 'adres pana mlodego'],
    covers: ['groom.address'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'bride_pesel',
    aliases: ['bride pesel', 'pesel panny mlodej'],
    covers: ['bride.pesel'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'groom_pesel',
    aliases: ['groom pesel', 'pesel pana mlodego'],
    covers: ['groom.pesel'],
    mode: 'single',
    minForFull: 1,
  },

  // —— Wedding day / schedule ——
  {
    id: 'wedding_date',
    aliases: [
      'wedding date',
      'date of wedding',
      'date of the wedding',
      'event date',
      'data slubu',
      'data wesela',
    ],
    covers: ['wedding.date'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'ceremony_time',
    aliases: [
      'ceremony time',
      'time of ceremony',
      'wedding time',
      'start time',
      'report time',
      'godzina ceremonii',
      'godzina slubu',
    ],
    covers: ['wedding.ceremonyTime'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'timeline',
    aliases: [
      'timeline',
      'schedule',
      'wedding schedule',
      'wedding timeline',
      'day timeline',
      'harmonogram',
      'harmonogram dnia',
      'run of show',
    ],
    covers: ['wedding.schedule'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'notes',
    aliases: [
      'notes',
      'additional notes',
      'special requests',
      'special request',
      'uwagi',
      'dodatkowe uwagi',
      'dodatkowe informacje',
    ],
    covers: ['additional.notes'],
    mode: 'single',
    minForFull: 1,
  },

  // —— Event locations (NOT signing / invoice / mail locations) ——
  {
    id: 'filming_locations',
    aliases: [
      'filming locations',
      'filming location',
      'location of filming',
      'locations of filming',
      'shooting locations',
      'shooting location',
      'wedding locations',
      'wedding venues',
      'event locations',
      'event venues',
      'venues',
      'ceremony and reception locations',
      'prep ceremony reception',
      'miejsca filmowania',
      'miejsca zdjec',
      'miejsca slubu',
      'lokalizacje wesela',
    ],
    covers: [
      'location.preparation',
      'location.ceremony',
      'location.reception',
    ],
    mode: 'expanded',
    minForFull: 1,
  },
  {
    id: 'preparation_location',
    aliases: [
      'preparation location',
      'prep location',
      'getting ready location',
      'getting ready place',
      'miejsce przygotowan',
      'przygotowania',
    ],
    covers: ['location.preparation'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'ceremony_location',
    aliases: [
      'ceremony location',
      'ceremony venue',
      'church location',
      'civil office',
      'miejsce ceremonii',
      'miejsce slubu',
    ],
    covers: ['location.ceremony'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'reception_location',
    aliases: [
      'reception location',
      'reception venue',
      'wedding venue',
      'banquet hall',
      'party venue',
      'miejsce wesela',
      'sala weselna',
    ],
    covers: ['location.reception'],
    mode: 'single',
    minForFull: 1,
  },

  // —— Package ——
  {
    id: 'package',
    aliases: [
      'package',
      'selected package',
      'package name',
      'package choice',
      'offer',
      'pakiet',
      'wybrany pakiet',
      'nazwa pakietu',
    ],
    covers: ['package.name'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'package_price',
    aliases: [
      'package price',
      'contract price',
      'total price',
      'remuneration',
      'fee',
      'cena pakietu',
      'wynagrodzenie',
    ],
    covers: ['package_price', 'package.price'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'deposit',
    aliases: [
      'deposit',
      'deposit amount',
      'down payment',
      'zadatek',
      'zaliczka',
    ],
    covers: ['deposit_amount', 'package.deposit'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'delivery_deadline',
    aliases: [
      'delivery deadline',
      'delivery time',
      'delivery date',
      'gallery delivery',
      'film delivery deadline',
      'delivery',
      'termin dostawy',
      'termin oddania',
      'czas dostawy',
    ],
    covers: ['delivery_time', 'package.deliveryTime'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'working_hours',
    aliases: [
      'working hours',
      'work hours',
      'coverage hours',
      'hours of work',
      'max working hours',
      'godziny pracy',
      'czas pracy',
    ],
    covers: ['working_hours', 'package.workingHours'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'overtime_rate',
    aliases: [
      'overtime rate',
      'overtime price',
      'overtime fee',
      'extra hour price',
      'additional hour price',
      'cena nadgodzin',
      'stawka nadgodzin',
    ],
    covers: ['overtime_price', 'package.overtimePrice'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'videographers_count',
    aliases: [
      'videographers count',
      'number of videographers',
      'filmmakers count',
      'camera operators',
      'liczba wideografow',
      'liczba operatorow',
    ],
    covers: ['videographers_count', 'package.videographersCount'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'photographers_count',
    aliases: [
      'photographers count',
      'number of photographers',
      'liczba fotografow',
    ],
    covers: ['photographers_count', 'package.photographersCount'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'film_duration',
    aliases: [
      'film duration',
      'video duration',
      'film length',
      'movie duration',
      'dlugosc filmu',
    ],
    covers: ['film_duration', 'package.filmDuration'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'drone_included',
    aliases: [
      'drone included',
      'drone',
      'drone footage',
      'dron',
      'dron w pakiecie',
    ],
    covers: ['drone_included', 'package.droneIncluded'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'travel_fee',
    aliases: [
      'travel fee',
      'travel cost',
      'mileage',
      'dojazd',
      'koszt dojazdu',
    ],
    covers: ['travel_fee', 'package.travelFee'],
    mode: 'single',
    minForFull: 1,
  },

  // —— Company identity (explicit only — never Food / Delivery / Post-production) ——
  {
    id: 'company_identity',
    aliases: [
      'company identity',
      'company details',
      'company information',
      'studio identity',
      'studio details',
      'studio information',
      'service provider details',
      'service provider identity',
      'dane firmy',
      'dane studia',
      'dane uslugodawcy',
    ],
    covers: [
      'studio.name',
      'studio.owner',
      'studio.address',
      'studio.nip',
      'studio.vat',
      'studio.regon',
      'studio.phone',
      'studio.email',
      'studio.bankAccount',
    ],
    mode: 'expanded',
    minForFull: 2,
  },
  {
    id: 'company_name',
    aliases: [
      'company name',
      'studio name',
      'business name',
      'nazwa firmy',
      'nazwa studia',
    ],
    covers: ['studio.name'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'company_owner',
    aliases: [
      'company owner',
      'owner',
      'representative',
      'company representative',
      'wlasciciel',
      'reprezentant',
    ],
    covers: ['studio.owner', 'studio.photographerName'],
    mode: 'any',
    minForFull: 1,
  },
  {
    id: 'company_address',
    aliases: [
      'company address',
      'studio address',
      'business address',
      'adres firmy',
      'adres studia',
    ],
    covers: ['studio.address'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'company_vat',
    aliases: [
      'company vat',
      'vat id',
      'vat number',
      'tax id',
      'nip',
      'company nip',
      'company tax id',
    ],
    covers: ['studio.nip', 'studio.vat'],
    mode: 'any',
    minForFull: 1,
  },
  {
    id: 'company_regon',
    aliases: ['company regon', 'regon'],
    covers: ['studio.regon'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'company_phone',
    aliases: [
      'company phone',
      'studio phone',
      'business phone',
      'telefon firmy',
      'telefon studia',
    ],
    covers: ['studio.phone'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'company_email',
    aliases: [
      'company email',
      'studio email',
      'business email',
      'email firmy',
      'email studia',
    ],
    covers: ['studio.email'],
    mode: 'single',
    minForFull: 1,
  },
  {
    id: 'company_bank',
    aliases: [
      'company bank account',
      'bank account',
      'iban',
      'company iban',
      'konto bankowe',
      'numer konta',
    ],
    covers: ['studio.bankAccount', 'studio.iban'],
    mode: 'any',
    minForFull: 1,
  },
]

/** Build alias → mapping index (exact normalized phrase). */
const ALIAS_INDEX = new Map<string, SemanticMapping>()
for (const mapping of SEMANTIC_MAP) {
  for (const alias of mapping.aliases) {
    ALIAS_INDEX.set(normalizeConceptName(alias), mapping)
  }
}

function hitsForMapping(
  mapping: SemanticMapping,
  atoms: Map<string, ProductionAtom>,
): ProductionAtom[] {
  const out: ProductionAtom[] = []
  const seen = new Set<string>()
  for (const key of mapping.covers) {
    const canonical = canonicalCoverageId(key) ?? key
    const atom = atoms.get(canonical)
    if (atom && !seen.has(atom.id)) {
      seen.add(atom.id)
      out.push(atom)
    }
  }
  return out
}

function statusFromHits(
  mapping: SemanticMapping,
  hits: ProductionAtom[],
  conceptNormalized: string,
): ConceptCoverageResult {
  const coveredBy = hits.map((h) => h.label)
  const n = hits.length

  if (n === 0) {
    return {
      status: 'missing',
      coveredBy: [],
      mappingId: mapping.id,
      detail: 'Mapped concept, but no covering production variables present.',
    }
  }

  if (mapping.mode === 'single' || mapping.mode === 'any') {
    const labelNorm = normalizeConceptName(hits[0]!.label)
    const mapped = labelNorm !== conceptNormalized
    return {
      status: mapped ? 'covered_mapped' : 'covered',
      coveredBy,
      mappingId: mapping.id,
      detail: `Covered by: ${coveredBy.join(', ')}`,
    }
  }

  // expanded
  if (n >= mapping.minForFull && n >= 2) {
    return {
      status: 'covered_expanded',
      coveredBy,
      mappingId: mapping.id,
      detail: `Expanded into: ${coveredBy.join(', ')}`,
    }
  }
  if (n >= mapping.minForFull) {
    return {
      status: 'covered_mapped',
      coveredBy,
      mappingId: mapping.id,
      detail: `Covered by: ${coveredBy.join(', ')}`,
    }
  }
  return {
    status: 'partial',
    coveredBy,
    mappingId: mapping.id,
    detail: `Only partial coverage: ${coveredBy.join(', ')}`,
  }
}

/**
 * Exact registry resolution only — no fuzzy includes.
 * Uses matchLabelToRegistryKey which has curated aliases; we still require
 * the resolved key to exist in the production atom set.
 */
function exactRegistryResolution(
  conceptName: string,
  atoms: Map<string, ProductionAtom>,
): ConceptCoverageResult | null {
  const normalized = normalizeConceptName(conceptName)

  // Direct canonical / snake_case / legacy / package id
  const fromCanonical = canonicalCoverageId(conceptName)
  if (fromCanonical && atoms.has(fromCanonical)) {
    const atom = atoms.get(fromCanonical)!
    return {
      status:
        normalizeConceptName(atom.label) === normalized
          ? 'covered'
          : 'covered_mapped',
      coveredBy: [atom.label],
      detail: `Exact registry variable: ${fromCanonical}`,
    }
  }

  // Concept phrase that normalizes to a known primary id (e.g. "wedding date" → try snake)
  const asSnake = normalized.replace(/\s+/g, '_')
  const fromSnake = canonicalCoverageId(asSnake)
  if (fromSnake && atoms.has(fromSnake)) {
    const atom = atoms.get(fromSnake)!
    return {
      status: 'covered_mapped',
      coveredBy: [atom.label],
      detail: `Exact registry variable: ${fromSnake}`,
    }
  }

  // Curated label aliases from matchVariableLabel (exact alias map first)
  const fromLabel = matchLabelToRegistryKey(conceptName)
  if (fromLabel) {
    const canonical = canonicalCoverageId(fromLabel) ?? fromLabel
    if (atoms.has(canonical) && isStrictLabelMatch(conceptName, canonical)) {
      const atom = atoms.get(canonical)!
      return {
        status: 'covered_mapped',
        coveredBy: [atom.label],
        detail: `Registry alias → ${canonical}`,
      }
    }
  }

  return null
}

/** Accept matchLabelToRegistryKey only for strong/exact phrase matches. */
function isStrictLabelMatch(conceptName: string, registryKey: string): boolean {
  const n = normalizeConceptName(conceptName)
  const polish = normalizeConceptName(labelForKey(registryKey))
  if (n === polish) return true

  const canonical = canonicalCoverageId(registryKey) ?? registryKey

  // Re-check: concept must be an exact alias for this key in SEMANTIC_MAP covers
  for (const mapping of SEMANTIC_MAP) {
    const coversCanonical = mapping.covers.map(
      (k) => canonicalCoverageId(k) ?? k,
    )
    if (!coversCanonical.includes(canonical)) continue
    if (mapping.aliases.some((a) => normalizeConceptName(a) === n)) return true
  }

  // Allow short exact English forms that resolve uniquely via matchLabel
  // only when concept has no extra words beyond the field (e.g. "wedding date")
  const keyWords = normalizeConceptName(canonical.replace(/[_.]/g, ' '))
  if (n === keyWords) return true

  return false
}

export interface ConceptCoverageResult {
  status: ConceptCoverageStatus
  coveredBy: string[]
  mappingId?: string
  detail?: string
}

export function evaluateConceptCoverage(
  conceptName: string,
  atoms: Map<string, ProductionAtom>,
  _source?: string,
): ConceptCoverageResult {
  const normalized = normalizeConceptName(conceptName)
  if (!normalized) {
    return {
      status: 'missing',
      coveredBy: [],
      detail: 'Empty concept name.',
    }
  }

  // 1) Explicit semantic map (exact alias)
  const mapping = ALIAS_INDEX.get(normalized)
  if (mapping) {
    return statusFromHits(mapping, hitsForMapping(mapping, atoms), normalized)
  }

  // 2) Exact registry variable / strict alias
  const exact = exactRegistryResolution(conceptName, atoms)
  if (exact) return exact

  // 3) Unknown → Missing (never category / keyword force-cover)
  return {
    status: 'missing',
    coveredBy: [],
    detail: 'No semantic mapping for this business concept.',
  }
}

export function coverageStatusDisplayLabel(
  status: ConceptCoverageStatus,
): string {
  switch (status) {
    case 'covered':
      return '✓ Covered'
    case 'covered_expanded':
      return '✓ Covered (expanded)'
    case 'covered_mapped':
      return '✓ Covered (mapped)'
    case 'partial':
      return '⚠ Partial'
    case 'missing':
      return '✗ Missing'
  }
}

export function isFullyCoveredStatus(status: ConceptCoverageStatus): boolean {
  return (
    status === 'covered' ||
    status === 'covered_expanded' ||
    status === 'covered_mapped'
  )
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
    else if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>
      if (typeof row.id === 'string' && row.id.trim()) out.push(row.id.trim())
      else if (typeof row.key === 'string' && row.key.trim()) {
        out.push(row.key.trim())
      }
    }
  }
  return out
}

export function extractRawIds(rawParsed: unknown): {
  coupleVariables: string[]
  studioVariables: string[]
  packageVariables: string[]
  possibleVariables: string[]
} {
  if (!rawParsed || typeof rawParsed !== 'object') {
    return {
      coupleVariables: [],
      studioVariables: [],
      packageVariables: [],
      possibleVariables: [],
    }
  }
  const obj = rawParsed as Record<string, unknown>
  return {
    coupleVariables: asIdList(obj.coupleVariables ?? obj.variables),
    studioVariables: asIdList(obj.studioVariables),
    packageVariables: asIdList(
      obj.packageVariables ?? obj.templateDefaults ?? obj.defaults,
    ),
    possibleVariables: asIdList(obj.possibleVariables),
  }
}

export function productionDisplayNamesFromIds(ids: {
  coupleVariables: string[]
  studioVariables: string[]
  packageVariables: string[]
  possibleVariables: string[]
}): string[] {
  const all = [
    ...ids.coupleVariables,
    ...ids.studioVariables,
    ...ids.packageVariables,
    ...ids.possibleVariables,
  ]
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of all) {
    const atom = toProductionAtom(id)
    const label = atom?.label ?? id.replace(/_/g, ' ')
    const key = normalizeConceptName(label)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}
