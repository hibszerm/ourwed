import { useNavigate, useParams } from 'react-router-dom'
import { SessionDetailRoutePage } from '@/pages/SessionDetailRoutePage'
import { SessionEditModal } from '@/features/sessions/components/SessionEditModal'
import { useSession } from '@/features/sessions/hooks/useSession'

/**
 * Deep-link `/sesje/:sessionId/edytuj`:
 * keep session detail context mounted and open the same centered
 * WeddingEditDrawerV2 shell used by wedding editors.
 */
export function EditSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession(sessionId)

  function returnToDetail() {
    navigate(`/sesje/${sessionId}`, { replace: true })
  }

  return (
    <>
      <SessionDetailRoutePage />
      {session ? (
        <SessionEditModal open session={session} onClose={returnToDetail} />
      ) : null}
    </>
  )
}
