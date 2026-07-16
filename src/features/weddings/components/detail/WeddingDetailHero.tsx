import { Button } from '@/components/ui/Button'
import { coupleName, formatDate, getCountdownParts } from '@/lib/utils/dates'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailHero.module.css'

export type WeddingHeroAction =
  | 'send_contract_questionnaire'
  | 'generate_contract'
  | 'add_payment'
  | 'add_note'
  | 'add_deposit'

interface WeddingDetailHeroProps {
  wedding: Wedding
  onAction: (action: WeddingHeroAction) => void
}

function countdownLabel(date: string): string {
  const { days, isPast, isToday } = getCountdownParts(date)
  if (isPast) return 'Ślub już się odbył'
  if (isToday) return 'Dziś'
  return `Za ${days} dni`
}

function displayLocation(value?: string): string {
  return value?.trim() ? value : '—'
}

export function WeddingDetailHero({ wedding, onAction }: WeddingDetailHeroProps) {
  const name = coupleName(wedding.couple.partner1, wedding.couple.partner2)
  const contractSent = wedding.questionnaires.contractData.status !== 'not_sent'
  const showDeposit = !weddingActionsService.hasDepositPayment(wedding)

  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>{name}</h1>
      <div className={styles.meta}>
        <time className={styles.date}>{formatDate(wedding.date)}</time>
        <span className={styles.metaDot}>·</span>
        <span className={styles.countdown}>{countdownLabel(wedding.date)}</span>
      </div>

      <dl className={styles.details}>
        <div className={styles.detailItem}>
          <dt className={styles.label}>Ceremonia</dt>
          <dd className={styles.value}>{displayLocation(wedding.ceremonyLocation)}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt className={styles.label}>Przyjęcie weselne</dt>
          <dd className={styles.value}>{displayLocation(wedding.receptionLocation)}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt className={styles.label}>Pakiet</dt>
          <dd className={styles.value}>{wedding.packageName}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={contractSent}
          onClick={() => onAction('send_contract_questionnaire')}
        >
          Wyślij ankietę
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAction('generate_contract')}
        >
          Generuj umowę
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAction('add_payment')}
        >
          Dodaj wpłatę
        </Button>
        {showDeposit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction('add_deposit')}
          >
            Dodaj zadatek
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAction('add_note')}
        >
          Dodaj notatkę
        </Button>
      </div>
    </section>
  )
}
