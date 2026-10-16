import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { isAnswerEmpty } from '@/features/prewedding/preweddingLocation'
import { publicPreWeddingService } from '@/lib/api/preweddingQuestionnaireService'
import { scrollPublicFormToTop } from '@/features/prewedding/scrollPublicFormToTop'
import type { PreWeddingAnswerValue, PreWeddingQuestion, PreWeddingSection, PublicPreWeddingForm } from '@/types/preweddingQuestionnaire'
import { PublicFormPrivacyNotice } from '@/features/legal/LegalLinks'
import styles from './PreWeddingPublicForm.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

import { AcknowledgementField, QuestionFieldRouter } from '@/features/prewedding/CanonicalQuestionFields'
import { prefillPlaceholder } from '@/features/prewedding/preweddingFieldUtils'

/** Tips text + confirmation checkbox in a single card (presentation only). */
function TipsAckCard({
  tipsQuestion,
  ackQuestion,
  value,
  error,
  onChange,
  number,
}: {
  tipsQuestion: PreWeddingQuestion
  ackQuestion: PreWeddingQuestion
  value: PreWeddingAnswerValue
  error?: string
  onChange: (value: PreWeddingAnswerValue) => void
  number?: string | null
}) {
  return (
    <div className={styles.tipsAckCard} data-testid="prewedding-tips-ack-card">
      <h2 className={styles.tipsAckTitle}>Wskazówki od nas</h2>
      {tipsQuestion.helpText ? (
        <p className={styles.tipsAckText} style={{ whiteSpace: 'pre-line' }}>
          {tipsQuestion.helpText}
        </p>
      ) : null}
      <div className={styles.tipsAckDivider} aria-hidden="true" />
      <div className={styles.tipsAckFooter}>
        {number ? <p className={styles.questionNumber}>{number}</p> : null}
        <AcknowledgementField
          question={{
            ...ackQuestion,
            label: 'Zapoznaliśmy się ze wskazówkami.',
          }}
          value={value}
          error={error}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Count required questions + answered + validation (exported for tests)
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components -- reused by the public-form validation suite
export function countRequired(sections: PreWeddingSection[]): number {
  let count = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (q.required && !q.hidden && q.type !== 'information') count++
    }
  }
  return count
}

// eslint-disable-next-line react-refresh/only-export-components -- shared by public autosave and submit flows
export function countAnsweredRequired(
  sections: PreWeddingSection[],
  answers: Record<string, PreWeddingAnswerValue>,
): number {
  let count = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required || q.hidden || q.type === 'information') continue
      if (isAnswerEmpty(answers[q.id])) continue
      count++
    }
  }
  return count
}

// eslint-disable-next-line react-refresh/only-export-components -- consumed by existing progress presentations
export function countAnsweredVisible(
  sections: PreWeddingSection[],
  answers: Record<string, PreWeddingAnswerValue>,
): { answered: number; total: number } {
  let answered = 0
  let total = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (q.hidden || q.type === 'information') continue
      total++
      if (!isAnswerEmpty(answers[q.id])) answered++
    }
  }
  return { answered, total }
}

// eslint-disable-next-line react-refresh/only-export-components -- reused by the public-form validation suite
export function validateRequired(
  sections: PreWeddingSection[],
  answers: Record<string, PreWeddingAnswerValue>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required || q.hidden || q.type === 'information') continue
      if (isAnswerEmpty(answers[q.id])) {
        errors[q.id] = 'To pole jest wymagane.'
      }
    }
  }
  return errors
}

function getVisibleQuestions(sections: PreWeddingSection[]): PreWeddingQuestion[] {
  const out: PreWeddingQuestion[] = []
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.hidden) out.push(q)
    }
  }
  return out
}

function questionNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

// ---------------------------------------------------------------------------
// Main public form page
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = 1500

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function StudioBrandHeader({
  form,
  compact,
}: {
  form: PublicPreWeddingForm
  compact?: boolean
}) {
  const studio = form.studioName?.trim()
  return (
    <header className={compact ? styles.brandCompact : styles.header} data-testid="prewedding-brand">
      {form.studioLogoUrl ? (
        <img
          src={form.studioLogoUrl}
          alt={studio || form.title || 'Logo studia'}
          className={styles.studioLogo}
        />
      ) : null}
      {studio ? <p className={styles.studioName}>{studio}</p> : null}
      {!compact ? (
        <>
          <h1 className={styles.title}>{form.title || 'Ankieta przedślubna'}</h1>
          {form.introduction ? (
            <p className={styles.lead} style={{ whiteSpace: 'pre-line' }}>
              {form.introduction}
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.brandCompactTitle}>{form.title || 'Ankieta przedślubna'}</p>
      )}
    </header>
  )
}

export function PreWeddingPublicFormPage({ token }: { token: string }) {
  const [form, setForm] = useState<PublicPreWeddingForm | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, PreWeddingAnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [responseRevision, setResponseRevision] = useState('0')

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedAnswersRef = useRef<string>('')
  const savedSnapshotRef = useRef<Record<string, PreWeddingAnswerValue>>({})
  const serverAnswersRef = useRef<Record<string, PreWeddingAnswerValue>>({})
  const responseRevisionRef = useRef('0')
  const blockedConflictKeysRef = useRef(new Set<string>())
  const inflightRef = useRef<number>(0)
  const thankYouRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize an invalid-token terminal state
      setLoadError('Brak tokenu.')
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const result = await publicPreWeddingService.getByToken(token)
        if (cancelled) return
        if (!result) {
          setLoadError('not_found')
          setLoading(false)
          return
        }
        setForm(result)
        responseRevisionRef.current = result.responseRevision
        setResponseRevision(result.responseRevision)
        serverAnswersRef.current = { ...result.savedAnswers }
        const restored = hydratePublicAnswers(result.schema, result.prefill, result.savedAnswers)
        savedSnapshotRef.current = { ...restored }
        setAnswers(restored)
        // Submitted questionnaires stay editable via the same link (prefilled).
        // Thank-you is shown only after a successful submit in this session.
      } catch {
        if (cancelled) return
        setLoadError('error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const scheduleAutosave = useCallback(
    (nextAnswers: Record<string, PreWeddingAnswerValue>, schema: PublicPreWeddingForm['schema']) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = setTimeout(async () => {
        const serialized = JSON.stringify(nextAnswers)
        if (serialized === lastSavedAnswersRef.current) return
        const seq = ++inflightRef.current
        setSaveState('saving')
        try {
          const sections = schema.sections
          const totalReq = countRequired(sections)
          const answeredReq = countAnsweredRequired(sections, nextAnswers)
          const keys = [...new Set([...Object.keys(savedSnapshotRef.current), ...Object.keys(nextAnswers)])]
            .filter((key) => !blockedConflictKeysRef.current.has(key)
              && JSON.stringify(savedSnapshotRef.current[key]) !== JSON.stringify(nextAnswers[key]))
          for (const key of keys) {
            const saved = await publicPreWeddingService.autosaveAnswer(token, key, nextAnswers[key], !(key in nextAnswers), answeredReq, totalReq, responseRevisionRef.current)
            responseRevisionRef.current = saved.responseRevision
            setResponseRevision(saved.responseRevision)
            if (key in nextAnswers) {
              savedSnapshotRef.current[key] = nextAnswers[key]!
              serverAnswersRef.current[key] = nextAnswers[key]!
            } else {
              delete savedSnapshotRef.current[key]
              delete serverAnswersRef.current[key]
            }
          }
          if (inflightRef.current === seq) {
            lastSavedAnswersRef.current = serialized
            setSaveState('saved')
            setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 3000)
          }
        } catch (error) {
          if (inflightRef.current === seq) setSaveState('error')
          if (inflightRef.current !== seq || !(error instanceof Error) || !/CONFLICT/i.test(error.message)) return
          try {
            const latest = await publicPreWeddingService.getByToken(token)
            if (!latest) {
              setSaveState('error')
              return
            }
            const oldBase = savedSnapshotRef.current
            const oldServer = serverAnswersRef.current
            const hydrated = hydratePublicAnswers(latest.schema, latest.prefill, latest.savedAnswers)
            const dirty = [...new Set([...Object.keys(oldBase), ...Object.keys(nextAnswers)])]
              .filter((key) => JSON.stringify(oldBase[key]) !== JSON.stringify(nextAnswers[key]))
            const overlaps = dirty.filter((key) => JSON.stringify(oldServer[key]) !== JSON.stringify(latest.savedAnswers[key]))
            const rebased = { ...hydrated }
            for (const key of dirty) if (key in nextAnswers) rebased[key] = nextAnswers[key]!
            setAnswers(rebased)
            savedSnapshotRef.current = { ...hydrated }
            serverAnswersRef.current = { ...latest.savedAnswers }
            responseRevisionRef.current = latest.responseRevision
            setResponseRevision(latest.responseRevision)
            if (overlaps.length) {
              overlaps.forEach((key) => blockedConflictKeysRef.current.add(key))
              setErrors((current) => ({ ...current, _form: 'Odpowiedź zmieniła się równolegle. Twoja wersja pozostała na ekranie; sprawdź ją przed ponownym zapisem.' }))
              return
            }
            const latestTotalRequired = countRequired(schema.sections)
            const latestAnsweredRequired = countAnsweredRequired(schema.sections, rebased)
            for (const key of dirty) {
              const retry = await publicPreWeddingService.autosaveAnswer(token, key, rebased[key], !(key in rebased), latestAnsweredRequired, latestTotalRequired, responseRevisionRef.current)
              responseRevisionRef.current = retry.responseRevision
              if (key in rebased) { savedSnapshotRef.current[key] = rebased[key]!; serverAnswersRef.current[key] = rebased[key]! }
              else { delete savedSnapshotRef.current[key]; delete serverAnswersRef.current[key] }
            }
            setResponseRevision(responseRevisionRef.current)
            lastSavedAnswersRef.current = JSON.stringify(rebased)
            setSaveState('saved')
          } catch {
            setSaveState('error')
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [token],
  )

  function handleChange(questionId: string, value: PreWeddingAnswerValue) {
    if (!form || submitted) return
    blockedConflictKeysRef.current.delete(questionId)
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value }
      setErrors((e) => {
        const ne = { ...e }
        delete ne[questionId]
        return ne
      })
      scheduleAutosave(next, form.schema)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || submitting || submitted) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

    const newErrors = validateRequired(form.schema.sections, answers)
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const firstErrorId = Object.keys(newErrors)[0]
      const el = document.getElementById(firstErrorId ?? '')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)
    try {
      const sections = form.schema.sections
      const totalReq = countRequired(sections)
      const answeredReq = countAnsweredRequired(sections, answers)
      await publicPreWeddingService.submit(token, answers, answeredReq, totalReq, responseRevisionRef.current)
      setSubmitted(true)
    } catch (err) {
      setErrors({
        _form: getUserFacingErrorMessage(err, 'Nie udało się wysłać ankiety.'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  useLayoutEffect(() => {
    if (!submitted) return
    scrollPublicFormToTop(thankYouRef.current)
    thankYouRef.current?.focus()
  }, [submitted])

  if (loading) {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Ładowanie ankiety…</p>
      </div>
    )
  }

  if (loadError === 'not_found' || !form) {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nie znaleziono ankiety</h1>
          <p className={styles.lead}>
            Link jest nieprawidłowy lub wygasł. Poproś fotografa o nowy link.
          </p>
        </header>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nie udało się wczytać ankiety</h1>
          <p className={styles.lead}>Odśwież stronę lub poproś fotografa o pomoc.</p>
        </header>
      </div>
    )
  }

  if (submitted) {
    return (
      <div
        ref={thankYouRef}
        className={styles.shell}
        data-testid="prewedding-thank-you"
        tabIndex={-1}
      >
        <div className={styles.thankYou}>
          <h1 className={styles.thankYouTitle}>Dziękujemy!</h1>
          <p className={styles.thankYouLead}>Ankieta została wysłana.</p>
          <p className={styles.thankYouBody}>
            Dzięki Waszym odpowiedziom będziemy mogli jeszcze lepiej przygotować się do Waszego
            dnia.
          </p>
          <p className={styles.thankYouClose}>Do zobaczenia już wkrótce!</p>
          {form.studioLogoUrl ? (
            <img
              src={form.studioLogoUrl}
              alt={form.studioName || 'Logo studia'}
              className={styles.thankYouLogo}
            />
          ) : form.studioName ? (
            <p className={styles.thankYouStudio}>{form.studioName}</p>
          ) : null}
        </div>
      </div>
    )
  }

  const visibleQuestions = getVisibleQuestions(form.schema.sections)
  const { answered, total } = countAnsweredVisible(form.schema.sections, answers)
  const progressPercent = total > 0 ? Math.round((answered / total) * 100) : 0
  const ackQuestion = visibleQuestions.find((q) => q.id === 'q28') ?? null
  const tipsMerged = Boolean(ackQuestion && visibleQuestions.some((q) => q.id === 'q27_info'))

  const answerableQuestions = visibleQuestions.filter((q) => {
    if (q.type === 'information') return false
    return true
  })

  return (
    <div className={styles.shell} data-testid="prewedding-long-form">
      <StudioBrandHeader form={form} />

      <div
        className={styles.stickyProgress}
        data-testid="prewedding-progress"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${answered} z ${total} odpowiedzi`}
      >
        <div className={styles.progressMeta}>
          <div className={styles.progressTitleBlock}>
            <span className={styles.progressTitle}>Ankieta przedślubna</span>
          </div>
          <span className={styles.progressPercent}>
            {answered} z {total} odpowiedzi
          </span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate data-response-revision={responseRevision}>
        {visibleQuestions.map((q) => {
          if (q.id === 'q28' && tipsMerged) return null

          const isFamilyNotes = q.weddingDayMapping === 'sensitiveFamilyNotes'
          const isTipsMerge = q.id === 'q27_info' && tipsMerged && ackQuestion

          let number: string | null = null
          if (isTipsMerge && ackQuestion) {
            const ackIndex = answerableQuestions.findIndex((x) => x.id === ackQuestion.id)
            number = ackIndex >= 0 ? questionNumber(ackIndex) : null
          } else if (q.type !== 'information') {
            const idx = answerableQuestions.findIndex((x) => x.id === q.id)
            number = idx >= 0 ? questionNumber(idx) : null
          }

          return (
            <div key={q.id} className={styles.questionStack}>
              <div
                className={`${styles.questionCard} ${isFamilyNotes ? styles.familyNotesSection : ''} ${isTipsMerge ? styles.tipsAckQuestionCard : ''}`}
                data-testid="prewedding-question-card"
                data-question-id={q.id}
              >
                {!isTipsMerge && number != null ? (
                  <p className={styles.questionNumber}>{number}</p>
                ) : null}
                {isTipsMerge ? (
                  <TipsAckCard
                    tipsQuestion={q}
                    ackQuestion={ackQuestion}
                    value={answers[ackQuestion.id] ?? false}
                    error={errors[ackQuestion.id]}
                    onChange={(v) => handleChange(ackQuestion.id, v)}
                    number={number}
                  />
                ) : (
                  <QuestionFieldRouter
                    question={q}
                    value={answers[q.id] ?? (q.type === 'acknowledgement' ? false : '')}
                    error={errors[q.id]}
                    onChange={(v) => handleChange(q.id, v)}
                    prefill={
                      q.weddingDayMapping
                        ? prefillPlaceholder(form.prefill[q.weddingDayMapping])
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          )
        })}

        {errors._form ? (
          <p className={styles.formError} role="alert">
            {errors._form}
          </p>
        ) : null}

        <div className={styles.submitRow}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Wysyłanie…' : 'Wyślij ankietę'}
          </Button>
          <PublicFormPrivacyNotice controller={form.privacyController ?? null} />
        </div>
      </form>

      <div className={styles.saveState} aria-live="polite" role="status">
        {saveState === 'saving' && <span>Zapisywanie…</span>}
        {saveState === 'saved' && <span>Zapisano</span>}
        {saveState === 'error' && (
          <span className={styles.saveError}>Nie udało się zapisać</span>
        )}
      </div>
    </div>
  )
}

function hydratePublicAnswers(
  schema: PublicPreWeddingForm['schema'],
  prefill: PublicPreWeddingForm['prefill'],
  saved: Record<string, PreWeddingAnswerValue>,
): Record<string, PreWeddingAnswerValue> {
  const restored = { ...saved }
  for (const section of schema.sections) for (const question of section.questions) {
    if (question.type === 'information') continue
    if (question.id in restored && !isAnswerEmpty(restored[question.id])) continue
    const value = question.weddingDayMapping ? prefill[question.weddingDayMapping] : undefined
    restored[question.id] = value ?? (question.type === 'acknowledgement' ? false : '')
  }
  return restored
}
