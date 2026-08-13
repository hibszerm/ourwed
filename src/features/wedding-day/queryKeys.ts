/**
 * Shared React Query keys for wedding-day operational surfaces
 * (Plan dnia, Cockpit, travel). Prefer these over literal duplicates.
 */

export {
  travelPlanQueryKey,
  weddingPlacesQueryKey,
} from '@/features/wedding-day/travelPlanPlaces'

export function operationalTimesQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['operational-times', string | null | undefined, string] {
  return ['operational-times', userId, weddingId] as const
}

export function operationalCompletionsQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['operational-completions', string | null | undefined, string] {
  return ['operational-completions', userId, weddingId] as const
}

export function weddingDetailQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['weddings', string | null | undefined, string] {
  return ['weddings', userId, weddingId] as const
}

export function weddingContactsQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['contacts', string | null | undefined, string] {
  return ['contacts', userId, weddingId] as const
}

export const PREWEDDING_QUESTIONNAIRE_QUERY_KEY = 'prewedding-questionnaire' as const

export function preweddingQuestionnaireQueryKey(
  weddingId: string,
): readonly [typeof PREWEDDING_QUESTIONNAIRE_QUERY_KEY, string] {
  return [PREWEDDING_QUESTIONNAIRE_QUERY_KEY, weddingId] as const
}

export function preweddingResponseQueryKey(
  questionnaireId: string | null | undefined,
): readonly ['prewedding-response', string | null | undefined] {
  return ['prewedding-response', questionnaireId] as const
}
