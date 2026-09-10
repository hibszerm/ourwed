import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { weddingService } from '@/lib/api/weddingService'
import { formatDeliveryTerm } from '@/lib/utils/commercial'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import {
  applyManualDeliveryDueDate,
  markDeliveryCompleted,
  restorePackageDeliveryDueDate,
  undoDeliveryCompleted,
} from '@/lib/utils/weddingDeliveryDeadline'
import type { Wedding } from '@/types/wedding'
import formStyles from '@/features/weddings/actions/actionForm.module.css'

interface Props {
  open: boolean
  wedding: Wedding
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}

/**
 * Compact wedding delivery deadline actions.
 * Changes the concrete due date / completion only — never months/days.
 */
export function DeliveryDeadlineModal({
  open,
  wedding,
  onClose,
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      title="Termin oddania"
      description="Zmień konkretną datę oddania. Warunek pakietu (miesiące lub dni) pozostaje bez zmian."
      onClose={onClose}
      showClose
      busy={busy}
      size="md"
      mobilePresentation="center"
      initialFocus="panel"
      primaryAction={
        <Button
          type="submit"
          form="delivery-deadline-form"
          variant="primary"
          disabled={busy}
          data-testid="delivery-deadline-save"
        >
          {busy ? 'Zapisywanie…' : 'Zapisz termin'}
        </Button>
      }
    >
      {open ? (
        <DeadlineForm
          key={`${wedding.id}:${wedding.deliveryDueDate ?? ''}:${wedding.deliveryCompletedAt ?? ''}`}
          wedding={wedding}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  )
}

function DeadlineForm({
  wedding,
  busy,
  setBusy,
  onClose,
  onSaved,
}: {
  wedding: Wedding
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}) {
  const [dueDate, setDueDate] = useState(wedding.deliveryDueDate?.trim() ?? '')
  const [error, setError] = useState<string | null>(null)
  const completed = Boolean(wedding.deliveryCompletedAt?.trim())
  const packageRule = formatDeliveryTerm(
    wedding.deliveryMonths,
    wedding.deliveryDays,
  )
  const canRestore = wedding.deliveryDueSource === 'manual'

  async function persist(next: Wedding) {
    setBusy(true)
    setError(null)
    try {
      const updated = await weddingService.update(next)
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(getUserFacingErrorMessage(e, 'Nie udało się zapisać zmian.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const nextDue = dueDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) {
      setError('Podaj prawidłową datę oddania.')
      return
    }
    const current = wedding.deliveryDueDate?.trim() || null
    const fields =
      nextDue === current
        ? {
            deliveryDueDate: wedding.deliveryDueDate ?? null,
            deliveryDueSource: wedding.deliveryDueSource ?? null,
            deliveryCompletedAt: wedding.deliveryCompletedAt ?? null,
          }
        : applyManualDeliveryDueDate(nextDue, wedding.deliveryCompletedAt)
    await persist({ ...wedding, ...fields })
  }

  return (
    <form
      id="delivery-deadline-form"
      className={`${formStyles.form} ${formStyles.compactMobileForm}`}
      onSubmit={(e) => void handleSave(e)}
      data-testid="delivery-deadline-modal"
    >
      <Input
        label="Termin oddania"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={busy}
        data-testid="delivery-due-date-input"
      />
      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
        }}
      >
        {packageRule
          ? `Warunek z pakietu: ${packageRule}.`
          : 'Brak warunku oddania w pakiecie.'}
      </p>
      {canRestore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            void persist({
              ...wedding,
              ...restorePackageDeliveryDueDate(wedding),
            })
          }
          data-testid="delivery-restore-package"
        >
          Przywróć termin z pakietu
        </Button>
      ) : null}
      {completed ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void persist({
              ...wedding,
              ...undoDeliveryCompleted(wedding),
            })
          }
          data-testid="delivery-undo-completed"
        >
          Cofnij oznaczenie
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void persist({
              ...wedding,
              ...markDeliveryCompleted(wedding),
            })
          }
          data-testid="delivery-mark-completed"
        >
          Oznacz jako oddane
        </Button>
      )}
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--status-error-text)' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}
