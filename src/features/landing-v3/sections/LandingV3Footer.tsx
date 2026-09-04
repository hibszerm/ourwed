import { BrandMark } from '@/features/landing-v3/components/BrandMark'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

export function LandingV3Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <BrandMark />
          <p className={styles.footerCopy}>
            CRM dla fotografów, filmowców i twórców ślubnych.
          </p>
        </div>
        <ul className={styles.footerLinks}>
          <li>
            <a href="#jak-dziala">Jak działa</a>
          </li>
          <li>
            <a href="#stworzone-przez">Stworzone przez</a>
          </li>
          <li>
            <a href="#dla-kogo">Dla kogo</a>
          </li>
          <li>
            <a href="#cennik">Cennik</a>
          </li>
          <li>
            <a href="#faq">FAQ</a>
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
      <p className={styles.footerMeta}>© {new Date().getFullYear()} OurWed</p>
    </footer>
  )
}
