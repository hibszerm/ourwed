/**
 * Pure couple name field helpers shared by contract form persist + hydrate.
 * No Supabase / service imports — safe for acceptance tests.
 */

import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import { isAbsentPartnerName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { Wedding } from '@/types/wedding'

export function resolvedNamePart(
  explicit: string | undefined | null,
  full: string | undefined | null,
  which: 'first' | 'last',
): string {
  const trimmed = explicit?.trim() || ''
  if (trimmed && !isAbsentPartnerName(trimmed)) return trimmed
  const split = splitPersonName(full ?? '')
  return which === 'first' ? split.first : split.last
}

function preferForm(formValue: string, weddingValue: string | undefined): string {
  const cleaned = formValue.trim()
  if (cleaned && !isAbsentPartnerName(cleaned)) return cleaned
  return weddingValue ?? ''
}

function fullName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

/**
 * Resolve bride/groom first+last+composed name from form parts + wedding.
 * Form-only composed names must never wipe a complete wedding full name when
 * the form is missing a part (or stores a UI placeholder like "—").
 */
export function resolveCoupleNamesFromFormParts(input: {
  formBrideFirst: string
  formBrideLast: string
  formGroomFirst: string
  formGroomLast: string
  wedding: Pick<Wedding, 'couple'>
}): {
  partner1: string
  partner2: string
  partner1FirstName: string | undefined
  partner1LastName: string | undefined
  partner2FirstName: string | undefined
  partner2LastName: string | undefined
} {
  const brideSplit = splitPersonName(input.wedding.couple.partner1 ?? '')
  const groomSplit = splitPersonName(input.wedding.couple.partner2 ?? '')
  const resolvedBrideFirst =
    preferForm(input.formBrideFirst, input.wedding.couple.partner1FirstName) ||
    brideSplit.first
  const resolvedBrideLast =
    preferForm(input.formBrideLast, input.wedding.couple.partner1LastName) ||
    brideSplit.last
  const resolvedGroomFirst =
    preferForm(input.formGroomFirst, input.wedding.couple.partner2FirstName) ||
    groomSplit.first
  const resolvedGroomLast =
    preferForm(input.formGroomLast, input.wedding.couple.partner2LastName) ||
    groomSplit.last

  return {
    partner1:
      fullName(resolvedBrideFirst, resolvedBrideLast) ||
      (input.wedding.couple.partner1 ?? ''),
    partner2:
      fullName(resolvedGroomFirst, resolvedGroomLast) ||
      (input.wedding.couple.partner2 ?? ''),
    partner1FirstName: resolvedBrideFirst || undefined,
    partner1LastName: resolvedBrideLast || undefined,
    partner2FirstName: resolvedGroomFirst || undefined,
    partner2LastName: resolvedGroomLast || undefined,
  }
}

/**
 * Build the contract-questionnaire fieldKey map from a Wedding view model.
 * Same shape that mergeFormAnswersIntoWedding reads.
 */
export function weddingToContractAnswerFields(
  wedding: Wedding,
): Record<string, string> {
  const c = wedding.couple
  const brideFirst = resolvedNamePart(
    c.partner1FirstName,
    c.partner1,
    'first',
  )
  const brideLast = resolvedNamePart(c.partner1LastName, c.partner1, 'last')
  const groomFirst = resolvedNamePart(
    c.partner2FirstName,
    c.partner2,
    'first',
  )
  const groomLast = resolvedNamePart(c.partner2LastName, c.partner2, 'last')

  return {
    'partner1.firstName': brideFirst,
    'partner1.lastName': brideLast,
    'partner1.phone': c.partner1Phone?.trim() || c.phone?.trim() || '',
    'partner1.email': c.partner1Email?.trim() || c.email?.trim() || '',
    'partner1.address': c.partner1Address?.trim() || '',
    'partner1.postalCode': c.partner1PostalCode?.trim() || '',
    'partner1.city': c.partner1City?.trim() || c.city?.trim() || '',
    'partner2.firstName': groomFirst,
    'partner2.lastName': groomLast,
    'partner2.phone': c.partner2Phone?.trim() || '',
    'partner2.email': c.partner2Email?.trim() || '',
    weddingDate: wedding.date || '',
    packageId: wedding.packageId || '',
    preparationLocation:
      wedding.bridePreparationLocation?.trim() ||
      wedding.preparationLocation?.trim() ||
      '',
    bridePreparationLocation:
      wedding.bridePreparationLocation?.trim() ||
      wedding.preparationLocation?.trim() ||
      '',
    groomPreparationLocation:
      wedding.groomPreparationLocation?.trim() || '',
    ceremonyLocation: wedding.ceremonyLocation?.trim() || '',
    receptionLocation: wedding.receptionLocation?.trim() || '',
  }
}
