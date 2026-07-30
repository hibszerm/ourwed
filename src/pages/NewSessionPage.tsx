import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { IconArrowLeft } from '@/components/icons'
import { useToast } from '@/components/ui/Toast'
import { SessionForm } from '@/features/sessions/components/SessionForm'
import { useCreateSession } from '@/features/sessions/hooks/useCreateSession'

function isDateKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const createSession = useCreateSession()
  const { showToast } = useToast()
  const dateParam = searchParams.get('date')
  const defaultDate = isDateKey(dateParam) ? dateParam : undefined

  return (
    <AppLayout
      title="Nowa sesja"
      subtitle="Szybkie dodanie sesji zdjęciowej"
      action={
        <Link to="/sesje">
          <Button variant="ghost" size="sm">
            <IconArrowLeft width={16} height={16} />
            Wróć
          </Button>
        </Link>
      }
    >
      <PageContainer width="narrow">
        <SessionForm
          mode="create"
          defaultDate={defaultDate}
          submitLabel="Utwórz sesję"
          cancelTo="/sesje"
          pending={createSession.isPending}
          onSubmit={async (input) => {
            try {
              const session = await createSession.mutateAsync(input)
              showToast('Sesja została utworzona', 'success')
              navigate(`/sesje/${session.id}`)
            } catch (err) {
              showToast(
                err instanceof Error
                  ? err.message
                  : 'Nie udało się utworzyć sesji',
                'error',
              )
            }
          }}
        />
      </PageContainer>
    </AppLayout>
  )
}
