import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { QuestionnaireLocationField } from '@/features/prewedding/QuestionnaireLocationField'
import {
  isAnswerEmpty,
  isStructuredLocationAnswer,
} from '@/features/prewedding/preweddingLocation'
import { publicPreWeddingService } from '@/lib/api/preweddingQuestionnaireService'
import type {
  PreWeddingAnswerValue,
  PreWeddingQuestion,
  PreWeddingSection,
  PublicPreWeddingForm,
} from '@/types/preweddingQuestionnaire'
import styles from './PreWeddingPublicForm.module.css'

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

interface FieldProps {
  question: PreWeddingQuestion
  value: PreWeddingAnswerValue
  error?: string
  onChange: (value: PreWeddingAnswerValue) => void
  prefill?: string
}

function ShortTextField({ question, value, error, onChange, prefill }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={question.id} className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </label>
      {question.helpText && <p className={styles.helpText}>{question.helpText}</p>}
      <input
        id={question.id}
        type="text"
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        value={String(value ?? '')}
        placeholder={question.placeholder ?? prefill ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-required={question.required}
        aria-describedby={error ? `${question.id}-error` : undefined}
      />
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function LongTextField({ question, value, error, onChange }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={question.id} className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </label>
      {question.helpText && <p className={styles.helpText}>{question.helpText}</p>}
      <textarea
        id={question.id}
        className={`${styles.textarea} ${error ? styles.inputError : ''}`}
        value={String(value ?? '')}
        placeholder={question.placeholder ?? ''}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        aria-required={question.required}
        aria-describedby={error ? `${question.id}-error` : undefined}
      />
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function DateField({ question, value, error, onChange, prefill }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={question.id} className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </label>
      <input
        id={question.id}
        type="date"
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        value={String(value ?? prefill ?? '')}
        onChange={(e) => onChange(e.target.value)}
        aria-required={question.required}
        aria-describedby={error ? `${question.id}-error` : undefined}
      />
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function TimeField({ question, value, error, onChange }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={question.id} className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </label>
      <input
        id={question.id}
        type="time"
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        aria-required={question.required}
        aria-describedby={error ? `${question.id}-error` : undefined}
      />
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function SingleChoiceField({ question, value, error, onChange }: FieldProps) {
  const options = question.options ?? []
  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? `${question.id}-error` : undefined}>
      <legend className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </legend>
      {question.helpText && <p className={styles.helpText}>{question.helpText}</p>}
      <div className={styles.optionsList}>
        {options.map((opt) => (
          <label key={opt} className={styles.optionLabel}>
            <input
              type="radio"
              name={question.id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className={styles.optionInput}
            />
            <span className={styles.optionText}>{opt}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function YesNoField({ question, value, error, onChange }: FieldProps) {
  const options = question.options ?? ['Tak', 'Nie']
  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? `${question.id}-error` : undefined}>
      <legend className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </legend>
      <div className={styles.optionsList}>
        {options.map((opt) => (
          <label key={opt} className={styles.optionLabel}>
            <input
              type="radio"
              name={question.id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className={styles.optionInput}
            />
            <span className={styles.optionText}>{opt}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function InformationBlock({ question }: { question: PreWeddingQuestion }) {
  return (
    <div className={styles.infoBlock} role="note">
      {question.helpText && (
        <p className={styles.infoText} style={{ whiteSpace: 'pre-line' }}>
          {question.helpText}
        </p>
      )}
    </div>
  )
}

function AcknowledgementField({ question, value, error, onChange }: FieldProps) {
  const checked = Boolean(value)
  return (
    <div className={styles.field}>
      <label className={`${styles.checkboxLabel} ${error ? styles.inputError : ''}`}>
        <input
          id={question.id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.checkbox}
          aria-required={question.required}
          aria-describedby={error ? `${question.id}-error` : undefined}
        />
        <span className={styles.checkboxText}>
          {question.label}
          {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
        </span>
      </label>
      {error && (
        <p id={`${question.id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

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

/** Defensive guard: if a question's type changed after the couple already
 * answered it with an address, avoid rendering a raw object as plain text. */
function normalizeAnswerForType(
  question: PreWeddingQuestion,
  value: PreWeddingAnswerValue,
): PreWeddingAnswerValue {
  if (question.type !== 'address' && isStructuredLocationAnswer(value)) {
    const formatted =
      typeof (value as { formattedAddress?: string }).formattedAddress === 'string'
        ? (value as { formattedAddress: string }).formattedAddress
        : ''
    return formatted
  }
  return value
}

function QuestionFieldRouter({
  question,
  value: rawValue,
  error,
  onChange,
  prefill,
}: FieldProps) {
  const value = normalizeAnswerForType(question, rawValue)
  switch (question.type) {
    case 'short_text':
      return <ShortTextField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'long_text':
      return <LongTextField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'date':
      return <DateField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'time':
      return <TimeField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'single_choice':
      return <SingleChoiceField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'multiple_choice':
      return <SingleChoiceField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'yes_no':
      return <YesNoField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    case 'address':
      return (
        <QuestionnaireLocationField
          id={question.id}
          label={question.label}
          required={question.required}
          helpText={question.helpText}
          placeholder={question.placeholder ?? prefill}
          value={value}
          error={error}
          onChange={onChange}
        />
      )
    case 'information':
      return <InformationBlock question={question} />
    case 'acknowledgement':
      return <AcknowledgementField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
    default:
      return <ShortTextField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
  }
}

// ---------------------------------------------------------------------------
// Count required questions + answered + validation (exported for tests)
// ---------------------------------------------------------------------------

export function countRequired(sections: PreWeddingSection[]): number {
  let count = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (q.required && !q.hidden && q.type !== 'information') count++
    }
  }
  return count
}

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

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedAnswersRef = useRef<string>('')
  const inflightRef = useRef<number>(0)

  useEffect(() => {
    if (!token) {
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
        const restored: Record<string, PreWeddingAnswerValue> = { ...result.savedAnswers }
        for (const section of result.schema.sections) {
          for (const q of section.questions) {
            if (q.type === 'information') continue
            const alreadyAnswered = q.id in restored && !isAnswerEmpty(restored[q.id])
            if (!alreadyAnswered) {
              const prefillValue = q.weddingDayMapping
                ? result.prefill[q.weddingDayMapping]
                : undefined
              if (prefillValue) {
                restored[q.id] = prefillValue
              } else {
                restored[q.id] = q.type === 'acknowledgement' ? false : ''
              }
            }
          }
        }
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
          await publicPreWeddingService.autosave(token, nextAnswers, answeredReq, totalReq)
          if (inflightRef.current === seq) {
            lastSavedAnswersRef.current = serialized
            setSaveState('saved')
            setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 3000)
          }
        } catch {
          if (inflightRef.current === seq) setSaveState('error')
        }
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [token],
  )

  function handleChange(questionId: string, value: PreWeddingAnswerValue) {
    if (!form || submitted) return
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
      await publicPreWeddingService.submit(token, answers, answeredReq, totalReq)
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : 'Nie udało się wysłać ankiety.',
      })
    } finally {
      setSubmitting(false)
    }
  }

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
      <div className={styles.shell} data-testid="prewedding-thank-you">
        <StudioBrandHeader form={form} />
        <div className={styles.thankYou}>
          <h1 className={styles.thankYouTitle}>Dziękujemy!</h1>
          <p className={styles.thankYouLead}>
            Bardzo dziękujemy za poświęcony czas.
          </p>
          <p className={styles.thankYouBody}>
            Dzięki Waszym odpowiedziom będziemy mogli jeszcze lepiej przygotować się do Waszego
            dnia.
          </p>
          <p className={styles.thankYouClose}>Do zobaczenia już wkrótce!</p>
          {form.studioLogoUrl ? (
            <img
              src={form.studioLogoUrl}
              alt={form.studioName || form.title || 'Logo fotografa'}
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

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {visibleQuestions.map((q) => {
          if (q.id === 'q28' && tipsMerged) return null

          const isPrivate = q.weddingDayMapping === 'sensitiveFamilyNotes'
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
                className={`${styles.questionCard} ${isPrivate ? styles.privateSection : ''} ${isTipsMerge ? styles.tipsAckQuestionCard : ''}`}
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
                      q.weddingDayMapping ? form.prefill[q.weddingDayMapping] : undefined
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
