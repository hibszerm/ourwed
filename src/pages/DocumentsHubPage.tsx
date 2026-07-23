import { Link } from 'react-router-dom'
import { Files } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentsHubPage() {
  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.studioPage}>
          <header className={styles.studioHero}>
            <h1 className={styles.studioTitle}>Dokumenty</h1>
            <p className={styles.studioSubtitle}>
              Szablony umów Twojego studia. Prześlij kontrakt raz — OurWed
              odtwarza go na każdym ślubie.
            </p>
          </header>

          <div className={styles.contractGrid}>
            <Link
              to="/ustawienia/dokumenty/szablony"
              className={styles.contractCard}
            >
              <div className={styles.contractCardLink}>
                <div className={styles.contractCardHeader}>
                  <span className={styles.iconWrap} aria-hidden>
                    <Files size={22} strokeWidth={1.75} />
                  </span>
                  <h2 className={styles.contractCardTitle}>Szablony umów</h2>
                </div>
                <p className={styles.contractCardFormat}>Contract Templates</p>
                <p className={styles.studioSubtitle} style={{ margin: 0 }}>
                  Upload → AI wykrywa zmienne → Generuj umowę na ślubie. Bez
                  budowania ankiet przez AI.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
