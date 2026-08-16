import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import { WeddingList } from '@/features/weddings/components/WeddingList'
import { WeddingsViewSwitch } from '@/features/weddings/components/WeddingsViewSwitch'
import {
  readWeddingsViewMode,
  writeWeddingsViewMode,
  type WeddingsViewMode,
} from '@/features/weddings/presentation/weddingsViewMode'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { SeasonGroupedList } from '@/features/shared/components/SeasonGroupedList'
import { formatWeddingSeasonCount } from '@/features/shared/presentation/groupAssignmentsBySeason'
import styles from './WeddingsPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function WeddingsPage() {
  const { data: weddings, isLoading, isError, error, refetch } = useWeddings()
  const [viewMode, setViewMode] = useState<WeddingsViewMode>(() =>
    readWeddingsViewMode(),
  )

  function handleViewChange(mode: WeddingsViewMode) {
    setViewMode(mode)
    writeWeddingsViewMode(mode)
  }

  return (
    <AppLayout
      title="Śluby"
      subtitle={
        isLoading
          ? 'Ładowanie...'
          : isError
            ? 'Błąd ładowania'
            : `${weddings?.length ?? 0} aktywnych par`
      }
      action={
        <div className={styles.actions}>
          {!isLoading && !isError && weddings && weddings.length > 0 ? (
            <WeddingsViewSwitch value={viewMode} onChange={handleViewChange} />
          ) : null}
          <ProGateNavButton to="/sluby/import" variant="secondary" actionKey="create_wedding">
            Importuj z pliku
          </ProGateNavButton>
          <ProGateNavButton to="/sluby/nowy" variant="primary" actionKey="create_wedding">
            Nowy ślub
          </ProGateNavButton>
        </div>
      }
    >
      <PageContainer width="full">
        {isLoading ? (
          <div className={styles.loading}>Ładowanie ślubów...</div>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować ślubów"
            description={
              getUserFacingErrorMessage(error, 'Spróbuj odświeżyć listę.')
            }
          />
        ) : !weddings || weddings.length === 0 ? (
          <EmptyState
            title="Brak ślubów"
            description="Dodaj pierwsze zlecenie, aby zacząć pracę w CRM."
          />
        ) : (
          <SeasonGroupedList
            items={weddings}
            getDate={(w) => w.date}
            getSearchText={(w) => getWeddingDisplayName(w)}
            formatCount={formatWeddingSeasonCount}
            searchPlaceholder="Szukaj pary…"
            renderItems={(seasonWeddings) =>
              viewMode === 'list' ? (
                <WeddingList weddings={seasonWeddings} />
              ) : (
                <div className={styles.grid} data-testid="weddings-grid">
                  {seasonWeddings.map((wedding) => (
                    <WeddingCard key={wedding.id} wedding={wedding} />
                  ))}
                </div>
              )
            }
          />
        )}
        {isError ? (
          <div style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
