import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { QuestionField } from '@/features/forms/QuestionField'
import { FormSuccessView } from '@/features/forms/FormSuccessView'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import {
  getForm,
  getFormInstanceByToken,
  submitForm,
} from '@/lib/api/forms'
import { formEngine } from '@/lib/forms/formEngine'
import {
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
  DEFAULT_FORM_SETTINGS,
} from '@/lib/forms/contractQuestionnaireTemplate'
import type { AnswerValue, FormSettings } from '@/types/form'
import type { FormInstance } from '@/types/formEngine'
import styles from './FormPublicPage.module.css'

type GateState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'submitted'; settings: FormSettings }
  | { kind: 'ready'; instance: FormInstance; settings: FormSettings }

function emptyAnswers(): Record<string, AnswerValue> {
  const initial: Record<string, AnswerValue> = {}
  for (const q of formEngine.getInputQuestions(CONTRACT_QUESTIONNAIRE_TEMPLATE)) {
    if (q.type === 'checkbox') initial[q.id] = false
    else if (q.type === 'multiselect') initial[q.id] = []
    else initial[q.id] = ''
  }
  return initial
}

/**
 * Production public questionnaire at /form/:token.
 * Reuses the finished Contract Questionnaire UI from forms/demo — no redesign.
 */
export function ProductionContractFormPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [gate, setGate] = useState<GateState>({ kind: 'loading' })
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setGate({ kind: 'loading' })
      setSuccess(false)
      setErrors({})

      if (!token.trim()) {
        if (!cancelled) setGate({ kind: 'not_found' })
        return
      }

      try {
        const instance = await getFormInstanceByToken(token)
        const settings = DEFAULT_FORM_SETTINGS

        if (cancelled) return

        if (!instance || instance.status === 'revoked') {
          setGate({ kind: 'not_found' })
          return
        }

        if (instance.status === 'expired') {
          setGate({ kind: 'expired' })
          return
        }

        if (instance.status === 'submitted' || instance.status === 'approved') {
          setGate({ kind: 'submitted', settings })
          return
        }

        if (instance.status === 'rejected' || instance.status === 'archived') {
          setGate({ kind: 'not_found' })
          return
        }

        const definition = await getForm(instance.formId)
        if (cancelled) return
        if (!definition) {
          setGate({ kind: 'not_found' })
          return
        }

        setValues(emptyAnswers())
        setGate({ kind: 'ready', instance, settings })
      } catch {
        if (!cancelled) setGate({ kind: 'not_found' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (gate.kind === 'loading') {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Ładowanie formularza…</p>
      </div>
    )
  }

  if (gate.kind === 'not_found') {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nie znaleziono ankiety</h1>
          <p className={styles.lead}>
            Link jest nieprawidłowy lub został unieważniony. Poproś fotografa o
            nowy link do formularza.
          </p>
        </header>
      </div>
    )
  }

  if (gate.kind === 'expired') {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Ankieta wygasła</h1>
          <p className={styles.lead}>
            Ten link stracił ważność. Poproś fotografa o wysłanie nowej ankiety.
          </p>
        </header>
      </div>
    )
  }

  if (gate.kind === 'submitted' || success) {
    const settings =
      gate.kind === 'submitted' || gate.kind === 'ready'
        ? gate.settings
        : undefined

    if (settings) {
      return (
        <FormSuccessView
          settings={settings}
          template={CONTRACT_QUESTIONNAIRE_TEMPLATE}
        />
      )
    }
  }

  if (gate.kind !== 'ready') {
    return null
  }

  const { instance, settings } = gate
  const template = CONTRACT_QUESTIONNAIRE_TEMPLATE

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const nextErrors = formEngine.validateAnswers(template, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const answers = formEngine.valuesToAnswers(values)
      const answerJson = {
        templateId: template.id,
        templateType: template.type,
        values,
        answers,
        fields: formEngine.answersToFieldMap(template, answers),
      }

      await submitForm(instance.id, answerJson)
      setSuccess(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nie udało się wysłać formularza.'
      if (/wygas/i.test(message) || /expired/i.test(message)) {
        setGate({ kind: 'expired' })
      } else if (/już wysłan/i.test(message) || /already/i.test(message)) {
        setGate({ kind: 'submitted', settings })
      } else {
        setErrors({ _form: message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sections = groupQuestionsIntoSections(template.questions)

  function updateValue(questionId: string, value: AnswerValue) {
    setValues((prev) => ({ ...prev, [questionId]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{template.title}</p>
        <h1 className={styles.title}>{settings.welcomeTitle}</h1>
        <p className={styles.lead}>{settings.welcomeDescription}</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {sections.map((section) => {
          const isNotes =
            section.questions.length === 1 &&
            section.questions[0]?.type === 'textarea'

          return (
            <section key={section.id} className={styles.card}>
              {section.title ? (
                <h2 className={styles.cardTitle}>{section.title}</h2>
              ) : null}

              <div
                className={
                  isNotes ? styles.cardBodySingle : styles.cardBodyGrid
                }
              >
                {section.questions.map((question) => (
                  <div
                    key={question.id}
                    className={
                      isFullWidthQuestion(question)
                        ? styles.fullWidth
                        : undefined
                    }
                  >
                    <QuestionField
                      question={
                        isNotes
                          ? { ...question, label: '' }
                          : question
                      }
                      value={values[question.id] ?? ''}
                      error={errors[question.id]}
                      onChange={(value) => updateValue(question.id, value)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {errors._form ? (
          <p className={styles.muted} role="alert">
            {errors._form}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Wysyłanie…' : template.submitLabel}
          </Button>
        </div>
      </form>

      <p className={styles.footer}>{settings.footerMessage}</p>
    </div>
  )
}
