import { Card, CardHeader } from '@/components/ui/Card'
import { IconMail, IconPhone } from '@/components/icons'
import type { Couple } from '@/types/wedding'
import styles from './WeddingDetailContact.module.css'

interface WeddingDetailContactProps {
  couple: Couple
}

function displayValue(value?: string): string {
  return value?.trim() ? value : '—'
}

export function WeddingDetailContact({ couple }: WeddingDetailContactProps) {
  const bridePhone = displayValue(couple.partner1Phone ?? couple.phone)
  const brideEmail = displayValue(couple.partner1Email ?? couple.email)
  const groomPhone = displayValue(couple.partner2Phone ?? couple.phone)
  const groomEmail = displayValue(couple.partner2Email ?? couple.email)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Kontakt" />
      <div className={styles.sections}>
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
      </div>
    </Card>
  )
}
