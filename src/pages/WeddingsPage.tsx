import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import { WeddingList } from '@/features/weddings/components/WeddingList'
import { WeddingsViewSwitch } from '@/features/weddings/components/WeddingsViewSwitch'
import {
  readWeddingsViewMode,
  writeWeddingsViewMode,
  type WeddingsViewMode,
} from '@/features/weddings/presentation/weddingsViewMode'
import styles from './WeddingsPage.module.css'

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
          <Link to="/sluby/import">
            <Button variant="secondary">Importuj z pliku</Button>
          </Link>
          <Link to="/sluby/nowy">
            <Button variant="primary">Nowy ślub</Button>
          </Link>
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
              error instanceof Error
                ? error.message
                : 'Spróbuj odświeżyć listę.'
            }
          />
        ) : !weddings || weddings.length === 0 ? (
          <EmptyState
            title="Brak ślubów"
            description="Dodaj pierwsze zlecenie, aby zacząć pracę w CRM."
          />
        ) : viewMode === 'list' ? (
          <WeddingList weddings={weddings} />
        ) : (
          <div className={styles.grid} data-testid="weddings-grid">
            {weddings.map((wedding) => (
              <WeddingCard key={wedding.id} wedding={wedding} />
            ))}
          </div>
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
