import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  LEGAL_EFFECTIVE_DATE_PL,
  LEGAL_ROUTES,
  LEGAL_VERSION,
  legalPageTitle,
} from '@/features/legal/legalMeta'
import type { LegalSection } from '@/features/legal/content/regulamin'
import styles from './LegalDocumentPage.module.css'

type Props = {
  title: string
  description: string
  sections: LegalSection[]
}

export function LegalDocumentPage({ title, description, sections }: Props) {
  useEffect(() => {
    const previous = document.title
    document.title = legalPageTitle(title)
    window.scrollTo(0, 0)

    let meta = document.querySelector('meta[name="description"]')
    const previousMeta = meta?.getAttribute('content') ?? null
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)

    return () => {
      document.title = previous
      if (meta && previousMeta != null) meta.setAttribute('content', previousMeta)
    }
  }, [title, description])

  return (
    <div className={styles.page} data-legal-page="">
      <header className={styles.top}>
        <Link to="/" className={styles.brand} data-legal-brand="">
          <span className={styles.logoMark} aria-hidden>
            OW
          </span>
          <span className={styles.logoText}>OurWed</span>
        </Link>
        <nav className={styles.topNav} aria-label="Dokumenty prawne">
          <Link to={LEGAL_ROUTES.terms}>Regulamin</Link>
          <Link to={LEGAL_ROUTES.privacy}>Polityka prywatności</Link>
          <Link to={LEGAL_ROUTES.dpa}>Powierzenie danych</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <p className={styles.meta}>
          Obowiązuje od: {LEGAL_EFFECTIVE_DATE_PL}
          <span className={styles.metaSep} aria-hidden>
            ·
          </span>
          Wersja: {LEGAL_VERSION}
        </p>
        <h1 className={styles.title}>{title}</h1>

        <nav className={styles.toc} aria-label="Spis treści">
          <p className={styles.tocLabel}>Spis treści</p>
          <ol className={styles.tocList}>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={styles.section}
          >
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className={styles.paragraph}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>

      <footer className={styles.footer}>
        <Link to="/">← OurWed</Link>
        <span className={styles.footerMeta}>
          v{LEGAL_VERSION} · {LEGAL_EFFECTIVE_DATE_PL}
        </span>
      </footer>
    </div>
  )
}
