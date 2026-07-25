import { Input } from '@/components/ui/Input'
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
  const addressKey = `${prefix}Address` as const
  const postalKey = `${prefix}PostalCode` as const
  const cityKey = `${prefix}City` as const

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
        <Input
          label="Adres"
          value={couple[addressKey] ?? ''}
          onChange={(e) => onChange({ ...couple, [addressKey]: e.target.value })}
        />
        <div className={styles.fieldRow}>
          <Input
            label="Kod pocztowy"
            value={couple[postalKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [postalKey]: e.target.value })}
          />
          <Input
            label="Miasto"
            value={couple[cityKey] ?? ''}
            onChange={(e) => onChange({ ...couple, [cityKey]: e.target.value })}
          />
        </div>
      </div>
    </section>
  )
}

/** Shared couple/contact fields — no V1 layout wrappers. */
export function CoupleContactFields({
  couple,
  onChange,
}: {
  couple: Couple
  onChange: (couple: Couple) => void
}) {
  return (
    <div className={styles.fieldGrid}>
      <PartnerFields
        title="Panna Młoda"
        prefix="partner1"
        couple={couple}
        onChange={onChange}
      />
      <PartnerFields
        title="Pan Młody"
        prefix="partner2"
        couple={couple}
        onChange={onChange}
      />
    </div>
  )
}
