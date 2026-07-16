import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import styles from './PortalSuccessPage.module.css'

export function PortalSuccessPage() {
  const { token = '' } = useParams<{ token: string }>()

  return (
    <section className={styles.page}>
      <div className={styles.illustration} aria-hidden="true">
        <span className={styles.illustrationMark} />
      </div>
      <h1 className={styles.title}>Dziękujemy!</h1>
      <p className={styles.lead}>Otrzymaliśmy Wasze dane.</p>
      <p className={styles.body}>
        Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.
      </p>
      <Link to={`/portal/${token}`} className={styles.cta}>
        <Button type="button" variant="primary">
          Powrót do strony głównej
        </Button>
      </Link>
    </section>
  )
}
