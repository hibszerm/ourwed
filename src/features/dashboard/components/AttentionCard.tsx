import { Link } from 'react-router-dom'
import { IconChevronRight } from '@/components/icons'
import type { AttentionItem } from '@/features/dashboard/utils/attention'
import { getAttentionIcon } from '@/features/dashboard/utils/attention'
import styles from './AttentionCard.module.css'

interface AttentionCardProps {
  items: AttentionItem[]
}

export function AttentionCard({ items }: AttentionCardProps) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>Co wymaga uwagi</h3>
        {items.length > 0 && (
          <span className={styles.badge}>{items.length}</span>
        )}
      </header>

      {items.length === 0 ? (
        <div className={styles.clear}>
          <span className={styles.clearIcon}>✓</span>
          <p>Wszystko pod kontrolą</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item, i) => (
            <li
              key={item.id}
              className={styles.item}
              style={{ animationDelay: `${0.12 + i * 0.05}s` }}
            >
              <Link to={`/sluby/${item.weddingId}`} className={styles.link}>
                <span className={styles.icon}>{getAttentionIcon(item.type)}</span>
                <div className={styles.content}>
                  <p className={styles.label}>{item.label}</p>
                  <p className={styles.couple}>{item.coupleName}</p>
                </div>
                {item.urgent && <span className={styles.urgent}>Pilne</span>}
                <IconChevronRight className={styles.chevron} width={16} height={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
