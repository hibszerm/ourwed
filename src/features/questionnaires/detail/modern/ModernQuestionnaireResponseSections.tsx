import { buildContractAnswerSections } from '@/features/questionnaires/contractAnswerSummary'
import { ModernQuestionnaireResponseRow } from '@/features/questionnaires/detail/modern/ModernQuestionnaireResponseRow'
import { DETAIL_EMPTY_ANSWERS } from '@/features/questionnaires/detail/modern/questionnaireDetailCopy'
import type { FormAnswerJson } from '@/types/formEngine'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import styles from './ModernQuestionnaireDetailWorkspace.module.css'

export function ModernQuestionnaireResponseSections({
  answerJson,
  optionsSnapshot,
}: {
  answerJson: FormAnswerJson
  optionsSnapshot: FormInstanceOptionsSnapshot | null
}) {
  const sections = buildContractAnswerSections(answerJson, optionsSnapshot)

  if (sections.length === 0) {
    return <p className={styles.emptyDesc}>{DETAIL_EMPTY_ANSWERS}</p>
  }

  return (
    <div className={styles.record}>
      {sections.map((section) => (
        <section key={section.sectionId} className={styles.section}>
          {section.sectionTitle ? (
            <h2 className={styles.sectionTitle}>{section.sectionTitle}</h2>
          ) : null}
          <dl className={styles.facts}>
            {section.items.map((item) => (
              <ModernQuestionnaireResponseRow key={item.id} item={item} />
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
