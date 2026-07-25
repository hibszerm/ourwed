import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import type { NextActionKind } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingHeroAction } from '@/features/weddings/components/detail/WeddingDetailHero'
import styles from './WeddingDetailV2.module.css'

interface WeddingNextActionProps {
  title: string
  description: string
  actionLabel: string | null
  actionKind: NextActionKind
  onAction: (action: WeddingHeroAction) => void
}

export function WeddingNextAction({
  title,
  description,
  actionLabel,
  actionKind,
  onAction,
}: WeddingNextActionProps) {
  return (
    <section
      className={styles.nextAction}
      data-testid="wedding-next-action"
      aria-labelledby="next-action-title"
    >
      <p className={styles.kicker}>Następny krok</p>
      <h2 id="next-action-title" className={styles.nextTitle}>
        {title}
      </h2>
      <p className={styles.nextDesc}>{description}</p>
      {actionKind === 'company_settings' ? (
        <Link to="/ustawienia/firma" className={styles.nextLinkBtn}>
          {actionLabel}
        </Link>
      ) : actionLabel && actionKind !== 'none' ? (
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            if (actionKind === 'generate_contract') onAction('generate_contract')
            if (actionKind === 'send_questionnaire')
              onAction('send_contract_questionnaire')
            if (actionKind === 'add_deposit') onAction('add_deposit')
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </section>
  )
}
