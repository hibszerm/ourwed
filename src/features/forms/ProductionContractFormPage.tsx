import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { QuestionField } from '@/features/forms/QuestionField'
import { FormSuccessView } from '@/features/forms/FormSuccessView'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import {
  getPublicFormByToken,
  submitFormByToken,
} from '@/lib/api/forms'
import { formEngine } from '@/lib/forms/formEngine'
import { DEFAULT_FORM_SETTINGS } from '@/lib/forms/contractQuestionnaireTemplate'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import type { AnswerValue, FormTemplate } from '@/types/form'
import type { FormInstance, FormSchema } from '@/types/formEngine'
import styles from './FormPublicPage.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'expired' }
  | {
      status: 'ready'
      instance: FormInstance
      schema: FormSchema | null
      /** Live Studio packages from the public RPC — template depends on this. */
      packages: Array<{ id: string; name: string }>
    }

function emptyAnswers(template: FormTemplate): Record<string, AnswerValue> {
  const initial: Record<string, AnswerValue> = {}
  for (const q of formEngine.getInputQuestions(template)) {
    if (q.type === 'checkbox') initial[q.id] = false
    else if (q.type === 'multiselect') initial[q.id] = []
    else initial[q.id] = ''
  }
  return initial
}

function packageFingerprint(
  packages: Array<{ id: string; name: string }>,
): string {
  return packages.map((p) => `${p.id}:${p.name}`).join('|')
}

/**
 * Production public questionnaire at /form/:token.
 *
 * Packages and schema live in load-state. The resolved template is derived with
 * useMemo whenever `packages` changes — never frozen from the first paint.
 *
 * Deliberately NOT using React Query: auth bootstrap calls queryClient.clear(),
 * which cancelled/cleared in-flight public-form fetches on first visit and left
 * an empty Pakiet select until a full browser refresh.
 */
export function ProductionContractFormPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const renderCountRef = useRef(0)
  const seededForPackagesRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadForm() {
      setLoad({ status: 'loading' })
      setSuccess(false)
      setErrors({})
      setValues({})
      seededForPackagesRef.current = null

      if (!token.trim()) {
        if (!cancelled) setLoad({ status: 'not_found' })
        return
      }

      try {
        const publicForm = await getPublicFormByToken(token)
        if (cancelled) return

        if (!publicForm || publicForm.instance.status === 'revoked') {
          setLoad({ status: 'not_found' })
          return
        }

        if (publicForm.instance.status === 'expired') {
          setLoad({ status: 'expired' })
          return
        }

        if (
          publicForm.instance.status === 'rejected' ||
          publicForm.instance.status === 'archived'
        ) {
          setLoad({ status: 'not_found' })
          return
        }

        if (import.meta.env.DEV) {
          console.info('[ProductionContractFormPage] fetch settled', {
            packagesLength: publicForm.packages.length,
            packageIds: publicForm.packages.map((p) => p.id),
            packageNames: publicForm.packages.map((p) => p.name),
          })
        }

        setLoad({
          status: 'ready',
          instance: publicForm.instance,
          schema: publicForm.form.schema,
          packages: publicForm.packages,
        })
      } catch {
        if (!cancelled) setLoad({ status: 'not_found' })
      }
    }

    void loadForm()
    return () => {
      cancelled = true
    }
  }, [token])

  const packages = load.status === 'ready' ? load.packages : undefined
  const schema = load.status === 'ready' ? load.schema : null
  const packagesKey =
    packages !== undefined ? packageFingerprint(packages) : 'loading'

  // Recompute whenever packages (or schema) change — never cache first empty paint.
  const resolvedTemplate = useMemo(() => {
    if (packages === undefined) return null
    return resolvePublicFormTemplate(schema, packages)
  }, [schema, packages, packagesKey])

  renderCountRef.current += 1
  if (import.meta.env.DEV) {
    const pkg = resolvedTemplate?.questions.find(
      (q) => q.id === 'q-package' || q.fieldKey === 'packageId',
    )
    console.info('[ProductionContractFormPage] render', {
      render: renderCountRef.current,
      loadStatus: load.status,
      packagesIsLoading: load.status === 'loading',
      packagesIsSuccess: load.status === 'ready',
      packagesLength: packages?.length ?? null,
      resolvedTemplateIdentity:
        resolvedTemplate == null
          ? null
          : `tpl@${packagesKey || 'nopkg'}`,
      packageOptionsLength: pkg?.options?.length ?? null,
    })
  }

  // Seed / re-seed answers when the package list identity changes (e.g. 0 → N).
  useEffect(() => {
    if (!resolvedTemplate || packages === undefined) return
    if (seededForPackagesRef.current === packagesKey) return
    setValues(emptyAnswers(resolvedTemplate))
    seededForPackagesRef.current = packagesKey
  }, [resolvedTemplate, packages, packagesKey])

  if (load.status === 'loading' || !resolvedTemplate) {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Ładowanie formularza…</p>
      </div>
    )
  }

  if (load.status === 'not_found') {
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

  if (load.status === 'expired') {
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

  const { instance } = load
  const settings = DEFAULT_FORM_SETTINGS
  const template = resolvedTemplate

  if (
    success ||
    instance.status === 'submitted' ||
    instance.status === 'approved'
  ) {
    return <FormSuccessView settings={settings} template={template} />
  }

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

      await submitFormByToken(token, answerJson)
      setSuccess(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nie udało się wysłać formularza.'
      setErrors({ _form: message })
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
                    key={
                      question.fieldKey === 'packageId' ||
                      question.id === 'q-package'
                        ? `${question.id}-opts-${question.options?.length ?? 0}-${packagesKey}`
                        : question.id
                    }
                    className={
                      isFullWidthQuestion(question)
                        ? styles.fullWidth
                        : undefined
                    }
                  >
                    <QuestionField
                      question={
                        isNotes ? { ...question, label: '' } : question
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
