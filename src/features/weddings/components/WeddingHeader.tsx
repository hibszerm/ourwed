import { Avatar } from '@/components/ui/Avatar'
import { WorkflowBadge } from '@/components/ui/Badge'
import { Countdown } from '@/components/ui/Countdown'
import { IconCalendar, IconMail, IconMapPin, IconPhone } from '@/components/icons'
import { coupleName, formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingHeader.module.css'

interface WeddingHeaderProps {
  wedding: Wedding
}

export function WeddingHeader({ wedding }: WeddingHeaderProps) {
  const name = coupleName(wedding.couple.partner1, wedding.couple.partner2)

  return (
    <div className={styles.header}>
      <div className={styles.banner} style={{ background: wedding.accentColor }} />
      <div className={styles.content}>
        <div className={styles.top}>
          <Avatar name={name} color={wedding.accentColor} size="lg" />
          <div className={styles.info}>
            <h1 className={styles.name}>{name}</h1>
            <p className={styles.package}>{wedding.packageName}</p>
            <WorkflowBadge stage={wedding.workflowStage} />
          </div>
          <div className={styles.countdown}>
            <p className={styles.countdownLabel}>Do ślubu</p>
            <Countdown targetDate={wedding.date} />
          </div>
        </div>

        <div className={styles.meta}>
          {wedding.ceremonyLocation && (
            <div className={styles.metaItem}>
              <IconMapPin />
              <div>
                <span className={styles.metaLabel}>Ceremonia</span>
                <span>{wedding.ceremonyLocation}</span>
              </div>
            </div>
          )}
          {wedding.receptionLocation && (
            <div className={styles.metaItem}>
              <IconMapPin />
              <div>
                <span className={styles.metaLabel}>Przyjęcie</span>
                <span>{wedding.receptionLocation}</span>
              </div>
            </div>
          )}
          {wedding.couple.email && (
            <div className={styles.metaItem}>
              <IconMail />
              <div>
                <span className={styles.metaLabel}>E-mail</span>
                <span>{wedding.couple.email}</span>
              </div>
            </div>
          )}
          {wedding.couple.phone && (
            <div className={styles.metaItem}>
              <IconPhone />
              <div>
                <span className={styles.metaLabel}>Telefon</span>
                <span>{wedding.couple.phone}</span>
              </div>
            </div>
          )}
          <div className={styles.metaItem}>
            <IconCalendar />
            <div>
              <span className={styles.metaLabel}>Data ślubu</span>
              <span>{formatDate(wedding.date)}</span>
            </div>
          </div>
          <div className={styles.metaItem}>
            <IconCalendar />
            <div>
              <span className={styles.metaLabel}>Cena pakietu</span>
              <span>{formatCurrency(wedding.price)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
