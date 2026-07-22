import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { DetectedField } from '../types'
import type { QuestionnaireDraft } from '@/features/documents/questionnaire'
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
  questionnaire,
}: {
  ai: AiDocumentAnalysisResult | null | undefined
  fields: DetectedField[]
  questionnaire?: QuestionnaireDraft | null
}) {
  const infoCount = fields.filter((f) => f.status !== 'ignored').length
  const sectionCount = ai?.sections?.length ?? 0
  const clauseCount = ai?.clauses?.length ?? 0
  const counts = questionnaire?.counts

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
        {counts && (
          <li className={styles.aiReportCheckItem}>
            <span className={styles.aiReportCheck} aria-hidden>
              ✓
            </span>
            <span>
              Ta umowa wymaga:{' '}
              <strong>{counts.couple}</strong> odpowiedzi od pary,{' '}
              <strong>{counts.studio}</strong> ze studia,{' '}
              <strong>{counts.system}</strong> systemowych,{' '}
              <strong>{counts.ourwedConfiguration}</strong> z konfiguracji
              OurWed
            </span>
          </li>
        )}
        <li className={styles.aiReportCheckItem}>
          <span className={styles.aiReportCheck} aria-hidden>
            ✓
          </span>
          <span>
            Ankieta została wygenerowana automatycznie
            {questionnaire?.questions.length
              ? ` (${questionnaire.questions.filter((q) => q.enabled).length} pytań)`
              : ''}
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
        Para uzupełni tylko to, czego umowa wymaga od nich. Pakiety pochodzą z
        konfiguracji studia. Ceny i dane studia nie trafiają do ankiety.
      </p>
    </section>
  )
}
