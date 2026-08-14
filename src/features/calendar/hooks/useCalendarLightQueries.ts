import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { calendarLightService } from '@/lib/api/calendarLightService'
import { calendarEventService } from '@/lib/api/calendarEventService'
import { withDevPerf } from '@/lib/performance/devPerf'

/** Shared prefix — invalidateQueries({ queryKey: ['calendar'] }) covers all. */
export function calendarWeddingsQueryKey(userId: string | undefined) {
  return ['calendar', 'weddings', userId] as const
}

export function calendarSessionsQueryKey(userId: string | undefined) {
  return ['calendar', 'sessions', userId] as const
}

export function calendarEventsQueryKey(userId: string | undefined) {
  return ['calendar', 'events', userId] as const
}

const CALENDAR_STALE_MS = 1000 * 60 * 5

export function useCalendarWeddings() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: calendarWeddingsQueryKey(userId),
    queryFn: () => calendarLightService.listWeddingsForCalendar(),
    enabled: Boolean(userId),
    staleTime: CALENDAR_STALE_MS,
  })
}

export function useCalendarSessions() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: calendarSessionsQueryKey(userId),
    queryFn: () => calendarLightService.listSessionsForCalendar(),
    enabled: Boolean(userId),
    staleTime: CALENDAR_STALE_MS,
  })
}

export function useCalendarEvents() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: calendarEventsQueryKey(userId),
    queryFn: () =>
      withDevPerf('calendar.events', () => calendarEventService.listAll()),
    enabled: Boolean(userId),
    staleTime: CALENDAR_STALE_MS,
  })
}
