import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { DetectedField } from '../types'
import styles from '../MappingWizard.module.css'

function documentTypeLabel(type: string | undefined): string {
  if (!type) return 'Dokument'
  const t = type.toLowerCase()
  if (t.includes('wedding') || t.includes('contract') || t === 'contract') {
    return 'Umowa ślubna'
  }
  return type
}

export function AiReport({
  ai,
  fields,
}: {
  ai: AiDocumentAnalysisResult | null | undefined
  fields: DetectedField[]
}) {
  const infoCount = fields.filter((f) => f.status !== 'ignored').length
  const sectionCount = ai?.sections?.length ?? 0
  const clauseCount = ai?.clauses?.length ?? 0

  return (
    <section className={styles.aiReport} aria-labelledby="ai-report-title">
      <header className={styles.aiReportHeader}>
        <p className={styles.aiReportEyebrow}>Asystent AI</p>
        <h2 id="ai-report-title" className={styles.aiReportTitle}>
          AI przeanalizowało Twój kontrakt
        </h2>
      </header>

      <ul className={styles.aiReportChecklist}>
        <li className={styles.aiReportCheckItem}>
          <span className={styles.aiReportCheck} aria-hidden>
            ✓
          </span>
          <span>
            Rozpoznano: <strong>{documentTypeLabel(ai?.documentType)}</strong>
          </span>
        </li>
        <li className={styles.aiReportCheckItem}>
          <span className={styles.aiReportCheck} aria-hidden>
            ✓
          </span>
          <span>
            <strong>{infoCount}</strong> informacji w umowie
          </span>
        </li>
        <li className={styles.aiReportCheckItem}>
          <span className={styles.aiReportCheck} aria-hidden>
            ✓
          </span>
          <span>
            <strong>{sectionCount}</strong> sekcji ·{' '}
            <strong>{clauseCount}</strong> opcjonalnych zapisów
          </span>
        </li>
      </ul>

      <p className={styles.aiReportFootnote}>
        OurWed mapuje wykryte pola na zmienne szablonu. Dane studia i ceny nie
        pochodzą z tego kroku.
      </p>
    </section>
  )
}
