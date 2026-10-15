import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { CustomCapabilityGrant } from './accessManagementTypes'
import { useCreateCollaborationPermissionPreset } from './useCollaborationPermissionPresets'
import styles from './CollaborationPermissionPresetManager.module.css'
import { presetDescriptionError, presetNameError } from './permissionPresetValidation'

export function SaveAccessAsPresetDialog({ open, grants, onClose }: {
  open: boolean
  grants: CustomCapabilityGrant[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreateCollaborationPermissionPreset()
  const error = create.error instanceof Error ? create.error.message : ''
  const nameError = presetNameError(name)
  const descriptionError = presetDescriptionError(description)
  const copy = error === 'CONFLICT' ? 'Istnieje już aktywny zestaw o tej nazwie.'
    : error === 'VALIDATION_ERROR' ? 'Sprawdź nazwę, opis i zakres dostępu.'
      : error ? 'Nie udało się zapisać zestawu. Twoje dane pozostały w formularzu.' : ''
  async function save() {
    if (nameError || descriptionError) return
    await create.mutateAsync({ name, description: description.trim() || null, grants: grants.map((grant) => ({ ...grant })) })
    setName(''); setDescription(''); onClose()
  }
  return <Modal open={open} title="Zapisz jako zestaw" description="Zapisz ten zakres do ponownego użycia. Dostęp do zlecenia pozostanie bez zmian."
    onClose={onClose} showClose initialFocus="panel" size="md" hideFooter>
    <div className={styles.form}>
      <label>Nazwa zestawu<input autoComplete="off" value={name} aria-invalid={Boolean(nameError)}
        aria-describedby={nameError ? 'save-preset-name-error' : undefined} onChange={(event) => setName(event.target.value)} />
        {nameError ? <small id="save-preset-name-error" className={styles.error}>{nameError}</small> : null}</label>
      <label>Opis <span>(opcjonalnie)</span><textarea value={description} aria-invalid={Boolean(descriptionError)}
        aria-describedby={descriptionError ? 'save-preset-description-error' : undefined}
        onChange={(event) => setDescription(event.target.value)} />
        {descriptionError ? <small id="save-preset-description-error" className={styles.error}>{descriptionError}</small> : null}</label>
      <p className={styles.hint}>Nowe uprawnienia nie są dodawane automatycznie.</p>
      {copy ? <p className={styles.error} role="alert">{copy}</p> : null}
      <div className={styles.actions}><button type="button" onClick={onClose}>Anuluj</button>
        <button type="button" disabled={Boolean(nameError || descriptionError) || create.isPending} onClick={() => void save().catch(() => undefined)}>
          {create.isPending ? 'Zapisywanie…' : 'Zapisz zestaw'}
        </button></div>
    </div>
  </Modal>
}
