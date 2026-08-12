import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { weddingService } from '@/lib/api/weddingService'
import type { Wedding } from '@/types/wedding'

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
  return (
    <Modal
      open={open}
      title="Edytuj zlecenie"
      description="Zmień nazwę wyświetlaną i datę ślubu. Dane pary i pakiet edytujesz osobno."
      onClose={onClose}
      showClose
      hideFooter
    >
      {open ? (
        <IdentityForm
          key={`${wedding.id}:${wedding.displayName ?? ''}:${wedding.date}`}
          wedding={wedding}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  )
}

function IdentityForm({
  wedding,
  onClose,
  onSaved,
}: {
  wedding: Wedding
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}) {
  const { requirePro } = useProAccessGate()
  const [displayName, setDisplayName] = useState(
    wedding.displayName?.trim() ?? '',
  )
  const [date, setDate] = useState(wedding.date?.trim() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const derivedPreview = getWeddingDisplayName({
    couple: wedding.couple,
    displayName: null,
  })

  async function handleSave() {
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
        e instanceof Error ? e.message : 'Nie udało się zapisać zmian.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      data-testid="wedding-identity-dialog"
    >
      <Input
        label="Nazwa wyświetlana"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={derivedPreview}
        data-testid="wedding-identity-display-name"
      />
      <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.75 }}>
        Nazwa wyświetlana jest opcjonalna. Gdy pozostawisz ją pustą, OurWed
        użyje imion i nazwisk pary.
      </p>
      <Input
        label="Data ślubu"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        data-testid="wedding-identity-date"
      />
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--status-error-text)' }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onClose}
        >
          Anuluj
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          data-testid="wedding-identity-save"
          onClick={() => void handleSave()}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      </div>
    </div>
  )
}
