import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import {
  evaluateWeddingContractReadiness,
  type CompletenessItem,
} from '@/lib/utils/weddingContractReadiness'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingContractReadiness.module.css'

const GROUP_LABEL: Record<CompletenessItem['group'], string> = {
  client: 'Klient',
  company: 'Firma',
  package: 'Pakiet',
  payments: 'Płatności',
}

function statusMark(status: CompletenessItem['status']): string {
  if (status === 'complete') return '✓'
  if (status === 'missing') return '!'
  return '○'
}

function statusLabel(status: CompletenessItem['status']): string {
  if (status === 'complete') return 'kompletne'
  if (status === 'missing') return 'brakuje'
  return 'opcjonalne'
}

export function WeddingContractReadinessPanel({
  wedding,
}: {
  wedding: Wedding
}) {
  const userId = useStudioAuthId()
  const { data: company } = useQuery({
    queryKey: ['company-details', userId],
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
  })

  const readiness = evaluateWeddingContractReadiness(wedding, company)

  const byGroup = (['client', 'company', 'package', 'payments'] as const).map(
    (group) => ({
      group,
      items: readiness.items.filter((item) => item.group === group),
    }),
  )

  return (
    <Card>
      <CardHeader title="Gotowość danych do umowy" />
      <div
        className={styles.status}
        data-overall={readiness.overall}
      >
        <span className={styles.statusLabel}>{readiness.overallLabel}</span>
        <span className={styles.statusMeta}>
          {readiness.requiredTotal - readiness.requiredMissing}/
          {readiness.requiredTotal} wymaganych
        </span>
      </div>

      <div className={styles.groups}>
        {byGroup.map(({ group, items }) => (
          <section key={group} className={styles.group}>
            <h3 className={styles.groupTitle}>{GROUP_LABEL[group]}</h3>
            {group === 'company' && readiness.overall !== 'ready' ? (
              <p className={styles.hint}>
                Profil firmy:{' '}
                <Link to="/ustawienia/firma">Ustawienia → Firma</Link>
              </p>
            ) : null}
            <ul className={styles.list}>
              {items.map((item) => (
                <li
                  key={item.id}
                  className={styles.item}
                  data-status={item.status}
                >
                  <span className={styles.mark} aria-hidden>
                    {statusMark(item.status)}
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemStatus}>
                    {statusLabel(item.status)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}
