/**
 * Compose Cockpit DTO from the same React Query keys as Plan dnia / detail.
 * No independent aggregated snapshot — mutations that update shared keys
 * flow through immediately on in-app navigation.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { buildWeddingDayCockpitData } from '@/features/wedding-day-cockpit/buildWeddingDayCockpitData'
import type { WeddingDayCockpitData } from '@/features/wedding-day-cockpit/types'
import {
  operationalCompletionsQueryKey,
  operationalTimesQueryKey,
  preweddingQuestionnaireQueryKey,
  preweddingResponseQueryKey,
  travelPlanQueryKey,
  weddingContactsQueryKey,
  weddingDetailQueryKey,
  weddingPlacesQueryKey,
} from '@/features/wedding-day/queryKeys'
import { contactService } from '@/lib/api/contactService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { travelService } from '@/lib/api/travelService'
import { weddingOperationalCompletionsService } from '@/lib/api/weddingOperationalCompletionsService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import type { TravelPlan } from '@/types/travel'

function emptyTravelError(weddingId: string): TravelPlan {
  return {
    weddingId,
    studio: null,
    places: [],
    segments: [],
    hasError: true,
    errorMessage: 'Nie udało się wyliczyć trasy.',
    persistenceError: null,
  }
}

export function useWeddingDayCockpitData(weddingId: string) {
  const userId = useStudioAuthId()
  const enabled = Boolean(userId && weddingId)

  const weddingQuery = useQuery({
    queryKey: weddingDetailQueryKey(userId, weddingId),
    queryFn: () => weddingService.getById(weddingId),
    enabled,
    retry: false,
  })

  const placesQuery = useQuery({
    queryKey: weddingPlacesQueryKey(userId, weddingId),
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
    enabled,
    retry: false,
  })

  const timesQuery = useQuery({
    queryKey: operationalTimesQueryKey(userId, weddingId),
    queryFn: () => weddingOperationalTimesService.listByWeddingId(weddingId),
    enabled,
    retry: false,
  })

  const completionsQuery = useQuery({
    queryKey: operationalCompletionsQueryKey(userId, weddingId),
    queryFn: () =>
      weddingOperationalCompletionsService.listByWeddingId(weddingId),
    enabled,
    retry: false,
  })

  const contactsQuery = useQuery({
    queryKey: weddingContactsQueryKey(userId, weddingId),
    queryFn: () => contactService.listByWeddingId(weddingId),
    enabled,
    retry: false,
  })

  const travelQuery = useQuery({
    queryKey: travelPlanQueryKey(userId, weddingId),
    queryFn: async (): Promise<TravelPlan> => {
      try {
        const next = await travelService.getPlan(weddingId, {
          forceRefresh: false,
        })
        return { ...next, places: [] }
      } catch {
        return emptyTravelError(weddingId)
      }
    },
    enabled,
    retry: false,
  })

  const questionnaireQuery = useQuery({
    queryKey: preweddingQuestionnaireQueryKey(weddingId),
    queryFn: () => weddingQuestionnaireService.getByWeddingId(weddingId),
    enabled,
    retry: false,
  })

  const preQ = questionnaireQuery.data
  const responseQuery = useQuery({
    queryKey: preweddingResponseQueryKey(preQ?.id),
    queryFn: () =>
      preQ ? weddingQuestionnaireService.getResponse(preQ.id) : null,
    enabled: Boolean(
      enabled &&
        preQ &&
        ['submitted', 'reopened', 'in_progress', 'opened'].includes(preQ.status),
    ),
    retry: false,
  })

  const data: WeddingDayCockpitData | null = useMemo(() => {
    const wedding = weddingQuery.data
    if (!wedding) return null
    const places = placesQuery.data ?? []
    const operationalTimes = timesQuery.data ?? {}
    const completions = completionsQuery.data ?? {}
    const contacts = contactsQuery.data ?? []
    const plan = travelQuery.data
      ? { ...travelQuery.data, places: [] }
      : null

    let preWedding: Parameters<
      typeof buildWeddingDayCockpitData
    >[0]['preWedding'] = null
    if (preQ && responseQuery.data?.answers) {
      const answers = responseQuery.data.answers as Record<string, unknown>
      if (Object.keys(answers).length > 0) {
        preWedding = {
          title: preQ.title || 'Ankieta przedślubna',
          submittedAt: responseQuery.data.submittedAt ?? undefined,
          schema: preQ.schema,
          answers,
        }
      }
    }

    return buildWeddingDayCockpitData({
      wedding,
      places,
      operationalTimes,
      completions,
      plan,
      contacts,
      preWedding,
    })
  }, [
    weddingQuery.data,
    placesQuery.data,
    timesQuery.data,
    completionsQuery.data,
    contactsQuery.data,
    travelQuery.data,
    preQ,
    responseQuery.data,
  ])

  const corePending =
    weddingQuery.isLoading ||
    placesQuery.isLoading ||
    timesQuery.isLoading ||
    completionsQuery.isLoading ||
    contactsQuery.isLoading ||
    travelQuery.isLoading

  const isError =
    weddingQuery.isError ||
    (weddingQuery.isSuccess && !weddingQuery.data) ||
    placesQuery.isError ||
    timesQuery.isError ||
    completionsQuery.isError ||
    contactsQuery.isError

  const error =
    weddingQuery.error ??
    placesQuery.error ??
    timesQuery.error ??
    completionsQuery.error ??
    contactsQuery.error ??
    (weddingQuery.isSuccess && !weddingQuery.data
      ? new Error('Nie znaleziono zlecenia lub brak dostępu.')
      : null)

  return {
    userId,
    data,
    isLoading: enabled && corePending && !data,
    isFetching:
      weddingQuery.isFetching ||
      placesQuery.isFetching ||
      timesQuery.isFetching ||
      completionsQuery.isFetching,
    isError,
    error,
    refetch: async () => {
      await Promise.all([
        weddingQuery.refetch(),
        placesQuery.refetch(),
        timesQuery.refetch(),
        completionsQuery.refetch(),
        contactsQuery.refetch(),
        travelQuery.refetch(),
        questionnaireQuery.refetch(),
      ])
    },
  }
}
