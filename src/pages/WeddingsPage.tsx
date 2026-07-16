import { Link } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import styles from './WeddingsPage.module.css'

export function WeddingsPage() {
  const { data: weddings, isLoading } = useWeddings()

  return (
    <AppLayout
      title="Śluby"
      subtitle={isLoading ? 'Ładowanie...' : `${weddings?.length ?? 0} aktywnych par`}
      action={
        <Link to="/sluby/nowy">
          <Button variant="primary">Nowy ślub</Button>
        </Link>
      }
    >
      <PageContainer width="full">
        {isLoading ? (
          <div className={styles.loading}>Ładowanie ślubów...</div>
        ) : (
          <div className={styles.grid}>
            {weddings?.map((wedding) => (
              <WeddingCard key={wedding.id} wedding={wedding} />
            ))}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  )
}
