import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { formEngine } from '@/lib/forms/formEngine'
import { formService } from '@/lib/api/formService'
import { QuestionField } from '@/features/forms/QuestionField'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import type {
  AnswerValue,
  FormSettings,
  FormTemplate,
  ResolvedForm,
} from '@/types/form'
import styles from './FormPublicPage.module.css'

interface FormPublicPageProps {
  token: string
}

export function FormPublicPage({ token }: FormPublicPageProps) {
  const [resolved, setResolved] = useState<ResolvedForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    formService.getResolvedForm(token).then((data) => {
      if (cancelled) return
      setResolved(data)
      if (data) setValues(data.initialAnswers)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Ładowanie formularza…</p>
      </div>
    )
  }

  if (!resolved) {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Nie znaleziono formularza.</p>
      </div>
    )
  }

  const { template, settings, form } = resolved

  if (success || form.status === 'submitted') {
    return <FormSuccessView settings={settings} template={template} />
  }

  if (template.comingSoon) {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>{template.title}</h1>
          <p className={styles.lead}>{template.description}</p>
        </header>
        <p className={styles.footer}>{settings.footerMessage}</p>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!resolved) return

    const nextErrors = formEngine.validateAnswers(resolved.template, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const answers = formEngine.valuesToAnswers(values)
    const result = await formService.submit(token, answers)
    setSubmitting(false)

    if (result?.success) {
      setSuccess(true)
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

function FormSuccessView({
  settings,
  template,
}: {
  settings: FormSettings
  template: FormTemplate
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.success}>
        <div className={styles.illustration} aria-hidden="true">
          <span className={styles.illustrationMark} />
        </div>
        <h1 className={styles.title}>
          {settings.successTitle || template.successTitle}
        </h1>
        <p className={styles.lead}>
          {settings.successDescription || template.successDescription}
        </p>
      </div>
      <p className={styles.footer}>{settings.footerMessage}</p>
    </div>
  )
}
