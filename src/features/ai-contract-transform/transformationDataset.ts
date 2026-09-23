/**
 * Resolve closed ContractTransformationDataset from wedding + package.
 * Omits missing optional fields — never fabricates "r.", "0 zł", "—".
 */

import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatPolishPostalAddress } from '@/lib/utils/formatPolishPostalAddress'
import {
  buildPreparationLocationEntries,
  formatPreparationLocationsDisplayText,
} from '@/lib/utils/preparationLocations'
import {
  isIncompleteLocationAddress,
  looksLikeStreetAddress,
  looksLikeVenueDisplayName,
} from './locationInsertionPolicy'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import type { StudioPackage, WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlaceRole } from '@/types/travel'
import { buildDatasetAdditionalServices } from './insertAdditionalServices'
import type { ContractTransformationDataset } from './types'
import { resolveFinalPaymentDueDate } from '@/lib/utils/finalPaymentTerms'
import { snapshotDeliveryDeadlineFromRule } from '@/lib/utils/weddingDeliveryDeadline'

function plDate(isoOrDisplay: string | null | undefined): string | undefined {
  if (!isoOrDisplay?.trim()) return undefined
  const raw = isoOrDisplay.trim()
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(raw)) {
    return /r\.?\s*$/i.test(raw) ? raw : `${raw.replace(/\s*$/, '')} r.`
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy} r.`
}

function moneyFormatted(n: number): string {
  return formatCurrency(n).replace(/\u00a0/g, ' ')
}

function partnerAddress(wedding: Wedding, which: 1 | 2): string | undefined {
  const c = wedding.couple
  const formatted =
    which === 1
      ? formatPolishPostalAddress({
          fullAddress: c.partner1Address,
          postalCode: c.partner1PostalCode,
          city: c.partner1City,
        })
      : formatPolishPostalAddress({
          fullAddress: c.partner2Address,
          postalCode: c.partner2PostalCode,
          city: c.partner2City,
        })
  return formatted || undefined
}

function partnerAddressTarget(wedding: Wedding, which: 1 | 2, text: string): { text: string; segments: string[] } | undefined {
  const couple = wedding.couple
  const addressLine = (which === 1 ? couple.partner1Address : couple.partner2Address)?.trim()
  const postalCode = (which === 1 ? couple.partner1PostalCode : couple.partner2PostalCode)?.trim()
  const city = (which === 1 ? couple.partner1City : couple.partner2City)?.trim()
  const locality = [postalCode, city].filter(Boolean).join(' ')
  const segments = [addressLine, locality].filter((part): part is string => Boolean(part))
  return segments.length ? { text, segments } : undefined
}

function locationTarget(label?: string | null, formattedAddress?: string | null): { text: string; segments: string[] } | undefined {
  const segments = [label?.trim(), formattedAddress?.trim()].filter((part): part is string => Boolean(part))
  if (!segments.length) return undefined
  return { text: segments.join(', '), segments }
}

function locationFromString(
  value: string | null | undefined,
): ContractTransformationDataset['locations']['ceremony'] | undefined {
  const raw = value?.trim() || undefined
  if (!raw) return undefined
  const normalized = formatPolishPostalAddress({ fullAddress: raw }) || raw
  if (isIncompleteLocationAddress(normalized)) {
    return { fullAddress: normalized }
  }
  if (looksLikeStreetAddress(normalized) && !looksLikeVenueDisplayName(normalized)) {
    return { fullAddress: normalized }
  }
  if (looksLikeVenueDisplayName(normalized) && !looksLikeStreetAddress(normalized)) {
    return { displayName: normalized }
  }
  // Ambiguous: keep both so prompts/classifier can choose
  return { displayName: normalized, fullAddress: normalized }
}

/** Flatten dataset into allowlisted replacement strings for classification. */
export function collectDatasetTargetStrings(
  dataset: ContractTransformationDataset,
): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = []
  const push = (field: string, value: string | undefined) => {
    const v = value?.trim()
    if (v) out.push({ field, value: v })
  }
  push('clients.displayNames', dataset.clients.displayNames)
  push('clients.address', dataset.clients.address)
  push('clients.phone', dataset.clients.phone)
  push('dates.contractExecutionDate', dataset.dates.contractExecutionDate)
  push('dates.weddingDate', dataset.dates.weddingDate)
  push('dates.depositDueDate', dataset.dates.depositDueDate)
  push('dates.finalPaymentDueDate', dataset.dates.finalPaymentDueDate)
  for (const key of ['preparation', 'ceremony', 'reception'] as const) {
    const loc = dataset.locations[key]
    if (!loc) continue
    push(`locations.${key}.displayName`, loc.displayName)
    push(`locations.${key}.fullAddress`, loc.fullAddress)
    push(`locations.${key}.city`, loc.city)
  }
  push(
    'locations.preparationDisplayText',
    dataset.locations.preparationDisplayText,
  )
  for (const entry of dataset.locations.preparationLocations ?? []) {
    push(`locations.preparation.${entry.person}`, entry.fullAddress)
  }
  push('finances.contractValueFormatted', dataset.finances.contractValueFormatted)
  push('finances.contractValueWords', dataset.finances.contractValueWords)
  push('finances.depositFormatted', dataset.finances.depositFormatted)
  push('finances.depositWords', dataset.finances.depositWords)
  push('finances.remainingFormatted', dataset.finances.remainingFormatted)
  push('finances.remainingWords', dataset.finances.remainingWords)
  push('package.name', dataset.package.name)
  for (const svc of dataset.additionalServices ?? []) {
    push('additionalServices.name', svc.name)
  }
  push(
    'additionalServices.displayText',
    dataset.additionalServicesDisplayText,
  )
  return out
}

export function buildContractTransformationDataset(input: {
  wedding: Wedding
  package: Pick<StudioPackage, 'id' | 'name'>
  currentDate?: string
  /** Wedding extra services from wedding_extra_services (joined catalog names). */
  extras?: WeddingExtraService[]
  /** Authoritative WeddingPlace records, retained as target components. */
  weddingPlaces?: readonly { role: WeddingPlaceRole; label?: string | null; formattedAddress?: string | null }[]
}): ContractTransformationDataset {
  const { wedding, package: pkg } = input
  const commercial = getWeddingCommercialSummary(wedding)
  const contractValue = Math.round(commercial.contractValue ?? 0)
  const depositAmount = Math.round(commercial.agreedDeposit ?? 0)
  const remainingAmount = Math.max(
    0,
    Math.round(
      commercial.remainingAfterDeposit ?? contractValue - depositAmount,
    ),
  )

  const c = wedding.couple
  const names: string[] = []
  if (c.partner1?.trim()) names.push(c.partner1.trim())
  if (c.partner2?.trim()) names.push(c.partner2.trim())
  const personCount: 1 | 2 = names.length >= 2 ? 2 : 1
  const displayNames =
    personCount === 2 ? `${names[0]} i ${names[1]}` : names[0] ?? ''

  const address = partnerAddress(wedding, 1) ?? partnerAddress(wedding, 2)
  const phone =
    (c as { partner1Phone?: string }).partner1Phone?.trim() ||
    (c as { partner2Phone?: string }).partner2Phone?.trim() ||
    (c as { phone?: string }).phone?.trim() ||
    undefined
  const customers = names.map((displayName, index) => {
    const partnerIndex: 1 | 2 = index === 0 ? 1 : 2
    const address = partnerAddress(wedding, partnerIndex)
    const customerPhone = (partnerIndex === 1 ? c.partner1Phone : c.partner2Phone)?.trim()
    const customerEmail = (partnerIndex === 1
      ? c.partner1Email?.trim() || c.email?.trim()
      : c.partner2Email?.trim())
    const addressTarget = address ? partnerAddressTarget(wedding, partnerIndex, address) : undefined
    return {
      displayName,
      ...(address ? { address } : {}),
      ...(addressTarget ? { addressTarget } : {}),
      ...(customerPhone ? { phone: customerPhone } : {}),
      ...(customerEmail ? { email: customerEmail } : {}),
    }
  })

  const execution =
    plDate(input.currentDate) ??
    plDate(new Date().toISOString()) ??
    (() => {
      throw new Error('contractExecutionDate required')
    })()
  const weddingDate =
    plDate(wedding.date) ??
    (() => {
      throw new Error('weddingDate required')
    })()
  const deliveryDueDate = wedding.deliveryDueDate?.trim() || snapshotDeliveryDeadlineFromRule({
    weddingDate: wedding.date,
    deliveryMonths: wedding.deliveryMonths,
    deliveryDays: wedding.deliveryDays,
  }).deliveryDueDate
  const finalPaymentDueDate = wedding.finalPaymentDueDate?.trim() || resolveFinalPaymentDueDate({
    terms: wedding.finalPaymentTerms,
    weddingDate: wedding.date,
    deliveryDate: deliveryDueDate,
  })

  const finances: ContractTransformationDataset['finances'] = {
    contractValueFormatted: moneyFormatted(contractValue),
    contractValueWords: polishContractMoneyWords(contractValue),
  }
  if (depositAmount > 0) {
    finances.depositFormatted = moneyFormatted(depositAmount)
    finances.depositWords = polishContractMoneyWords(depositAmount)
  }
  if (remainingAmount > 0 && depositAmount > 0) {
    finances.remainingFormatted = moneyFormatted(remainingAmount)
    finances.remainingWords = polishContractMoneyWords(remainingAmount)
  }

  const prepEntries = buildPreparationLocationEntries(wedding)
  const prepDisplay = formatPreparationLocationsDisplayText(prepEntries)
  const locations: ContractTransformationDataset['locations'] = {}

  if (prepEntries.length > 0) {
    locations.preparationLocations = prepEntries.map((e) => ({
      person: e.person,
      label: e.label,
      fullAddress: e.address,
    }))
    if (prepDisplay) locations.preparationDisplayText = prepDisplay
    // Legacy singular field: prefer shared / bride / first for older prompts
    const primary =
      prepEntries.find((e) => e.person === 'shared') ??
      prepEntries.find((e) => e.person === 'bride') ??
      prepEntries[0]!
    const prep = locationFromString(primary.address)
    if (prep) locations.preparation = prep
  }

  const ceremony = locationFromString(wedding.ceremonyLocation)
  const reception = locationFromString(wedding.receptionLocation)
  if (ceremony) locations.ceremony = ceremony
  if (reception) locations.reception = reception

  type StructuredPlace = { role: WeddingPlaceRole; label?: string | null; formattedAddress?: string | null }
  const placeFor = (...roles: WeddingPlaceRole[]) => input.weddingPlaces?.find((place) => roles.includes(place.role))
  const structuredLocation = (place: StructuredPlace | undefined) => {
    if (!place) return undefined
    const target = locationTarget(place.label, place.formattedAddress)
    if (!target) return undefined
    return target
  }
  const preparationPlace = placeFor('bride_preparation', 'preparation')
  const bridePlace = placeFor('bride_preparation')
  const groomPlace = placeFor('groom_preparation')
  const ceremonyPlace = placeFor('ceremony')
  const receptionPlace = placeFor('reception')
  const structuredPreparation = structuredLocation(preparationPlace)
  const structuredCeremony = structuredLocation(ceremonyPlace)
  const structuredReception = structuredLocation(receptionPlace)
  if (structuredPreparation && locations.preparation) locations.preparation = { ...locations.preparation, target: structuredPreparation }
  if (structuredCeremony && locations.ceremony) locations.ceremony = { ...locations.ceremony, target: structuredCeremony }
  if (structuredReception && locations.reception) locations.reception = { ...locations.reception, target: structuredReception }
  if (bridePlace || groomPlace) {
    locations.preparationLocations = (locations.preparationLocations ?? []).map((entry) => {
      const place = entry.person === 'bride' ? bridePlace : entry.person === 'groom' ? groomPlace : undefined
      const target = structuredLocation(place)
      return target ? { ...entry, target } : entry
    })
  } else if (preparationPlace && locations.preparationLocations?.length === 1 && structuredPreparation) {
    locations.preparationLocations = locations.preparationLocations.map((entry) => ({ ...entry, target: structuredPreparation }))
  }

  // A5: empty optional roles must be explicit unknowns — omission alone lets Full-AI
  // invent ceremony/prep by copying reception.
  const absentLocationRoles: Array<'ceremony' | 'preparation' | 'reception'> = []
  if (!ceremony) absentLocationRoles.push('ceremony')
  if (prepEntries.length === 0) absentLocationRoles.push('preparation')
  if (!reception) absentLocationRoles.push('reception')
  if (absentLocationRoles.length > 0) {
    locations.absentLocationRoles = absentLocationRoles
    locations.locationRoleIntegrity = {
      eachRoleIndependent: true,
      neverInferAbsentRoleFromAnother: true,
      sameVenueOnlyWhenExplicitPerRole: true,
      absentMeansDoNotAssertVenue: true,
    }
  }

  const extraProjection = buildDatasetAdditionalServices(input.extras ?? [])

  const dataset: ContractTransformationDataset = {
    clients: {
      displayNames,
      personCount,
      ...(address ? { address } : {}),
      ...(phone ? { phone } : {}),
      customers,
    },
    dates: {
      contractExecutionDate: execution,
      weddingDate,
      ...(finalPaymentDueDate ? { finalPaymentDueDate: plDate(finalPaymentDueDate) } : {}),
      ...(deliveryDueDate ? { deliveryDueDate: plDate(deliveryDueDate) } : {}),
    },
    locations,
    finances,
    package: pkg.name?.trim() ? { name: pkg.name.trim() } : {},
    ...(extraProjection.additionalServices.length > 0
      ? {
          additionalServices: extraProjection.additionalServices,
          additionalServicesDisplayText:
            extraProjection.additionalServicesDisplayText,
          additionalServicesExpectation: {
            expectedNames: extraProjection.additionalServices.map((s) => s.name),
            shouldAppear: true,
            pricesMustNotAppear: true as const,
            quantitiesMustNotAppear: true as const,
          },
        }
      : {}),
  }

  return dataset
}

/** Fixture / manual builder — strips empty optional strings. */
export function sanitizeTransformationDataset(
  raw: ContractTransformationDataset,
): ContractTransformationDataset {
  const strip = <T extends Record<string, unknown>>(obj: T): T => {
    const next = { ...obj }
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === null || v === '') delete next[k]
      else if (Array.isArray(v)) {
        if (v.length === 0) delete next[k]
      } else if (typeof v === 'object') {
        const nested = strip(v as Record<string, unknown>)
        if (Object.keys(nested).length === 0) delete next[k]
        else (next as Record<string, unknown>)[k] = nested
      }
    }
    return next
  }
  return strip(raw)
}
