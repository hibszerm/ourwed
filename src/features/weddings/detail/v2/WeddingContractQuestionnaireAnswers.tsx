import { useQuery } from '@tanstack/react-query'
import { getLatestSubmittedFormAnswerRecord } from '@/lib/api/forms'
import { buildContractAnswerSections } from '@/features/questionnaires/contractAnswerSummary'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
} from '@/features/prewedding/preweddingLocation'
import {
  SelectedLocationCard,
  isManualGeoPlace,
} from '@/features/travel/SelectedLocationCard'
import styles from './WeddingContractQuestionnaireAnswers.module.css'

interface Props {
  weddingId: string
  /** When false, skip the query (e.g. questionnaire not completed). */
  enabled?: boolean
}

/**
 * Schema-driven Contract Questionnaire answers for Wedding Details.
 * Uses form_instances.options_snapshot + form_answers — not live studio config.
 */
export function WeddingContractQuestionnaireAnswers({
  weddingId,
  enabled = true,
}: Props) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['wedding-contract-answers', weddingId],
    queryFn: () => getLatestSubmittedFormAnswerRecord(weddingId, 'contract'),
    enabled: Boolean(weddingId && enabled),
    staleTime: 30_000,
  })

  if (!enabled) return null

  if (isPending) {
    return (
      <p className={styles.muted} data-testid="contract-answers-loading">
        Ładowanie odpowiedzi…
      </p>
    )
  }

  if (isError) {
    return (
      <p className={styles.muted} data-testid="contract-answers-error">
        Nie udało się wczytać odpowiedzi.{' '}
        <button type="button" className={styles.retry} onClick={() => void refetch()}>
          Spróbuj ponownie
        </button>
      </p>
    )
  }

  if (!data) {
    return (
      <p className={styles.muted} data-testid="contract-answers-empty">
        Brak zapisanych odpowiedzi.
      </p>
    )
  }

  const sections = buildContractAnswerSections(
    data.answerJson,
    data.optionsSnapshot,
  )

  if (sections.length === 0) {
    return (
      <p className={styles.muted} data-testid="contract-answers-empty">
        Brak odpowiedzi do wyświetlenia.
      </p>
    )
  }

  return (
    <div
      className={styles.root}
      data-testid="contract-questionnaire-answers"
    >
      <p className={styles.lead}>
        Odpowiedzi z ankiety do umowy — w kolejności z formularza wysłanego parze.
      </p>
      {sections.map((section) => (
        <section
          key={section.sectionId}
          className={styles.section}
          data-testid="contract-answer-section"
        >
          {section.sectionTitle ? (
            <h3 className={styles.sectionTitle}>{section.sectionTitle}</h3>
          ) : null}
          <ul className={styles.list}>
            {section.items.map((item) => {
              if (item.kind === 'location') {
                const geo = answerToGeoPlace(item.locationRaw)
                return (
                  <li
                    key={item.id}
                    className={styles.item}
                    data-testid="contract-answer-item"
                    data-kind="location"
                  >
                    <span className={styles.label}>{item.label}</span>
                    {geo ? (
                      <SelectedLocationCard
                        place={geo}
                        manual={
                          isManualGeoPlace(geo) || Boolean(item.manualLocation)
                        }
                        showMapsLink
                        mapsLinkLabel="Otwórz w Google Maps"
                        className={styles.locationCard}
                      />
                    ) : (
                      <span className={styles.value}>
                        {item.value ||
                          formatLocationAnswerDisplay(item.locationRaw)}
                      </span>
                    )}
                  </li>
                )
              }

              return (
                <li
                  key={item.id}
                  className={styles.item}
                  data-testid="contract-answer-item"
                  data-kind={item.kind}
                >
                  <span className={styles.label}>{item.label}</span>
                  <span
                    className={
                      item.kind === 'long_text' ? styles.valueLong : styles.value
                    }
                  >
                    {item.value}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
