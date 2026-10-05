import { Input } from '@/components/ui/Input'
import { CorrespondenceFields } from '@/features/weddings/detail/editing/fields/CorrespondenceFields'
import type { WeddingCorrespondenceEntry } from '@/features/weddings/correspondence/weddingCorrespondence'
import type { Couple } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

function PartnerFields({
  title,
  prefix,
  couple,
  onChange,
}: {
  title: string
  prefix: 'partner1' | 'partner2'
  couple: Couple
  onChange: (couple: Couple) => void
}) {
  const firstKey = `${prefix}FirstName` as const
  const lastKey = `${prefix}LastName` as const
  const phoneKey = `${prefix}Phone` as const
  const emailKey = `${prefix}Email` as const

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.fieldGrid}>
        <div className={styles.fieldRow}>
          <Input
            label="Imię"
            value={couple[firstKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [firstKey]: e.target.value })}
          />
          <Input
            label="Nazwisko"
            value={couple[lastKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [lastKey]: e.target.value })}
          />
        </div>
        <div className={styles.fieldRow}>
          <Input
            label="Telefon"
            value={couple[phoneKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [phoneKey]: e.target.value })}
          />
          <Input
            label="E-mail"
            type="email"
            value={couple[emailKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [emailKey]: e.target.value })}
          />
        </div>
      </div>
    </section>
  )
}

/** Shared couple/contact + correspondence fields — no V1 layout wrappers. */
export function CoupleContactFields({
  couple,
  contractAddress,
  correspondence,
  onChangeCouple,
  onChangeContractAddress,
  onChangeCorrespondence,
  correspondenceError,
  correspondenceErrorRowIndex,
}: {
  couple: Couple
  contractAddress: string
  correspondence?: WeddingCorrespondenceEntry[] | null
  onChangeCouple: (couple: Couple) => void
  onChangeContractAddress: (address: string) => void
  onChangeCorrespondence?: (next: WeddingCorrespondenceEntry[]) => void
  correspondenceError?: string | null
  correspondenceErrorRowIndex?: number | null
}) {
  return (
    <div className={styles.fieldGrid}>
      <PartnerFields
        title="Panna Młoda"
        prefix="partner1"
        couple={couple}
        onChange={onChangeCouple}
      />
      <PartnerFields
        title="Pan Młody"
        prefix="partner2"
        couple={couple}
        onChange={onChangeCouple}
      />
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Dane do umowy</h3>
        <Input
          label="Adres do umowy"
          value={contractAddress}
          onChange={(event) => onChangeContractAddress(event.target.value)}
        />
      </section>
      {onChangeCorrespondence ? (
        <CorrespondenceFields
          correspondence={correspondence}
          onChange={onChangeCorrespondence}
          error={correspondenceError}
          errorRowIndex={correspondenceErrorRowIndex}
        />
      ) : null}
    </div>
  )
}
