import styles from './PortalComingSoonPage.module.css'

interface PortalComingSoonPageProps {
  title: string
}

export function PortalComingSoonPage({ title }: PortalComingSoonPageProps) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>Dostępne w późniejszym etapie.</p>
    </section>
  )
}
