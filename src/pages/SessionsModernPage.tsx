import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { useSessions } from '@/features/sessions/hooks/useSessions'
import { ModernSessionsWorkspace } from '@/features/sessions/modern/ModernSessionsWorkspace'
import {
  readSessionsViewMode,
  writeSessionsViewMode,
  type SessionsViewMode,
} from '@/features/sessions/presentation/sessionsViewMode'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './SessionsModernPage.module.css'

export function SessionsModernPage() {
  const { data: sessions, isLoading, isError, error, refetch } = useSessions()
  const [viewMode, setViewMode] = useState<SessionsViewMode>(() =>
    readSessionsViewMode(),
  )
  const [entrance] = useState<'full' | 'soft'>(() =>
    isLoading ? 'soft' : 'full',
  )

  function handleViewChange(mode: SessionsViewMode) {
    setViewMode(mode)
    writeSessionsViewMode(mode)
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.page} data-testid="sessions-modern">
          <header className={styles.header}>
            <h1 className={styles.title}>Sesje</h1>
            <div className={styles.actions}>
              <ProGateNavButton
                className={styles.createAction}
                to="/sesje/nowa"
                variant="primary"
                actionKey="create_session"
              >
                Dodaj sesję
              </ProGateNavButton>
            </div>
          </header>

          {isLoading ? (
            <ModernSessionsSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nie udało się załadować sesji</p>
              <p className={styles.emptyDesc}>
                {getUserFacingErrorMessage(error, 'Spróbuj odświeżyć listę.')}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refetch()}
              >
                Spróbuj ponownie
              </Button>
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Brak sesji</p>
              <p className={styles.emptyDesc}>
                Dodaj pierwszą sesję zdjęciową.
              </p>
              <ProGateNavButton
                to="/sesje/nowa"
                variant="primary"
                actionKey="create_session"
              >
                Dodaj sesję
              </ProGateNavButton>
            </div>
          ) : (
            <ModernSessionsWorkspace
              sessions={sessions}
              viewMode={viewMode}
              onViewChange={handleViewChange}
              entrance={entrance}
            />
          )}
        </div>
      </PageContainer>
    </AppLayout>
  )
}

function ModernSessionsSkeleton({ viewMode }: { viewMode: SessionsViewMode }) {
  if (viewMode === 'list') {
    return (
      <div className={styles.skeletonLedger} aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.skeletonGrid} aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.skeletonCard} />
      ))}
    </div>
  )
}
