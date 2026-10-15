import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { useUnifiedWeddingsWorkspace } from '@/features/weddings/modern/useUnifiedWeddingsWorkspace'
import {
  parseWorkspaceScope,
  WORKSPACE_SCOPE_QUERY_PARAM,
} from '@/features/weddings/modern/workspaceWeddings'
import { ModernWeddingsWorkspace } from '@/features/weddings/modern/ModernWeddingsWorkspace'
import {
  readWeddingsViewMode,
  writeWeddingsViewMode,
  type WeddingsViewMode,
} from '@/features/weddings/presentation/weddingsViewMode'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './WeddingsModernPage.module.css'

export function WeddingsModernPage() {
  const { data: weddings, isLoading, isError, error, refetch } = useUnifiedWeddingsWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const scope = parseWorkspaceScope(searchParams.get(WORKSPACE_SCOPE_QUERY_PARAM))
  const [viewMode, setViewMode] = useState<WeddingsViewMode>(() =>
    readWeddingsViewMode(),
  )
  const [entrance] = useState<'full' | 'soft'>(() =>
    isLoading ? 'soft' : 'full',
  )

  function handleViewChange(mode: WeddingsViewMode) {
    setViewMode(mode)
    writeWeddingsViewMode(mode)
  }

  function handleScopeChange(nextScope: typeof scope) {
    const next = new URLSearchParams(searchParams)
    if (nextScope === 'all') next.delete(WORKSPACE_SCOPE_QUERY_PARAM)
    else next.set(WORKSPACE_SCOPE_QUERY_PARAM, nextScope)
    setSearchParams(next, { preventScrollReset: true })
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.page} data-testid="weddings-modern">
          <header className={styles.header}>
            <h1 className={styles.title}>Śluby</h1>
            <div className={styles.actions}>
              <ProGateNavButton
                className={styles.importAction}
                to="/sluby/import"
                variant="secondary"
                actionKey="create_wedding"
              >
                Importuj z pliku
              </ProGateNavButton>
              <ProGateNavButton
                className={styles.createAction}
                to="/sluby/nowy"
                variant="primary"
                actionKey="create_wedding"
              >
                Nowy ślub
              </ProGateNavButton>
            </div>
          </header>

          {isLoading ? (
            <ModernWeddingsSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nie udało się załadować ślubów</p>
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
          ) : (!weddings || weddings.length === 0) && scope === 'all' ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Brak ślubów</p>
              <p className={styles.emptyDesc}>
                Dodaj pierwsze zlecenie, aby zacząć pracę w CRM.
              </p>
              <ProGateNavButton
                to="/sluby/nowy"
                variant="primary"
                actionKey="create_wedding"
              >
                Nowy ślub
              </ProGateNavButton>
            </div>
          ) : (
            <ModernWeddingsWorkspace
              weddings={weddings ?? []}
              scope={scope}
              onScopeChange={handleScopeChange}
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

function ModernWeddingsSkeleton({ viewMode }: { viewMode: WeddingsViewMode }) {
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
