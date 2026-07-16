import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { WorkflowBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { IconChevronRight, IconMapPin } from '@/components/icons'
import { coupleName, formatDate, getDaysUntil } from '@/lib/utils/dates'
import { getWorkflowProgress } from '@/lib/utils/workflow'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingCard.module.css'

interface WeddingCardProps {
  wedding: Wedding
}

export function WeddingCard({ wedding }: WeddingCardProps) {
  const name = coupleName(wedding.couple.partner1, wedding.couple.partner2)
  const days = getDaysUntil(wedding.date)
  const progress = getWorkflowProgress(wedding.workflowStage)
  const location = wedding.ceremonyLocation ?? wedding.receptionLocation ?? `${wedding.couple.venue}, ${wedding.couple.city}`

  return (
    <Link to={`/sluby/${wedding.id}`} className={styles.link}>
      <Card hover className={styles.card}>
        <div className={styles.header}>
          <Avatar name={name} color={wedding.accentColor} size="lg" />
          <div className={styles.info}>
            <h3 className={styles.name}>{name}</h3>
            <p className={styles.package}>{wedding.packageName}</p>
          </div>
          <WorkflowBadge stage={wedding.workflowStage} />
        </div>

        {location && (
          <div className={styles.detail}>
            <IconMapPin className={styles.icon} />
            <span>{location}</span>
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.progress}>
            <span className={styles.progressLabel}>Workflow</span>
            <ProgressBar value={progress} max={100} showLabel={false} />
          </div>
          <div className={styles.dateBlock}>
            <span className={styles.date}>{formatDate(wedding.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span className={styles.countdown}>
              {days > 0 ? `za ${days} dni` : days === 0 ? 'dziś' : 'minął'}
            </span>
          </div>
          <IconChevronRight className={styles.chevron} />
        </div>
      </Card>
    </Link>
  )
}
