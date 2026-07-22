import { Link } from 'react-router-dom'
import { Files } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentsHubPage() {
  return (
    <AppLayout
      title="Dokumenty"
      subtitle="Ustawienia · Dokumenty"
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <nav className={styles.breadcrumb} aria-label="Okruszki">
            <Link to="/ustawienia">Ustawienia</Link>
            <span className={styles.sep}>/</span>
            <span>Dokumenty</span>
          </nav>

          <div className={styles.hubGrid}>
            <Link
              to="/ustawienia/dokumenty/szablony"
              className={styles.hubCard}
            >
              <span className={styles.iconWrap}>
                <Files size={22} strokeWidth={1.75} />
              </span>
              <h2 className={styles.hubCardTitle}>Szablony</h2>
              <p className={styles.hubCardDesc}>
                Biblioteka umów i dokumentów prawnych Twojego studia — wersje,
                statusy i domyślne szablony w jednym miejscu.
              </p>
            </Link>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
