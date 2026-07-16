import { packageService } from '@/lib/api/packageService'
import { asCatalogPackageId } from '@/lib/supabase/helpers'
import { CONTRACT_QUESTION_ID_TO_FIELD_KEY } from '@/lib/forms/contractQuestionnaireTemplate'
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
  const brideAddress = fieldString(fields, 'partner1.address')
  const bridePostal = fieldString(fields, 'partner1.postalCode')
  const city = fieldString(fields, 'partner1.city')
  const weddingDate = fieldString(fields, 'weddingDate')
  const ceremonyLocation = fieldString(fields, 'ceremonyLocation')
  const receptionLocation = fieldString(fields, 'receptionLocation')
  const preparationLocation = fieldString(fields, 'preparationLocation')
  const packageId = asCatalogPackageId(fieldString(fields, 'packageId'))

  const pkg = packageId ? await packageService.get(packageId) : null

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

  const nextPackageName = preferForm(pkg?.name ?? '', wedding.packageName)
  const nextPrice = pkg ? pkg.price : wedding.price

  return {
    ...wedding,
    couple,
    date: preferForm(weddingDate, wedding.date),
    packageId: pkg?.id ?? asCatalogPackageId(wedding.packageId) ?? null,
    packageName: nextPackageName,
    price: nextPrice,
    depositAmount: pkg?.depositAmount ?? wedding.depositAmount,
    currency: pkg?.currency ?? wedding.currency,
    accentColor: pkg?.color ?? wedding.accentColor,
    ceremonyLocation:
      preferForm(ceremonyLocation, wedding.ceremonyLocation) || undefined,
    receptionLocation:
      preferForm(receptionLocation, wedding.receptionLocation) || undefined,
    preparationLocation:
      preferForm(preparationLocation, wedding.preparationLocation) || undefined,
    notes: wedding.notes,
    questionnaires,
  }
}
