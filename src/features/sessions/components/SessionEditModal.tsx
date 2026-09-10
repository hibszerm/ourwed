import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { SessionForm } from '@/features/sessions/components/SessionForm'
import { useUpdateSession } from '@/features/sessions/hooks/useUpdateSession'
import { WeddingEditDrawerV2 } from '@/features/weddings/detail/v2/WeddingEditDrawerV2'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { Session } from '@/types/session'

const FORM_ID = 'session-edit-form'

/**
 * Existing-session edit — same centered shell as wedding editors
 * (WeddingEditDrawerV2 presentation="centered").
 */
export function SessionEditModal({
  open,
  session,
  onClose,
}: {
  open: boolean
  session: Session
  onClose: () => void
}) {
  const updateSession = useUpdateSession()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const [dirty, setDirty] = useState(false)

  function requestClose() {
    if (updateSession.isPending) return
    if (
      dirty &&
      !window.confirm('Masz niezapisane zmiany. Odrzucić je i zamknąć?')
    ) {
      return
    }
    onClose()
  }

  if (!open) return null

  return (
    <WeddingEditDrawerV2
      open={open}
      presentation="centered"
      title="Edytuj sesję"
      description="Zmień dane istniejącej sesji. Kalendarz i powiązania zapiszą się po zatwierdzeniu."
      busy={updateSession.isPending}
      onClose={requestClose}
      onSave={() => {
        const form = document.getElementById(FORM_ID) as HTMLFormElement | null
        form?.requestSubmit()
      }}
      saveLabel="Zapisz zmiany"
    >
      <div data-testid="session-edit-modal">
        <SessionForm
          key={session.id}
          mode="edit"
          initial={session}
          formId={FORM_ID}
          hideActions
          presentation="modal"
          submitLabel="Zapisz zmiany"
          cancelTo={`/sesje/${session.id}`}
          pending={updateSession.isPending}
          onDirtyChange={setDirty}
          onSubmit={async (input) => {
            const allowed = requirePro()
            if (!allowed) return
            try {
              await updateSession.mutateAsync({ id: session.id, input })
              showToast('Zapisano zmiany', 'success')
              setDirty(false)
              onClose()
            } catch (err) {
              showToast(
                getUserFacingErrorMessage(err, 'Nie udało się zapisać sesji'),
                'error',
              )
            }
          }}
        />
      </div>
    </WeddingEditDrawerV2>
  )
}
