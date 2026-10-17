import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { weddingService } from '@/lib/api/weddingService'
import { withReconciledDeliveryDeadline } from '@/lib/utils/weddingDeliveryDeadline'
import formStyles from '@/features/weddings/actions/actionForm.module.css'
import type { Wedding } from '@/types/wedding'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface Props {
  open: boolean
  wedding: Wedding
  onClose: () => void
  onSaved?: (wedding: Wedding) => void
  mode?: 'owner' | 'shared'
  ownerCanonicalDisplayName?: string
  hasPersonalDisplayNameOverride?: boolean
  onSharedSave?: (displayName: string) => Promise<string>
  onSharedRestore?: () => Promise<string>
  onOwnerSave?: (wedding: Wedding) => Promise<Wedding>
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
  mode = 'owner',
  ownerCanonicalDisplayName,
  hasPersonalDisplayNameOverride = false,
  onSharedSave,
  onSharedRestore,
  onOwnerSave,
}: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      title="Edytuj zlecenie"
      description={mode === 'shared'
        ? 'Zmień nazwę wyświetlaną. Datę ślubu i dane pary zmienia właściciel.'
        : 'Zmień nazwę wyświetlaną i datę ślubu. Dane pary i pakiet edytujesz osobno.'}
      onClose={onClose}
      showClose
      busy={busy}
      size="md"
      mobilePresentation="center"
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
          mode={mode}
          ownerCanonicalDisplayName={ownerCanonicalDisplayName}
          hasPersonalDisplayNameOverride={hasPersonalDisplayNameOverride}
          onSharedSave={onSharedSave}
          onSharedRestore={onSharedRestore}
          onOwnerSave={onOwnerSave}
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
  mode,
  ownerCanonicalDisplayName,
  hasPersonalDisplayNameOverride,
  onSharedSave,
  onSharedRestore,
  onOwnerSave,
}: {
  wedding: Wedding
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
  onSaved?: (wedding: Wedding) => void
  mode: 'owner' | 'shared'
  ownerCanonicalDisplayName?: string
  hasPersonalDisplayNameOverride: boolean
  onSharedSave?: (displayName: string) => Promise<string>
  onSharedRestore?: () => Promise<string>
  onOwnerSave?: (wedding: Wedding) => Promise<Wedding>
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
    if (mode === 'owner' && !requirePro()) return
    const nextDate = date.trim()
    if (mode === 'owner' && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setError('Podaj prawidłową datę ślubu.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'shared') {
        if (!onSharedSave) throw new Error('Nie udało się zapisać zmian.')
        const requestedName = displayName.trim() || derivedPreview
        const effectiveName = await onSharedSave(requestedName)
        onSaved?.({ ...wedding, displayName: effectiveName })
        onClose()
        return
      }
      const update = withReconciledDeliveryDeadline(wedding, {
          ...wedding,
          displayName: displayName.trim() || null,
          date: nextDate,
        })
      const updated = onOwnerSave
        ? await onOwnerSave(update)
        : await weddingService.update(update)
      onSaved?.(updated)
      onClose()
    } catch (e) {
      setError(
        getUserFacingErrorMessage(e, 'Nie udało się zapisać zmian.'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreOwnerName() {
    if (!onSharedRestore) return
    setBusy(true)
    setError(null)
    try {
      const effectiveName = await onSharedRestore()
      onSaved?.({ ...wedding, displayName: effectiveName })
      onClose()
    } catch (e) {
      setError(getUserFacingErrorMessage(e, 'Nie udało się przywrócić nazwy właściciela.'))
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
        {mode === 'shared'
          ? 'Ta nazwa będzie widoczna tylko dla Ciebie.'
          : 'Nazwa wyświetlana jest opcjonalna. Gdy pozostawisz ją pustą, OurWed użyje imion i nazwisk pary.'}
      </p>
      <Input
        label="Data ślubu"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={busy}
        readOnly={mode === 'shared'}
        aria-readonly={mode === 'shared'}
        data-testid="wedding-identity-date"
      />
      {mode === 'shared' && hasPersonalDisplayNameOverride ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void handleRestoreOwnerName()}
            data-testid="wedding-identity-restore-owner-name"
            aria-label={ownerCanonicalDisplayName
              ? `Przywróć nazwę właściciela: ${ownerCanonicalDisplayName}`
              : undefined}
          >
            Przywróć nazwę właściciela
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--status-error-text)' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}
