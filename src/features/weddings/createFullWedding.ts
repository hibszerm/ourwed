/**
 * Full Create post-insert orchestration.
 *
 * weddingService.create remains the base insert (including deposit + notes).
 * This module then writes wedding_places and extras, then recomputes CV
 * with the existing extras helper. No questionnaire persistence. Never looks up Maps.
 */

import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { recomputeContractValueAfterExtrasSync } from '@/lib/forms/weddingExtraPricing'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import { isAbsentPartnerName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import type { AddWeddingExtraServiceInput } from '@/lib/api/weddingExtraServiceService'
import type { WeddingExtraService } from '@/types/package'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { CreateWeddingInput, Wedding } from '@/types/wedding'

export const FULL_CREATE_PLACE_ROLES = [
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
] as const

export type FullCreatePlaceRole = (typeof FULL_CREATE_PLACE_ROLES)[number]

/** AddressField / GeoPlace / free-text — converted with existing location helpers. */
export type FullCreatePlacesInput = {
  bridePreparation?: unknown
  groomPreparation?: unknown
  ceremony?: unknown
  reception?: unknown
}

export type FullCreateExtraInput = {
  extraServiceId: string
  /** Catalog snapshot at selection time — existing extras semantics. */
  priceSnapshot: number
  quantity?: number
  /** Frozen catalog name at selection time. */
  nameSnapshot?: string
}

export type CreateFullWeddingInput = {
  wedding: CreateWeddingInput
  places?: FullCreatePlacesInput
  extras?: FullCreateExtraInput[]
  /**
   * Photographer-edited package base. When omitted, `wedding.price` is the
   * package base (create runs before extras, so price is not yet extras-inclusive).
   */
  explicitPackagePrice?: number | null
}

export type FullCreateFailedPhase = 'places' | 'extras' | 'commercial_recompute'

const PHASE_MESSAGE: Record<FullCreateFailedPhase, string> = {
  places: 'Ślub został utworzony, ale nie udało się zapisać miejsc.',
  extras: 'Ślub został utworzony, ale nie udało się zapisać usług dodatkowych.',
  commercial_recompute:
    'Ślub został utworzony, ale nie udało się zaktualizować wartości umowy.',
}

export class FullCreatePartialError extends Error {
  readonly code = 'FULL_CREATE_PARTIAL'
  readonly weddingId: string
  readonly wedding: Wedding
  readonly phase: FullCreateFailedPhase

  constructor(input: {
    wedding: Wedding
    phase: FullCreateFailedPhase
    cause?: unknown
  }) {
    super(PHASE_MESSAGE[input.phase], { cause: input.cause })
    this.name = 'FullCreatePartialError'
    this.weddingId = input.wedding.id
    this.wedding = input.wedding
    this.phase = input.phase
  }
}

export function isFullCreatePartialError(
  error: unknown,
): error is FullCreatePartialError {
  return error instanceof FullCreatePartialError
}

const PLACE_SLOTS: Array<{
  key: keyof FullCreatePlacesInput
  role: FullCreatePlaceRole
}> = [
  { key: 'bridePreparation', role: 'bride_preparation' },
  { key: 'groomPreparation', role: 'groom_preparation' },
  { key: 'ceremony', role: 'ceremony' },
  { key: 'reception', role: 'reception' },
]

function isUsableGeoPlace(place: GeoPlace): boolean {
  const formatted = place.formattedAddress?.trim() || ''
  const label = place.label?.trim() || ''
  if (!formatted && !label) return false
  if (isAbsentPartnerName(formatted) && (!label || isAbsentPartnerName(label))) {
    return false
  }
  return true
}

/** Convert optional Full Create location values into insertInitialWeddingPlaces rows. */
export function collectFullCreatePlaces(
  places: FullCreatePlacesInput | undefined,
): Array<{ role: WeddingPlaceRole; place: GeoPlace }> {
  if (!places) return []
  const rows: Array<{ role: WeddingPlaceRole; place: GeoPlace }> = []
  for (const { key, role } of PLACE_SLOTS) {
    const incoming = normalizeLocationAnswer(places[key])
    if (!incoming.name && !incoming.formattedAddress) continue
    const geo = mergeLocationAnswerWithExisting(incoming, null)
    if (!isUsableGeoPlace(geo)) continue
    rows.push({ role, place: geo })
  }
  return rows
}

/** First occurrence of each extraServiceId; empty ids skipped. */
export function collectFullCreateExtras(
  extras: FullCreateExtraInput[] | undefined,
): Array<{
  extraServiceId: string
  priceSnapshot: number
  quantity: number
  nameSnapshot?: string
}> {
  if (!extras || extras.length === 0) return []
  const seen = new Set<string>()
  const rows: Array<{
    extraServiceId: string
    priceSnapshot: number
    quantity: number
    nameSnapshot?: string
  }> = []
  for (const extra of extras) {
    const extraServiceId = extra.extraServiceId?.trim() || ''
    if (!extraServiceId || seen.has(extraServiceId)) continue
    seen.add(extraServiceId)
    const quantity =
      extra.quantity != null && Number.isFinite(extra.quantity) && extra.quantity > 0
        ? extra.quantity
        : 1
    const priceSnapshot = Number.isFinite(extra.priceSnapshot)
      ? extra.priceSnapshot
      : 0
    const nameSnapshot = extra.nameSnapshot?.trim() || undefined
    rows.push({ extraServiceId, priceSnapshot, quantity, nameSnapshot })
  }
  return rows
}

export type CreateFullWeddingDeps = {
  createWedding: (input: CreateWeddingInput) => Promise<Wedding>
  insertInitialWeddingPlaces: (
    weddingId: string,
    places: Array<{ role: WeddingPlaceRole; place: GeoPlace }>,
  ) => Promise<WeddingPlace[]>
  addExtra: (input: AddWeddingExtraServiceInput) => Promise<WeddingExtraService>
  updateWedding: (wedding: Wedding) => Promise<Wedding>
}

const defaultDeps: CreateFullWeddingDeps = {
  createWedding: (input) => weddingService.create(input),
  insertInitialWeddingPlaces: (weddingId, places) =>
    weddingPlaceService.insertInitialWeddingPlaces(weddingId, places),
  addExtra: (input) => weddingExtraServiceService.add(input),
  updateWedding: (wedding) => weddingService.update(wedding, { hydrate: false }),
}

export type CreateFullWeddingResult = {
  wedding: Wedding
  places: WeddingPlace[]
  extras: WeddingExtraService[]
}

export async function createFullWedding(
  input: CreateFullWeddingInput,
  deps: CreateFullWeddingDeps = defaultDeps,
): Promise<CreateFullWeddingResult> {
  const created = await deps.createWedding(input.wedding)
  let wedding = created
  let places: WeddingPlace[] = []
  const extras: WeddingExtraService[] = []

  const placeRows = collectFullCreatePlaces(input.places)
  if (placeRows.length > 0) {
    try {
      places = await deps.insertInitialWeddingPlaces(created.id, placeRows)
    } catch (cause) {
      throw new FullCreatePartialError({
        wedding: created,
        phase: 'places',
        cause,
      })
    }
  }

  const extraRows = collectFullCreateExtras(input.extras)
  if (extraRows.length > 0) {
    try {
      for (const extra of extraRows) {
        extras.push(
          await deps.addExtra({
            weddingId: created.id,
            extraServiceId: extra.extraServiceId,
            priceSnapshot: extra.priceSnapshot,
            quantity: extra.quantity,
            nameSnapshot: extra.nameSnapshot,
          }),
        )
      }
    } catch (cause) {
      throw new FullCreatePartialError({
        wedding,
        phase: 'extras',
        cause,
      })
    }
  }

  const extrasAfterSync = extras.map((extra) => ({
    priceSnapshot: extra.priceSnapshot,
    quantity: extra.quantity,
  }))
  const nextPrice = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: created.price,
    extrasBeforeSync: [],
    extrasAfterSync,
    effectiveTravelFee: getEffectiveTravelFeeAmount(created),
    explicitPackagePrice:
      input.explicitPackagePrice != null &&
      Number.isFinite(input.explicitPackagePrice)
        ? input.explicitPackagePrice
        : created.price,
  })

  if (nextPrice !== created.price) {
    try {
      wedding = await deps.updateWedding({
        ...created,
        price: nextPrice,
      })
    } catch (cause) {
      throw new FullCreatePartialError({
        wedding: { ...created, price: created.price },
        phase: 'commercial_recompute',
        cause,
      })
    }
  }

  return { wedding, places, extras }
}
