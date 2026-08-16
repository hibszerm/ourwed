import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { weddingService } from '@/lib/api/weddingService'
import formStyles from '@/features/weddings/actions/actionForm.module.css'
import type { Wedding } from '@/types/wedding'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface Props {
  open: boolean
  wedding: Wedding
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}

/**
 * Edit presentation title + wedding date only.
 * Empty display name restores the derived couple title.
 */
export function WeddingIdentityEditDialog({
  open,
  wedding,
  onClose,
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      title="Edytuj zlecenie"
      description="Zmień nazwę wyświetlaną i datę ślubu. Dane pary i pakiet edytujesz osobno."
      onClose={onClose}
      showClose
      busy={busy}
      primaryAction={
        <Button
          type="submit"
          form="wedding-identity-form"
          variant="primary"
          disabled={busy}
          data-testid="wedding-identity-save"
        >
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      {open ? (
        <IdentityForm
          key={`${wedding.id}:${wedding.displayName ?? ''}:${wedding.date}`}
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

function IdentityForm({
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
  const { requirePro } = useProAccessGate()
  const [displayName, setDisplayName] = useState(
    wedding.displayName?.trim() ?? '',
  )
  const [date, setDate] = useState(wedding.date?.trim() ?? '')
  const [error, setError] = useState<string | null>(null)

  const derivedPreview = getWeddingDisplayName({
    couple: wedding.couple,
    displayName: null,
  })

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!requirePro()) return
    const nextDate = date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setError('Podaj prawidłową datę ślubu.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await weddingService.update({
        ...wedding,
        displayName: displayName.trim() || null,
        date: nextDate,
      })
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(
        getUserFacingErrorMessage(e, 'Nie udało się zapisać zmian.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="wedding-identity-form"
      className={`${formStyles.form} ${formStyles.compactMobileForm}`}
      onSubmit={(e) => void handleSave(e)}
      data-testid="wedding-identity-dialog"
    >
      <Input
        label="Nazwa wyświetlana"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={derivedPreview}
        disabled={busy}
        data-testid="wedding-identity-display-name"
      />
      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
        }}
      >
        Nazwa wyświetlana jest opcjonalna. Gdy pozostawisz ją pustą, OurWed
        użyje imion i nazwisk pary.
      </p>
      <Input
        label="Data ślubu"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={busy}
        data-testid="wedding-identity-date"
      />
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--status-error-text)' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}
