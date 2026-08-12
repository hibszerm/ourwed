import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { useSessions } from '@/features/sessions/hooks/useSessions'
import { SessionCard } from '@/features/sessions/components/SessionCard'
import { SessionList } from '@/features/sessions/components/SessionList'
import { SessionsViewSwitch } from '@/features/sessions/components/SessionsViewSwitch'
import {
  readSessionsViewMode,
  writeSessionsViewMode,
  type SessionsViewMode,
} from '@/features/sessions/presentation/sessionsViewMode'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { SeasonGroupedList } from '@/features/shared/components/SeasonGroupedList'
import { formatSessionSeasonCount } from '@/features/shared/presentation/groupAssignmentsBySeason'
import styles from '@/pages/WeddingsPage.module.css'

export function SessionsPage() {
  const { data: sessions, isLoading, isError, error, refetch } = useSessions()
  const [viewMode, setViewMode] = useState<SessionsViewMode>(() =>
    readSessionsViewMode(),
  )

  function handleViewChange(mode: SessionsViewMode) {
    setViewMode(mode)
    writeSessionsViewMode(mode)
  }

  return (
    <AppLayout
      title="Sesje"
      subtitle={
        isLoading
          ? 'Ładowanie...'
          : isError
            ? 'Błąd ładowania'
            : `${sessions?.length ?? 0} sesji`
      }
      action={
        <div className={styles.actions}>
          {!isLoading && !isError && sessions && sessions.length > 0 ? (
            <SessionsViewSwitch value={viewMode} onChange={handleViewChange} />
          ) : null}
          <ProGateNavButton to="/sesje/nowa" variant="primary" actionKey="create_session">
            Dodaj sesję
          </ProGateNavButton>
        </div>
      }
    >
      <PageContainer width="full">
        {isLoading ? (
          <div className={styles.loading}>Ładowanie sesji...</div>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować sesji"
            description={
              error instanceof Error
                ? error.message
                : 'Spróbuj odświeżyć listę.'
            }
          />
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            title="Brak sesji"
            description="Dodaj pierwszą sesję zdjęciową — szybko, bez workflow ślubnego."
          />
        ) : (
          <SeasonGroupedList
            items={sessions}
            getDate={(s) => s.date}
            getSearchText={(s) => getSessionDisplayName(s)}
            formatCount={formatSessionSeasonCount}
            searchPlaceholder="Szukaj sesji…"
            renderItems={(seasonSessions) =>
              viewMode === 'list' ? (
                <SessionList sessions={seasonSessions} />
              ) : (
                <div className={styles.grid} data-testid="sessions-grid">
                  {seasonSessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </div>
              )
            }
          />
        )}
        {isError ? (
          <div style={{ marginTop: 16 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refetch()}
            >
              Spróbuj ponownie
            </Button>
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
