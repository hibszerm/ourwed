import { contractService } from '@/lib/api/contractService'
import { getLatestSubmittedFormAnswerRecord } from '@/lib/api/forms'
import { galleryService, type Gallery } from '@/lib/api/galleryService'
import { noteService } from '@/lib/api/noteService'
import { paymentService } from '@/lib/api/paymentService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { mergeFormAnswersIntoWedding } from '@/lib/forms/mergeFormAnswersIntoWedding'
import type { Wedding, WeddingContract } from '@/types/wedding'

function applyGalleryToDeliverables(
  wedding: Wedding,
  gallery: Gallery | null,
): Wedding {
  if (!gallery?.galleryUrl) return wedding
  return {
    ...wedding,
    deliverables: wedding.deliverables.map((d) => {
      const isGallery =
        Boolean(d.links?.galleryUrl) || /galeria/i.test(d.name)
      if (!isGallery) return d
      return {
        ...d,
        links: { ...d.links, galleryUrl: gallery.galleryUrl },
      }
    }),
  }
}

async function hydrateWeddingFromContractForm(
  wedding: Wedding,
): Promise<Wedding> {
  const latest = await getLatestSubmittedFormAnswerRecord(wedding.id, 'contract')
  if (!latest) return wedding

  return mergeFormAnswersIntoWedding(wedding, latest.answerJson, {
    submittedAt: latest.submittedAt,
  })
}

/**
 * Operational locations from wedding_places override free-text when present.
 * Keeps legacy form/venue text as fallback for display.
 */
async function hydrateWeddingPlaces(wedding: Wedding): Promise<Wedding> {
  try {
    const places = await weddingPlaceService.listByWeddingId(wedding.id)
    if (places.length === 0) return wedding

    const byRole = new Map(places.map((p) => [p.role, p]))
    return {
      ...wedding,
      preparationLocation:
        byRole.get('preparation')?.formattedAddress ||
        wedding.preparationLocation,
      ceremonyLocation:
        byRole.get('ceremony')?.formattedAddress || wedding.ceremonyLocation,
      receptionLocation:
        byRole.get('reception')?.formattedAddress || wedding.receptionLocation,
    }
  } catch {
    return wedding
  }
}

function assembleWedding(
  wedding: Wedding,
  payments: Wedding['payments'],
  notes: Wedding['notes'],
  timeline: Wedding['timeline'],
  contract: WeddingContract | null,
  gallery: Gallery | null,
): Wedding {
  return applyGalleryToDeliverables(
    {
      ...wedding,
      payments,
      notes,
      timeline,
      contract: contract ?? { status: 'none' },
    },
    gallery,
  )
}

/**
 * Hydrate nested domains for a single wedding.
 */
export async function finalizeWeddingView(wedding: Wedding): Promise<Wedding> {
  const [payments, notes, timeline, contract, gallery] = await Promise.all([
    paymentService.listByWeddingId(wedding.id),
    noteService.listByWeddingId(wedding.id),
    timelineEventService.listByWeddingId(wedding.id),
    contractService.getByWeddingId(wedding.id),
    galleryService.getByWeddingId(wedding.id),
  ])

  const withForm = await hydrateWeddingFromContractForm(
    assembleWedding(wedding, payments, notes, timeline, contract, gallery),
  )
  return hydrateWeddingPlaces(withForm)
}

/**
 * Batch-hydrate many weddings — one query per child table instead of N×5.
 * Form-answer merge still runs per wedding (depends on form category lookup).
 */
export async function finalizeWeddingViews(
  weddings: Wedding[],
): Promise<Wedding[]> {
  if (weddings.length === 0) return []
  if (weddings.length === 1) {
    return [await finalizeWeddingView(weddings[0])]
  }

  const ids = weddings.map((w) => w.id)

  const [paymentsMap, notesMap, timelineMap, contractsMap, galleriesMap] =
    await Promise.all([
      paymentService.listByWeddingIds(ids),
      noteService.listByWeddingIds(ids),
      timelineEventService.listByWeddingIds(ids),
      contractService.listByWeddingIds(ids),
      galleryService.listByWeddingIds(ids),
    ])

  return Promise.all(
    weddings.map(async (wedding) => {
      const assembled = assembleWedding(
        wedding,
        paymentsMap.get(wedding.id) ?? [],
        notesMap.get(wedding.id) ?? [],
        timelineMap.get(wedding.id) ?? [],
        contractsMap.get(wedding.id) ?? null,
        galleriesMap.get(wedding.id) ?? null,
      )
      const withForm = await hydrateWeddingFromContractForm(assembled)
      return hydrateWeddingPlaces(withForm)
    }),
  )
}
