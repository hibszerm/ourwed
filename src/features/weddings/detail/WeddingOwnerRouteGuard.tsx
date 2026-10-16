import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { isUuid } from '@/features/collaboration/collaborativeWeddingTypes'
import { useWeddingDetailAuthority } from './weddingDetailAuthority'

/** Resolves authority before an owner-only Wedding child route can mount. */
export function WeddingOwnerRouteGuard({ children }: { children: ReactNode }) {
  const { weddingId = '' } = useParams<{ weddingId: string }>()
  const authority = useWeddingDetailAuthority(weddingId)

  if (!isUuid(weddingId)) {
    return <AppLayout><PageContainer width="wide">
      <h1>Nie znaleziono</h1><p>Nie można otworzyć tego zlecenia.</p>
      <Link to="/sluby">Wróć do listy</Link>
    </PageContainer></AppLayout>
  }
  if (authority.isPending || authority.isFetching) {
    return <AppLayout><PageContainer width="wide"><p role="status">Sprawdzanie dostępu do zlecenia…</p></PageContainer></AppLayout>
  }
  if (authority.isError) {
    return <AppLayout><PageContainer width="wide"><p role="alert">Nie można otworzyć tego zlecenia.</p>
      <Button type="button" variant="secondary" onClick={() => void authority.refetch()}>Spróbuj ponownie</Button>
    </PageContainer></AppLayout>
  }
  if (authority.data?.kind !== 'owned') {
    return <AppLayout><PageContainer width="wide">
      <h1>Nie znaleziono</h1><p>Nie można otworzyć tego zlecenia.</p>
      <Link to="/sluby">Wróć do listy</Link>
    </PageContainer></AppLayout>
  }
  return children
}
