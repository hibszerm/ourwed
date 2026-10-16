import { useState } from 'react'
import { CoupleContactFields } from '@/features/weddings/detail/editing/fields/CoupleContactFields'
import { getEditorSectionMeta } from '@/features/weddings/detail/editing/weddingEditorTypes'
import { WeddingEditDrawerV2 } from '@/features/weddings/detail/v2/WeddingEditDrawerV2'
import { contactsToCouple, type WeddingContactsAggregate } from '@/features/collaboration/collaborativeContactsService'
import { validateWeddingCorrespondenceEntries } from '@/features/weddings/correspondence/weddingCorrespondence'
import fieldStyles from '@/features/weddings/detail/editing/WeddingEditorFields.module.css'

function validateCanonicalContacts(contacts: WeddingContactsAggregate): string | null {
  const couple = contactsToCouple(contacts)
  if (!contacts.bride.first_name?.trim() && !couple.partner1.trim()) return 'Podaj imię panny młodej.'
  if (!contacts.groom.first_name?.trim() && !couple.partner2.trim()) return 'Podaj imię pana młodego.'
  const result = validateWeddingCorrespondenceEntries(contacts.correspondence)
  return result.ok ? null : result.error
}

export function CanonicalCoupleContactsEditor({
  contacts,
  onChange,
  onSave,
  onCancel,
  busy,
  error,
}: {
  contacts: WeddingContactsAggregate
  onChange: (next: WeddingContactsAggregate) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  error: string | null
}) {
  const meta = getEditorSectionMeta('contacts')
  const couple = contactsToCouple(contacts)
  const [validationError, setValidationError] = useState<string | null>(null)
  function requestSave() {
    const issue = validateCanonicalContacts(contacts)
    if (issue) {
      setValidationError(issue)
      return
    }
    setValidationError(null)
    onSave()
  }
  return (
    <WeddingEditDrawerV2
      open
      title={meta.title}
      description={meta.description}
      busy={busy}
      presentation="centered"
      onClose={onCancel}
      onSave={requestSave}
    >
      <div data-testid="canonical-couple-contacts-editor" data-section="contacts">
        {error || validationError ? <p role="alert" className={fieldStyles.error}>{error ?? validationError}</p> : null}
        <CoupleContactFields
          couple={couple}
          contractAddress={contacts.contract_address ?? ''}
          correspondence={contacts.correspondence}
          onChangeCouple={(next) => {
            setValidationError(null)
            onChange({
              ...contacts,
              bride: {
                first_name: next.partner1FirstName ?? null,
                last_name: next.partner1LastName ?? null,
                phone: next.partner1Phone ?? null,
                email: next.partner1Email ?? null,
              },
              groom: {
                first_name: next.partner2FirstName ?? null,
                last_name: next.partner2LastName ?? null,
                phone: next.partner2Phone ?? null,
                email: next.partner2Email ?? null,
              },
            })
          }}
          onChangeContractAddress={(contract_address) => { setValidationError(null); onChange({ ...contacts, contract_address }) }}
          onChangeCorrespondence={(correspondence) => { setValidationError(null); onChange({ ...contacts, correspondence }) }}
        />
      </div>
    </WeddingEditDrawerV2>
  )
}
