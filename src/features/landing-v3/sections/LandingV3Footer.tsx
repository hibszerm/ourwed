import { BrandMark } from '@/features/landing-v3/components/BrandMark'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

export function LandingV3Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <BrandMark />
          <p className={styles.footerCopy}>
            CRM dla fotografów, filmowców i content creatorów w branży ślubnej.
          </p>
        </div>
        <ul className={styles.footerLinks}>
          <li>
            <a href="#produkt">Produkt</a>
          </li>
          <li>
            <a href="#cennik">Cennik</a>
          </li>
          <li>
            <a href="/login">Logowanie</a>
          </li>
          <li>
            <a href="/register">Rejestracja</a>
          </li>
          <li>
            <a href="mailto:kontakt@ourwed.pl">Kontakt</a>
          </li>
        </ul>
      </div>
      <p className={styles.footerMeta}>
        © {new Date().getFullYear()} OurWed · Landing V3 (wersja przeglądowa)
      </p>
    </footer>
  )
}
