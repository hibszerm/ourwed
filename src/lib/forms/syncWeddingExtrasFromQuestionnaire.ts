/**
 * Sync questionnaire-selected additional services onto wedding_extra_services.
 *
 * Sync rule (additive / idempotent for associations):
 * - Insert each validated selected ID that is not already linked to the wedding.
 * - Never delete existing rows (manual extras and prior associations stay).
 * - Price snapshots come from questionnaire options_snapshot (not browser prices).
 *
 * Contract value is recalculated by the caller / RPC as:
 *   packageBase + Σ(price_snapshot × quantity)
 * using weddingExtraPricing helpers — never `price = price + extras`.
 *
 * Retry rule: public submit rejects ALREADY_SUBMITTED; approve recomputes
 * the same deterministic total so retries do not inflate the contract value.
 */

import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { extractAnswerFields } from '@/lib/forms/mergeFormAnswersIntoWedding'
import {
  planWeddingExtraSync,
  validateSelectedExtraIdsAgainstSnapshot,
} from '@/lib/forms/weddingExtraSyncPlan'
import type {
  AdditionalServiceOptionSnapshot,
  FormInstanceOptionsSnapshot,
} from '@/types/contractQuestionnaire'
import type { FormAnswerJson } from '@/types/formEngine'
import type { WeddingExtraService } from '@/types/package'

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((id) => id.length > 0)
}

function snapshotExtras(
  answerJson: FormAnswerJson,
  optionsSnapshot?: FormInstanceOptionsSnapshot | null,
): AdditionalServiceOptionSnapshot[] {
  const fromOptions = optionsSnapshot?.additionalServiceOptions
  if (Array.isArray(fromOptions) && fromOptions.length > 0) {
    return fromOptions
  }
  const fromAnswer = answerJson.additionalServiceSnapshots
  if (Array.isArray(fromAnswer) && fromAnswer.length > 0) {
    return fromAnswer as AdditionalServiceOptionSnapshot[]
  }
  return []
}

export type SyncWeddingExtrasResult = {
  inserted: string[]
  skipped: string[]
  /** Authoritative extras after sync (for CV math — no second list required). */
  extrasAfter: WeddingExtraService[]
  /** Extras observed before sync (empty when none selected / brand-new wedding). */
  extrasBefore: WeddingExtraService[]
}

/**
 * Validate selected IDs against the questionnaire snapshot, then upsert missing
 * wedding_extra_services rows. Rejects invalid IDs when a non-empty allow-list exists.
 *
 * Zero selected extras: no list round-trips.
 */
export async function syncWeddingExtrasFromQuestionnaireAnswer(
  weddingId: string,
  answerJson: FormAnswerJson,
  optionsSnapshot?: FormInstanceOptionsSnapshot | null,
): Promise<SyncWeddingExtrasResult> {
  const fields = extractAnswerFields(answerJson)
  const selectedIds = asIdList(fields.selectedAdditionalServiceIds)
  if (selectedIds.length === 0) {
    return {
      inserted: [],
      skipped: [],
      extrasAfter: [],
      extrasBefore: [],
    }
  }

  const catalog = snapshotExtras(answerJson, optionsSnapshot)
  const byId = new Map(catalog.map((s) => [s.id, s]))

  if (catalog.length > 0) {
    const { invalid } = validateSelectedExtraIdsAgainstSnapshot(
      selectedIds,
      catalog,
    )
    if (invalid.length > 0) {
      throw new Error('INVALID_EXTRA_SERVICE_ID')
    }
  }

  const extrasBefore =
    await weddingExtraServiceService.listByWeddingId(weddingId)
  const { toInsert, toSkip } = planWeddingExtraSync(
    selectedIds,
    extrasBefore.map((e) => e.extraServiceId),
  )

  const insertedRows = await Promise.all(
    toInsert.map((id) => {
      const snap = byId.get(id)
      return weddingExtraServiceService.add({
        weddingId,
        extraServiceId: id,
        quantity: 1,
        priceSnapshot: typeof snap?.price === 'number' ? snap.price : 0,
      })
    }),
  )

  return {
    inserted: toInsert,
    skipped: toSkip,
    extrasBefore,
    extrasAfter: [...extrasBefore, ...insertedRows],
  }
}

export {
  planWeddingExtraSync,
  validateSelectedExtraIdsAgainstSnapshot,
} from '@/lib/forms/weddingExtraSyncPlan'
