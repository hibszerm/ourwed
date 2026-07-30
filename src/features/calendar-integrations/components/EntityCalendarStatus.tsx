import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationsService } from '@/features/calendar-integrations/calendarIntegrationsService'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import styles from './EntityCalendarStatus.module.css'

const GOOGLE_LABELS: Record<string, string> = {
  not_configured: 'Nie skonfigurowano',
  pending: 'Oczekuje',
  syncing: 'Synchronizowanie',
  synced: 'Zsynchronizowano',
  needs_attention: 'Wymaga uwagi',
  category_disabled: 'Wyłączono dla tej kategorii',
  omitted: 'Pominięto',
}

const APPLE_LABELS: Record<string, string> = {
  inactive: 'Nieaktywny',
  available: 'Dostępne w kalendarzu OurWed',
  category_disabled: 'Wyłączono dla tej kategorii',
  omitted: 'Pominięto',
}

type EntityCalendarStatusProps = {
  entityType: 'wedding' | 'session'
  entityId: string
  compact?: boolean
}

export function EntityCalendarStatus({
  entityType,
  entityId,
  compact = true,
}: EntityCalendarStatusProps) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: calendarIntegrationQueryKeys.entityStatus(
      userId,
      entityType,
      entityId,
    ),
    queryFn: () =>
      calendarIntegrationsService.getEntityStatus(entityType, entityId),
    enabled: Boolean(userId && entityId),
  })

  if (isLoading || !data) return null

  return (
    <section
      className={compact ? styles.compact : styles.block}
      aria-label="Kalendarze"
    >
      <h3 className={styles.title}>Kalendarze</h3>
      <ul className={styles.list}>
        <li>
          <span className={styles.provider}>Google Calendar</span>
          <span className={styles.state} data-state={data.google.state}>
            {GOOGLE_LABELS[data.google.state] ?? data.google.state}
          </span>
          <span className={styles.actions}>
            {data.google.externalEventUrl ? (
              <a
                className={styles.link}
                href={data.google.externalEventUrl}
                target="_blank"
                rel="noreferrer"
              >
                Otwórz w Google Calendar
              </a>
            ) : null}
            {data.google.state === 'needs_attention' ||
            data.google.state === 'pending' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void calendarIntegrationsService
                    .retryEntitySync(entityType, entityId)
                    .then(() =>
                      queryClient.invalidateQueries({
                        queryKey: calendarIntegrationQueryKeys.entityStatus(
                          userId,
                          entityType,
                          entityId,
                        ),
                      }),
                    )
                }}
              >
                Synchronizuj ponownie
              </Button>
            ) : null}
          </span>
        </li>
        <li>
          <span className={styles.provider}>Apple Calendar</span>
          <span className={styles.state} data-state={data.apple.state}>
            {APPLE_LABELS[data.apple.state] ?? data.apple.state}
          </span>
        </li>
      </ul>
    </section>
  )
}
