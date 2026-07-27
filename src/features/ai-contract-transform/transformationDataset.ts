/**
 * Resolve closed ContractTransformationDataset from wedding + package.
 * Omits missing optional fields — never fabricates "r.", "0 zł", "—".
 */

import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import {
  isIncompleteLocationAddress,
  looksLikeStreetAddress,
  looksLikeVenueDisplayName,
} from './locationInsertionPolicy'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { ContractTransformationDataset } from './types'

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
  const parts =
    which === 1
      ? [c.partner1Address, c.partner1PostalCode, c.partner1City]
      : [c.partner2Address, c.partner2PostalCode, c.partner2City]
  const joined = parts.map((p) => p?.trim()).filter(Boolean)
  return joined.length ? joined.join(', ') : undefined
}

function locationFromString(
  value: string | null | undefined,
): ContractTransformationDataset['locations']['ceremony'] | undefined {
  const raw = value?.trim() || undefined
  if (!raw) return undefined
  if (isIncompleteLocationAddress(raw)) {
    return { fullAddress: raw }
  }
  if (looksLikeStreetAddress(raw) && !looksLikeVenueDisplayName(raw)) {
    return { fullAddress: raw }
  }
  if (looksLikeVenueDisplayName(raw) && !looksLikeStreetAddress(raw)) {
    return { displayName: raw }
  }
  // Ambiguous: keep both so prompts/classifier can choose
  return { displayName: raw, fullAddress: raw }
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
  push('finances.contractValueFormatted', dataset.finances.contractValueFormatted)
  push('finances.contractValueWords', dataset.finances.contractValueWords)
  push('finances.depositFormatted', dataset.finances.depositFormatted)
  push('finances.depositWords', dataset.finances.depositWords)
  push('finances.remainingFormatted', dataset.finances.remainingFormatted)
  push('finances.remainingWords', dataset.finances.remainingWords)
  push('package.name', dataset.package.name)
  return out
}

export function buildContractTransformationDataset(input: {
  wedding: Wedding
  package: Pick<StudioPackage, 'id' | 'name'>
  currentDate?: string
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

  const locations: ContractTransformationDataset['locations'] = {}
  const prep = locationFromString(wedding.preparationLocation)
  const ceremony = locationFromString(wedding.ceremonyLocation)
  const reception = locationFromString(wedding.receptionLocation)
  if (prep) locations.preparation = prep
  if (ceremony) locations.ceremony = ceremony
  if (reception) locations.reception = reception

  const dataset: ContractTransformationDataset = {
    clients: {
      displayNames,
      personCount,
      ...(address ? { address } : {}),
      ...(phone ? { phone } : {}),
    },
    dates: {
      contractExecutionDate: execution,
      weddingDate,
    },
    locations,
    finances,
    package: pkg.name?.trim() ? { name: pkg.name.trim() } : {},
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
      else if (typeof v === 'object' && !Array.isArray(v)) {
        const nested = strip(v as Record<string, unknown>)
        if (Object.keys(nested).length === 0) delete next[k]
        else (next as Record<string, unknown>)[k] = nested
      }
    }
    return next
  }
  return strip(raw)
}
