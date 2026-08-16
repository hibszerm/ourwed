import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconArrowLeft } from '@/components/icons'
import { useToast } from '@/components/ui/Toast'
import { SessionForm } from '@/features/sessions/components/SessionForm'
import { useSession } from '@/features/sessions/hooks/useSession'
import { useUpdateSession } from '@/features/sessions/hooks/useUpdateSession'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function EditSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: session, isLoading, isError, error } = useSession(sessionId)
  const updateSession = useUpdateSession()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()

  if (isLoading) {
    return (
      <AppLayout title="Edytuj sesję" subtitle="Ładowanie...">
        <PageContainer width="narrow">
          <p>Ładowanie sesji…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !session) {
    return (
      <AppLayout title="Edytuj sesję">
        <PageContainer width="narrow">
          <EmptyState
            title="Nie znaleziono sesji"
            description={
              getUserFacingErrorMessage(error, 'Sesja nie istnieje.')
            }
          />
          <Link to="/sesje">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="Edytuj sesję"
      subtitle={getSessionDisplayName(session)}
      action={
        <Link to={`/sesje/${session.id}`}>
          <Button variant="ghost" size="sm">
            <IconArrowLeft width={16} height={16} />
            Anuluj
          </Button>
        </Link>
      }
    >
      <PageContainer width="narrow">
        <SessionForm
          mode="edit"
          initial={session}
          submitLabel="Zapisz zmiany"
          cancelTo={`/sesje/${session.id}`}
          pending={updateSession.isPending}
          onSubmit={async (input) => {
            const allowed = requirePro()
            if (!allowed) return
            try {
              await updateSession.mutateAsync({ id: session.id, input })
              showToast('Zapisano zmiany', 'success')
              navigate(`/sesje/${session.id}`)
            } catch (err) {
              showToast(
                getUserFacingErrorMessage(err, 'Nie udało się zapisać sesji'),
                'error',
              )
            }
          }}
        />
      </PageContainer>
    </AppLayout>
  )
}
