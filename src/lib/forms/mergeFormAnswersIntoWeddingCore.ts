import { asCatalogPackageId } from '@/lib/supabase/helpers.ts'
import { resolveHydratedWeddingPackageId } from '@/lib/api/weddings/weddingPackageIdSafety.ts'
import { CONTRACT_QUESTION_ID_TO_FIELD_KEY } from '@/lib/forms/contractQuestionnaireTemplate.ts'
import { formatLocationAnswer, normalizeSelectedPackageIds } from '@/lib/forms/contractQuestionnaireAnswerValues.ts'
import { packageSelectionNeedsReview } from '@/lib/forms/packageSelectionReview.ts'
import type { FormAnswerJson } from '@/types/formEngine'
import type { StudioPackage } from '@/types/package'
import type { Couple, Wedding } from '@/types/wedding'

/** Block-builder question ids used by studio-configured contract forms. */
const SYSTEM_QUESTION_ID_TO_FIELD_KEY: Record<string, string> = {
  sys_p1_first: 'partner1.firstName',
  sys_p1_last: 'partner1.lastName',
  sys_p1_phone: 'partner1.phone',
  sys_p1_email: 'partner1.email',
  sys_p1_address: 'partner1.address',
  sys_p2_first: 'partner2.firstName',
  sys_p2_last: 'partner2.lastName',
  sys_p2_phone: 'partner2.phone',
  sys_p2_email: 'partner2.email',
  sys_p2_address: 'partner2.address',
}

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || String(value).trim() === ''
}

function fieldString(
  fields: Record<string, unknown>,
  key: string,
): string {
  const value = fields[key]
  if (typeof value === 'string') return key.endsWith('.address') ? value : value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value && typeof value === 'object') {
    return formatLocationAnswer(value)
  }
  return ''
}

function resolveQuestionFieldKey(questionId: string): string | undefined {
  return (
    CONTRACT_QUESTION_ID_TO_FIELD_KEY[questionId] ??
    SYSTEM_QUESTION_ID_TO_FIELD_KEY[questionId]
  )
}

function fieldsFromValues(values: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [questionId, value] of Object.entries(values)) {
    const fieldKey = resolveQuestionFieldKey(questionId)
    if (fieldKey) fields[fieldKey] = value
  }
  return fields
}

function fieldsFromAnswers(answers: unknown): Record<string, unknown> {
  if (!Array.isArray(answers)) return {}
  const fields: Record<string, unknown> = {}
  for (const item of answers) {
    if (!item || typeof item !== 'object') continue
    const questionId = (item as { questionId?: unknown }).questionId
    const value = (item as { value?: unknown }).value
    if (typeof questionId !== 'string') continue
    const fieldKey = resolveQuestionFieldKey(questionId)
    if (fieldKey) fields[fieldKey] = value
  }
  return fields
}

/**
 * Extract the fieldKey map from a Form Engine answer_json document.
 */
export function extractAnswerFields(
  answerJson: FormAnswerJson,
): Record<string, unknown> {
  const direct = answerJson.fields
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    const keys = Object.keys(direct as object)
    if (keys.length > 0) return direct as Record<string, unknown>
  }

  const values = answerJson.values
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    const fromValues = fieldsFromValues(values as Record<string, unknown>)
    if (Object.keys(fromValues).length > 0) return fromValues
  }

  return fieldsFromAnswers(answerJson.answers)
}

function preferForm(formValue: string, weddingValue: string | undefined): string {
  if (!isBlank(formValue)) return formValue
  return weddingValue ?? ''
}

/**
 * Merge contract questionnaire answers into a Wedding view model.
 * Package pricing is resolved from Studio Catalog (live) only when hydrating
 * newly submitted answers — persisted wedding snapshots remain authoritative.
 *
 * Compatibility:
 * - selectedPackageIds[] is the canonical multi-select answer
 * - packageId on wedding remains the primary commercial package
 * - if wedding already has packageId, do not overwrite commercial fields;
 *   still record selectedPackageIds for review
 */
export async function mergeFormAnswersIntoWeddingCore(
  wedding: Wedding,
  answerJson: FormAnswerJson,
  meta?: { submittedAt?: string | null },
  resolvePackage: (id: string) => Promise<Pick<StudioPackage, 'id' | 'name'> | null> = async () => null,
): Promise<Wedding> {
  const fields = extractAnswerFields(answerJson)
  if (Object.keys(fields).length === 0) {
    return wedding
  }

  const submittedDay = (meta?.submittedAt ?? new Date().toISOString()).slice(
    0,
    10,
  )

  // Contact answers remain part of the Contract snapshot. Operational Contacts
  // are read only from the canonical wedding columns after the V3 cutover.
  const weddingDate = fieldString(fields, 'weddingDate')
  const ceremonyLocation = fieldString(fields, 'ceremonyLocation')
  const receptionLocation = fieldString(fields, 'receptionLocation')
  const bridePreparationLocation = fieldString(
    fields,
    'bridePreparationLocation',
  )
  const groomPreparationLocation = fieldString(
    fields,
    'groomPreparationLocation',
  )
  const legacyPreparation = fieldString(fields, 'preparationLocation')
  const preparationLocation =
    bridePreparationLocation || legacyPreparation

  const selectedPackageIds = normalizeSelectedPackageIds(fields)
  const primaryFromForm = asCatalogPackageId(selectedPackageIds[0] ?? '')
  const legacyPackageId = asCatalogPackageId(fieldString(fields, 'packageId'))
  const requestedPrimary = primaryFromForm ?? legacyPackageId

  const packageSelectionNeedsReviewFlag = packageSelectionNeedsReview(
    wedding.packageId,
    requestedPrimary,
  )

  // Prefer existing wedding commercial snapshot. Catalog is only used to fill
  // packageId/name when the wedding has no package yet — never overwrite price,
  // agreedDeposit, currency, accentColor, or packageItems from live catalog.
  const pkg =
    requestedPrimary && !wedding.packageId
      ? await resolvePackage(requestedPrimary)
      : null

  const couple: Couple = {
    ...wedding.couple,
    partner1: wedding.couple.partner1,
    partner2: wedding.couple.partner2,
    partner1FirstName: wedding.couple.partner1FirstName,
    partner1LastName: wedding.couple.partner1LastName,
    partner2FirstName: wedding.couple.partner2FirstName,
    partner2LastName: wedding.couple.partner2LastName,
    partner1Phone: wedding.couple.partner1Phone,
    partner2Phone: wedding.couple.partner2Phone,
    partner1Email: wedding.couple.partner1Email,
    partner2Email: wedding.couple.partner2Email,
    partner1Address:
      wedding.couple.partner1Address,
    partner2Address: wedding.couple.partner2Address,
    partner1PostalCode: wedding.couple.partner1PostalCode,
    partner1City: wedding.couple.partner1City,
    email: wedding.couple.email,
    phone: wedding.couple.phone,
    city: wedding.couple.city,
    venue: preferForm(
      receptionLocation || ceremonyLocation,
      wedding.couple.venue,
    ),
  }

  const contractData = wedding.questionnaires.contractData
  const questionnaires =
    contractData.status === 'completed'
      ? wedding.questionnaires
      : {
          ...wedding.questionnaires,
          contractData: {
            status: 'completed' as const,
            sentAt: contractData.sentAt ?? submittedDay,
            completedAt: submittedDay,
          },
        }

  // Never fall back to an unresolved form packageId — missing/deleted catalog
  // rows must not hydrate into weddings.package_id (FK violation on save).
  const nextPackageId = resolveHydratedWeddingPackageId({
    weddingPackageId: wedding.packageId,
    resolvedCatalogPackageId: pkg?.id,
  })
  const nextPackageName = wedding.packageName?.trim()
    ? wedding.packageName
    : preferForm(pkg?.name ?? '', wedding.packageName)

  const nextSelected =
    selectedPackageIds.length > 0
      ? selectedPackageIds
      : wedding.selectedPackageIds

  return {
    ...wedding,
    couple,
    // Canonical DB wedding.date must win over older contract submissions.
    // The contract form is re-hydrated for display, but should never revert a
    // studio-admin edit like "Edytuj nazwę i datę".
    date: wedding.date?.trim()
      ? wedding.date
      : preferForm(weddingDate, wedding.date),
    packageId: nextPackageId,
    packageName: nextPackageName,
    selectedPackageIds: nextSelected,
    // Commercial snapshot stays authoritative
    price: wedding.price,
    depositAmount: wedding.depositAmount,
    currency: wedding.currency,
    accentColor: wedding.accentColor,
    packageItems: wedding.packageItems ?? [],
    ceremonyLocation:
      preferForm(ceremonyLocation, wedding.ceremonyLocation) || undefined,
    receptionLocation:
      preferForm(receptionLocation, wedding.receptionLocation) || undefined,
    bridePreparationLocation:
      preferForm(
        bridePreparationLocation,
        wedding.bridePreparationLocation,
      ) || undefined,
    groomPreparationLocation:
      preferForm(
        groomPreparationLocation,
        wedding.groomPreparationLocation,
      ) || undefined,
    preparationLocation:
      preferForm(preparationLocation, wedding.preparationLocation) ||
      undefined,
    notes: packageSelectionNeedsReviewFlag
      ? [
          ...wedding.notes,
          {
            id: `pkg-review-${submittedDay}`,
            content:
              'Klient wybrał inny pakiet w ankiecie niż potwierdzony w umowie — wymaga przeglądu.',
            createdAt: submittedDay,
            author: 'System',
            source: 'package_change',
            badge: 'Ankieta do umowy',
          },
        ]
      : wedding.notes,
    questionnaires,
  }
}
