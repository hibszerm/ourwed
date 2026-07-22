import { Link } from 'react-router-dom'
import { FileText, Settings } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function SettingsPage() {
  return (
    <AppLayout
      title="Ustawienia"
      subtitle="Konto studia i dokumenty"
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <div className={styles.hubGrid}>
            <Link to="/ustawienia/dokumenty" className={styles.hubCard}>
              <span className={styles.iconWrap}>
                <FileText size={22} strokeWidth={1.75} />
              </span>
              <h2 className={styles.hubCardTitle}>Dokumenty</h2>
              <p className={styles.hubCardDesc}>
                Zarządzaj szablonami umów, aneksów i innych dokumentów studia.
              </p>
            </Link>
            <div className={styles.hubCard} aria-disabled>
              <span className={styles.iconWrap}>
                <Settings size={22} strokeWidth={1.75} />
              </span>
              <h2 className={styles.hubCardTitle}>Profil studia</h2>
              <p className={styles.hubCardDesc}>
                Ustawienia profilu pojawią się w kolejnych aktualizacjach.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
