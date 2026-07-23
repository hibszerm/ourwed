/**
 * Single resolve context for contract generation / completeness.
 * VariableResolver is the source of truth — UI never re-asks for known values.
 */

import { getLatestSubmittedFormAnswers } from '@/lib/api/forms'
import { extractAnswerFields } from '@/lib/forms/mergeFormAnswersIntoWedding'
import { VariableResolver } from '@/lib/variables'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { PackageSnapshot } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import { lookupResolvedValue } from './lookupResolvedValue'

export { lookupResolvedValue } from './lookupResolvedValue'

export type VariableDataSource =
  | 'wedding'
  | 'questionnaire'
  | 'package'
  | 'company'
  | 'system'
  | 'manual'
  | 'missing'

const SOURCE_LABEL: Record<VariableDataSource, string> = {
  wedding: 'Ślub',
  questionnaire: 'Ankieta',
  package: 'Pakiet',
  company: 'Firma',
  system: 'System',
  manual: 'Ręcznie',
  missing: 'Brak',
}

export function sourceLabel(source: VariableDataSource): string {
  return SOURCE_LABEL[source]
}

function emitWedding(
  out: Record<string, string>,
  id: string,
  value: string | null | undefined,
) {
  SystemVariableRegistry.emit(out, id, value)
  // Also keep raw id if unknown to registry
  const v = value?.trim()
  if (v && !SystemVariableRegistry.get(id)) out[id] = v
}

const DEFAULT_COUPLE_SEPARATOR = ' i '

/**
 * Map every Wedding field OurWed already stores into registry keys.
 *
 * Couple storage is neutral (partner1 / partner2). There is no per-wedding
 * role field today — the CRM UI labels partner1 as “Panna młoda” and
 * partner2 as “Pan młody”. Contract code prefers partner*_full_name and
 * couple_full_names; bride_* / groom_* remain aliases of those slots.
 */
export function weddingValuesFromWedding(
  wedding: Wedding,
): Record<string, string> {
  const out: Record<string, string> = {}
  const c = wedding.couple

  const partner1First =
    c.partner1FirstName?.trim() || c.partner1.split(/\s+/)[0] || ''
  const partner1Last =
    c.partner1LastName?.trim() ||
    c.partner1.split(/\s+/).slice(1).join(' ') ||
    ''
  const partner2First =
    c.partner2FirstName?.trim() || c.partner2.split(/\s+/)[0] || ''
  const partner2Last =
    c.partner2LastName?.trim() ||
    c.partner2.split(/\s+/).slice(1).join(' ') ||
    ''

  const partner1Full =
    [partner1First, partner1Last].filter(Boolean).join(' ') ||
    c.partner1.trim()
  const partner2Full =
    [partner2First, partner2Last].filter(Boolean).join(' ') ||
    c.partner2.trim()

  // Neutral contract variables (preferred)
  emitWedding(out, 'partner1_full_name', partner1Full)
  emitWedding(out, 'partner2_full_name', partner2Full)
  if (partner1Full && partner2Full) {
    emitWedding(
      out,
      'couple_full_names',
      `${partner1Full}${DEFAULT_COUPLE_SEPARATOR}${partner2Full}`,
    )
  }

  // Legacy role aliases — same physical slots as UI labels (not gender inference)
  emitWedding(out, 'bride_first_name', partner1First)
  emitWedding(out, 'bride_last_name', partner1Last)
  emitWedding(out, 'groom_first_name', partner2First)
  emitWedding(out, 'groom_last_name', partner2Last)
  emitWedding(out, 'bride_phone', c.partner1Phone || c.phone)
  emitWedding(out, 'bride_email', c.partner1Email || c.email)
  emitWedding(out, 'groom_phone', c.partner2Phone)
  emitWedding(out, 'groom_email', c.partner2Email)
  emitWedding(out, 'bride_address', c.partner1Address)
  emitWedding(out, 'groom_address', c.partner2Address)
  emitWedding(out, 'bride_full_name', partner1Full)
  emitWedding(out, 'groom_full_name', partner2Full)

  if (c.partner1.trim()) out['couple.partner1'] = c.partner1.trim()
  if (c.partner2.trim()) out['couple.partner2'] = c.partner2.trim()

  emitWedding(out, 'wedding_date', wedding.date)
  emitWedding(out, 'ceremony_time', wedding.ceremonyTime)
  emitWedding(
    out,
    'ceremony_location',
    wedding.ceremonyLocation || c.venue,
  )
  emitWedding(out, 'reception_location', wedding.receptionLocation)
  emitWedding(out, 'preparation_location', wedding.preparationLocation)

  if (c.city?.trim()) out['wedding_city'] = c.city.trim()
  if (c.venue?.trim()) out['venue'] = c.venue.trim()

  // Money commonly referenced as wedding/package vars
  if (Number.isFinite(wedding.price) && wedding.price > 0) {
    emitWedding(out, 'package_price', String(wedding.price))
    out['contract_price'] = String(wedding.price)
    out['price'] = String(wedding.price)
  }
  if (
    wedding.depositAmount != null &&
    Number.isFinite(wedding.depositAmount) &&
    wedding.depositAmount > 0
  ) {
    emitWedding(out, 'deposit_amount', String(wedding.depositAmount))
    out['deposit'] = String(wedding.depositAmount)
  }
  const remaining = Math.max(
    0,
    (wedding.price ?? 0) - (wedding.depositAmount ?? 0),
  )
  if (remaining > 0) {
    emitWedding(out, 'remaining_payment', String(remaining))
  }

  if (wedding.packageName?.trim()) {
    emitWedding(out, 'package_name', wedding.packageName.trim())
  }

  // Planner from contacts (when present on the wedding view model)
  const contacts = (
    wedding as Wedding & {
      contacts?: Array<{ name?: string; role?: string; phone?: string; email?: string }>
    }
  ).contacts
  const planner = contacts?.find((ct) =>
    /planner|koordynator|wedding.?plan/i.test(
      `${ct.role ?? ''} ${ct.name ?? ''}`,
    ),
  )
  if (planner) {
    emitWedding(out, 'wedding_planner_name', planner.name)
    emitWedding(out, 'wedding_planner_phone', planner.phone)
    emitWedding(out, 'wedding_planner_email', planner.email)
  }

  return out
}

export function packageSnapshotFromWedding(
  wedding: Wedding,
): PackageSnapshot & Record<string, unknown> {
  const deposit = wedding.depositAmount ?? 0
  const price = wedding.price ?? 0
  return {
    packageId: wedding.packageId ?? null,
    name: wedding.packageName ?? '',
    currency: wedding.currency || 'PLN',
    items: [],
    price,
    totalPrice: price,
    deposit,
    depositAmount: deposit,
    remaining: Math.max(0, price - deposit),
    remainingPayment: Math.max(0, price - deposit),
  }
}

const FIELD_KEY_TO_REGISTRY: Record<string, string> = {
  'partner1.firstName': 'bride_first_name',
  'partner1.lastName': 'bride_last_name',
  'partner1.phone': 'bride_phone',
  'partner1.email': 'bride_email',
  'partner1.address': 'bride_address',
  'partner1.pesel': 'bride_pesel',
  'partner1.postalCode': 'bride_postal_code',
  'partner1.city': 'bride_city',
  'partner2.firstName': 'groom_first_name',
  'partner2.lastName': 'groom_last_name',
  'partner2.phone': 'groom_phone',
  'partner2.email': 'groom_email',
  'partner2.address': 'groom_address',
  'partner2.pesel': 'groom_pesel',
  'partner2.postalCode': 'groom_postal_code',
  'partner2.city': 'groom_city',
  weddingDate: 'wedding_date',
  ceremonyTime: 'ceremony_time',
  ceremonyLocation: 'ceremony_location',
  receptionLocation: 'reception_location',
  preparationLocation: 'preparation_location',
  packageId: 'package_name',
}

function flattenQuestionnaireAnswers(
  fields: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [fieldKey, raw] of Object.entries(fields)) {
    if (raw == null) continue
    const value =
      typeof raw === 'string'
        ? raw.trim()
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : ''
    if (!value) continue

    out[fieldKey] = value
    const registryId = FIELD_KEY_TO_REGISTRY[fieldKey]
    if (registryId) {
      SystemVariableRegistry.emit(out, registryId, value)
      out[registryId] = value
    }
  }
  return out
}

export async function loadQuestionnaireAnswersForWedding(
  weddingId: string,
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {}
  for (const category of ['contract', 'pre_wedding'] as const) {
    try {
      const json = await getLatestSubmittedFormAnswers(weddingId, category)
      if (!json) continue
      Object.assign(merged, flattenQuestionnaireAnswers(extractAnswerFields(json)))
    } catch {
      /* ignore missing forms */
    }
  }
  return merged
}

export interface ResolvedVariableMeta {
  registryKey: string
  value: string
  source: VariableDataSource
  missing: boolean
}

/**
 * Resolve all values + attribute a human source for UI.
 */
export async function resolveContractVariables(input: {
  wedding: Wedding
  overrides?: Record<string, string>
  questionnaireAnswers?: Record<string, string>
}): Promise<{
  resolved: Record<string, string>
  packageSnapshot: PackageSnapshot
  questionnaireAnswers: Record<string, string>
  weddingValues: Record<string, string>
  lookup: (registryKey: string) => ResolvedVariableMeta
}> {
  const weddingValues = weddingValuesFromWedding(input.wedding)
  const packageSnapshot = packageSnapshotFromWedding(input.wedding)
  const questionnaireAnswers =
    input.questionnaireAnswers ??
    (await loadQuestionnaireAnswersForWedding(input.wedding.id))

  const resolved = await VariableResolver.resolve({
    weddingId: input.wedding.id,
    weddingValues,
    questionnaireAnswers,
    packageSnapshot,
    packageId: packageSnapshot.packageId ?? undefined,
  })

  if (input.overrides) {
    for (const [key, value] of Object.entries(input.overrides)) {
      if (value.trim()) resolved[key] = value.trim()
    }
  }

  // Ensure composites exist even when providers only supplied parts
  const p1 =
    lookupResolvedValue(resolved, 'partner1_full_name') ||
    lookupResolvedValue(resolved, 'bride_full_name')
  const p2 =
    lookupResolvedValue(resolved, 'partner2_full_name') ||
    lookupResolvedValue(resolved, 'groom_full_name')
  if (p1 && !lookupResolvedValue(resolved, 'partner1_full_name')) {
    SystemVariableRegistry.emit(resolved, 'partner1_full_name', p1)
  }
  if (p2 && !lookupResolvedValue(resolved, 'partner2_full_name')) {
    SystemVariableRegistry.emit(resolved, 'partner2_full_name', p2)
  }
  if (p1 && p2 && !lookupResolvedValue(resolved, 'couple_full_names')) {
    SystemVariableRegistry.emit(
      resolved,
      'couple_full_names',
      `${p1}${DEFAULT_COUPLE_SEPARATOR}${p2}`,
    )
  }

  // Source layers (earlier = lower priority for attribution of final value)
  const layers: Array<{ source: VariableDataSource; bag: Record<string, string> }> =
    [
      { source: 'questionnaire', bag: questionnaireAnswers },
      { source: 'wedding', bag: weddingValues },
      { source: 'package', bag: {} },
      { source: 'company', bag: {} },
    ]

  // Re-resolve per provider for attribution
  const packageBag = await VariableResolver.resolve({
    weddingId: input.wedding.id,
    packageSnapshot,
    packageId: packageSnapshot.packageId ?? undefined,
    sources: ['package'],
  })
  const companyBag = await VariableResolver.resolve({
    sources: ['company'],
  })
  layers[2]!.bag = packageBag
  layers[3]!.bag = companyBag

  const lookup = (registryKey: string): ResolvedVariableMeta => {
    const override = input.overrides?.[registryKey]?.trim()
    if (override) {
      return {
        registryKey,
        value: override,
        source: 'manual',
        missing: false,
      }
    }

    const value = lookupResolvedValue(resolved, registryKey)
    if (!value) {
      return {
        registryKey,
        value: '',
        source: 'missing',
        missing: true,
      }
    }

    // Highest-priority layer that actually holds this value
    // Match VariableResolver merge: later wins → attribute to last matching layer
    let source: VariableDataSource = 'system'
    for (const layer of layers) {
      if (lookupResolvedValue(layer.bag, registryKey)) {
        source = layer.source
      }
    }
    // Couple fields stored on wedding still display as Ślub (product language)
    return { registryKey, value, source, missing: false }
  }

  return {
    resolved,
    packageSnapshot,
    questionnaireAnswers,
    weddingValues,
    lookup,
  }
}
