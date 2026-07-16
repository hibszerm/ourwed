import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import styles from './WeddingsPage.module.css'

export function WeddingsPage() {
  const { data: weddings, isLoading, isError, error, refetch } = useWeddings()

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
        <Link to="/sluby/nowy">
          <Button variant="primary">Nowy ślub</Button>
        </Link>
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
        ) : (
          <div className={styles.grid}>
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
