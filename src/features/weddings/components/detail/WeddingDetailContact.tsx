import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { IconMail, IconPhone } from '@/components/icons'
import type { Couple, WeddingContact } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailContact.module.css'

interface WeddingDetailContactProps {
  couple: Couple
  editing?: boolean
  contacts?: WeddingContact[]
  onChangeCouple?: (couple: Couple) => void
  onChangeContacts?: (contacts: WeddingContact[]) => void
  weddingId?: string
}

function displayValue(value?: string): string {
  return value?.trim() ? value : '—'
}

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
      <h4 className={styles.sectionTitle}>{title}</h4>
      <div className={editStyles.fieldGrid}>
        <div className={editStyles.fieldRow}>
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
        <div className={editStyles.fieldRow}>
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
        <div className={editStyles.fieldRow}>
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

export function WeddingDetailContact({
  couple,
  editing = false,
  contacts = [],
  onChangeCouple,
  onChangeContacts,
  weddingId = '',
}: WeddingDetailContactProps) {
  const bridePhone = displayValue(couple.partner1Phone ?? couple.phone)
  const brideEmail = displayValue(couple.partner1Email ?? couple.email)
  const groomPhone = displayValue(couple.partner2Phone)
  const groomEmail = displayValue(couple.partner2Email)

  function updateContact(id: string, patch: Partial<WeddingContact>) {
    onChangeContacts?.(
      contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }

  function removeContact(id: string) {
    onChangeContacts?.(contacts.filter((c) => c.id !== id))
  }

  function addContact() {
    onChangeContacts?.([
      ...contacts,
      {
        id: `temp-${crypto.randomUUID()}`,
        weddingId,
        name: '',
        role: '',
        phone: '',
        email: '',
        createdAt: new Date().toISOString(),
      },
    ])
  }

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Kontakt" />
      <div className={styles.sections}>
        {editing && onChangeCouple ? (
          <>
            <PartnerFields
              title="Panna młoda"
              prefix="partner1"
              couple={couple}
              onChange={onChangeCouple}
            />
            <PartnerFields
              title="Pan młody"
              prefix="partner2"
              couple={couple}
              onChange={onChangeCouple}
            />
          </>
        ) : (
          <>
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Panna młoda</h4>
              <p className={styles.name}>{displayValue(couple.partner1)}</p>
              <div className={styles.contact}>
                <div className={styles.row}>
                  <IconPhone width={14} height={14} className={styles.icon} />
                  <span className={styles.value}>{bridePhone}</span>
                </div>
                <div className={styles.row}>
                  <IconMail width={14} height={14} className={styles.icon} />
                  <span className={styles.value}>{brideEmail}</span>
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Pan młody</h4>
              <p className={styles.name}>{displayValue(couple.partner2)}</p>
              <div className={styles.contact}>
                <div className={styles.row}>
                  <IconPhone width={14} height={14} className={styles.icon} />
                  <span className={styles.value}>{groomPhone}</span>
                </div>
                <div className={styles.row}>
                  <IconMail width={14} height={14} className={styles.icon} />
                  <span className={styles.value}>{groomEmail}</span>
                </div>
              </div>
            </section>
          </>
        )}

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Kontakty dodatkowe</h4>
          {contacts.length === 0 ? (
            <p className={editStyles.muted}>Brak dodatkowych kontaktów.</p>
          ) : (
            <ul className={editStyles.inlineList}>
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className={editing ? editStyles.inlineItem : undefined}
                >
                  {editing ? (
                    <>
                      <div className={editStyles.fieldRow}>
                        <Input
                          label="Imię i nazwisko"
                          value={contact.name}
                          onChange={(e) =>
                            updateContact(contact.id, { name: e.target.value })
                          }
                        />
                        <Input
                          label="Rola"
                          value={contact.role ?? ''}
                          onChange={(e) =>
                            updateContact(contact.id, { role: e.target.value })
                          }
                        />
                      </div>
                      <div className={editStyles.fieldRow}>
                        <Input
                          label="Telefon"
                          value={contact.phone ?? ''}
                          onChange={(e) =>
                            updateContact(contact.id, { phone: e.target.value })
                          }
                        />
                        <Input
                          label="E-mail"
                          value={contact.email ?? ''}
                          onChange={(e) =>
                            updateContact(contact.id, { email: e.target.value })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContact(contact.id)}
                      >
                        Usuń
                      </Button>
                    </>
                  ) : (
                    <div>
                      <p className={styles.name}>
                        {contact.name}
                        {contact.role ? ` — ${contact.role}` : ''}
                      </p>
                      <div className={styles.contact}>
                        <div className={styles.row}>
                          <IconPhone width={14} height={14} className={styles.icon} />
                          <span className={styles.value}>
                            {displayValue(contact.phone)}
                          </span>
                        </div>
                        <div className={styles.row}>
                          <IconMail width={14} height={14} className={styles.icon} />
                          <span className={styles.value}>
                            {displayValue(contact.email)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editing ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addContact}
              style={{ marginTop: '0.75rem' }}
            >
              Dodaj kontakt
            </Button>
          ) : null}
        </section>
      </div>
    </Card>
  )
}
