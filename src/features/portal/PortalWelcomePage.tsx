import { useQuery } from '@tanstack/react-query'
import { portalService } from '@/lib/api/portalService'
import styles from './PortalWelcomePage.module.css'

export function PortalWelcomePage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => portalService.getSettings(),
  })

  if (isLoading || !settings) {
    return <p className={styles.loading}>Ładowanie...</p>
  }

  return (
    <section className={styles.welcome}>
      <h1 className={styles.title}>{settings.welcomeTitle}</h1>
      <p className={styles.subtitle}>{settings.welcomeDescription}</p>
      <p className={styles.paragraph}>{settings.welcomeParagraph}</p>
    </section>
  )
}
