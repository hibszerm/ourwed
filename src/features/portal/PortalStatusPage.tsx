import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { IconCheck } from '@/components/icons'
import { portalService } from '@/lib/api/portalService'
import { getPortalStatusSteps } from '@/lib/workflow/portalStatus'
import styles from './PortalStatusPage.module.css'

export function PortalStatusPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { data: wedding, isLoading } = useQuery({
    queryKey: ['portal-wedding', token],
    queryFn: () => portalService.getWeddingForToken(token),
    enabled: Boolean(token),
  })

  if (isLoading) {
    return <p className={styles.loading}>Ładowanie statusu...</p>
  }

  if (!wedding) {
    return <p className={styles.loading}>Nie znaleziono zlecenia.</p>
  }

  const steps = getPortalStatusSteps(wedding)

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Status współpracy</h1>
      <p className={styles.lead}>
        Tutaj zobaczycie, na jakim etapie jesteśmy. Wszystko aktualizuje się automatycznie.
      </p>

      <ol className={styles.timeline}>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`${styles.item} ${step.completed ? styles.done : styles.pending}`}
          >
            <div className={styles.marker}>
              <span className={styles.dot}>
                {step.completed && <IconCheck width={14} height={14} />}
              </span>
              {index < steps.length - 1 && <span className={styles.line} />}
            </div>
            <p className={styles.label}>{step.label}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
