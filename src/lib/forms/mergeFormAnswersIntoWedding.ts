import { packageService } from '@/lib/api/packageService'
import { asCatalogPackageId } from '@/lib/supabase/helpers'
import { resolveHydratedWeddingPackageId } from '@/lib/api/weddings/weddingPackageIdSafety'
import { CONTRACT_QUESTION_ID_TO_FIELD_KEY } from '@/lib/forms/contractQuestionnaireTemplate'
import {
  formatLocationAnswer,
  normalizeSelectedPackageIds,
} from '@/lib/forms/contractQuestionnaireSnapshot'
import { packageSelectionNeedsReview } from '@/lib/forms/packageSelectionReview'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Couple, Wedding } from '@/types/wedding'

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || String(value).trim() === ''
}

function fieldString(
  fields: Record<string, unknown>,
  key: string,
): string {
  const value = fields[key]
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value && typeof value === 'object') {
    return formatLocationAnswer(value)
  }
  return ''
}

function fullName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

function fieldsFromValues(values: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [questionId, value] of Object.entries(values)) {
    const fieldKey = CONTRACT_QUESTION_ID_TO_FIELD_KEY[questionId]
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
    const fieldKey = CONTRACT_QUESTION_ID_TO_FIELD_KEY[questionId]
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
export async function mergeFormAnswersIntoWedding(
  wedding: Wedding,
  answerJson: FormAnswerJson,
  meta?: { submittedAt?: string | null },
): Promise<Wedding> {
  const fields = extractAnswerFields(answerJson)
  if (Object.keys(fields).length === 0) {
    return wedding
  }

  const submittedDay = (meta?.submittedAt ?? new Date().toISOString()).slice(
    0,
    10,
  )

  const brideFirst = fieldString(fields, 'partner1.firstName')
  const brideLast = fieldString(fields, 'partner1.lastName')
  const groomFirst = fieldString(fields, 'partner2.firstName')
  const groomLast = fieldString(fields, 'partner2.lastName')
  const brideName = fullName(brideFirst, brideLast)
  const groomName = fullName(groomFirst, groomLast)

  const bridePhone = fieldString(fields, 'partner1.phone')
  const brideEmail = fieldString(fields, 'partner1.email')
  const groomPhone = fieldString(fields, 'partner2.phone')
  const groomEmail = fieldString(fields, 'partner2.email')
  const brideAddressRaw = fields['partner1.address']
  const brideAddress = fieldString(fields, 'partner1.address')
  const groomAddress = fieldString(fields, 'partner2.address')
  const structuredPostal =
    brideAddressRaw &&
    typeof brideAddressRaw === 'object' &&
    typeof (brideAddressRaw as { postalCode?: unknown }).postalCode === 'string'
      ? String((brideAddressRaw as { postalCode: string }).postalCode).trim()
      : ''
  const structuredCity =
    brideAddressRaw &&
    typeof brideAddressRaw === 'object' &&
    typeof (brideAddressRaw as { city?: unknown }).city === 'string'
      ? String((brideAddressRaw as { city: string }).city).trim()
      : ''
  const bridePostal =
    fieldString(fields, 'partner1.postalCode') || structuredPostal
  const city = fieldString(fields, 'partner1.city') || structuredCity
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
      ? await packageService.get(requestedPrimary)
      : null

  const couple: Couple = {
    ...wedding.couple,
    partner1: preferForm(brideName, wedding.couple.partner1),
    partner2: preferForm(groomName, wedding.couple.partner2),
    partner1FirstName:
      preferForm(brideFirst, wedding.couple.partner1FirstName) || undefined,
    partner1LastName:
      preferForm(brideLast, wedding.couple.partner1LastName) || undefined,
    partner2FirstName:
      preferForm(groomFirst, wedding.couple.partner2FirstName) || undefined,
    partner2LastName:
      preferForm(groomLast, wedding.couple.partner2LastName) || undefined,
    partner1Phone: preferForm(bridePhone, wedding.couple.partner1Phone) || undefined,
    partner2Phone: preferForm(groomPhone, wedding.couple.partner2Phone) || undefined,
    partner1Email: preferForm(brideEmail, wedding.couple.partner1Email) || undefined,
    partner2Email: preferForm(groomEmail, wedding.couple.partner2Email) || undefined,
    partner1Address:
      preferForm(brideAddress, wedding.couple.partner1Address) || undefined,
    partner2Address:
      preferForm(groomAddress, wedding.couple.partner2Address) || undefined,
    partner1PostalCode:
      preferForm(bridePostal, wedding.couple.partner1PostalCode) || undefined,
    partner1City: preferForm(city, wedding.couple.partner1City) || undefined,
    email: preferForm(brideEmail, wedding.couple.email),
    phone: preferForm(bridePhone, wedding.couple.phone),
    city: preferForm(city, wedding.couple.city),
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
    date: preferForm(weddingDate, wedding.date),
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
