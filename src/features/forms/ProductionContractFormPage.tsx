import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { QuestionField } from '@/features/forms/QuestionField'
import { FormSuccessView } from '@/features/forms/FormSuccessView'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
  isLocationsSection,
} from '@/features/forms/formSections'
import {
  derivePublicFormView,
  shouldFetchPublicForm,
} from '@/features/forms/publicFormLoadState'
import {
  getPublicFormByToken,
  submitFormByToken,
} from '@/lib/api/forms'
import { useAuth } from '@/features/auth/AuthProvider'
import { formEngine } from '@/lib/forms/formEngine'
import { DEFAULT_FORM_SETTINGS } from '@/lib/forms/contractQuestionnaireTemplate'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import {
  formatLocationAnswer,
  normalizeSelectedPackageIds,
  validateIdsAgainstOptions,
} from '@/lib/forms/contractQuestionnaireSnapshot'
import type { AnswerValue, FormTemplate } from '@/types/form'
import type { FormInstance, FormSchema } from '@/types/formEngine'
import type {
  AdditionalServiceOptionSnapshot,
  ContractQuestionnaireConfig,
  FormInstanceOptionsSnapshot,
  PackageOptionSnapshot,
} from '@/types/contractQuestionnaire'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import styles from './FormPublicPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

type LoadState =
  | { status: 'waiting_for_auth' }
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'error'; message?: string }
  | {
      status: 'ready'
      instance: FormInstance
      schema: FormSchema | null
      packages: PackageOptionSnapshot[]
      additionalServices: AdditionalServiceOptionSnapshot[]
      optionsSnapshot: FormInstanceOptionsSnapshot | null
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
  packages: PackageOptionSnapshot[],
  extras: AdditionalServiceOptionSnapshot[],
  config: ContractQuestionnaireConfig | null,
): string {
  return [
    packages.map((p) => `${p.id}:${p.name}`).join('|'),
    extras.map((e) => e.id).join('|'),
    config?.version ?? 0,
    config?.customFields?.map((f) => f.id).join(',') ?? '',
  ].join('::')
}

/**
 * Production public questionnaire at /form/:token.
 * Single screen — no wizard. Options come from the instance snapshot.
 */
export function ProductionContractFormPage({
  token: tokenProp,
}: {
  token?: string
} = {}) {
  const params = useParams<{ token: string }>()
  const token = (tokenProp ?? params.token ?? '').trim()
  const { isLoading: authLoading } = useAuth()
  const authReady = !authLoading

  const [load, setLoad] = useState<LoadState>({
    status: authReady ? 'loading' : 'waiting_for_auth',
  })
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const seededForPackagesRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadForm() {
      setSuccess(false)
      setErrors({})
      setValues({})
      seededForPackagesRef.current = null

      if (!authReady) {
        if (!cancelled) setLoad({ status: 'waiting_for_auth' })
        return
      }

      if (!shouldFetchPublicForm({ authReady, token })) {
        if (!cancelled) setLoad({ status: 'not_found' })
        return
      }

      if (!cancelled) setLoad({ status: 'loading' })

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

        setLoad({
          status: 'ready',
          instance: publicForm.instance,
          schema: publicForm.form.schema,
          packages: publicForm.packages,
          additionalServices: publicForm.additionalServices,
          optionsSnapshot: publicForm.optionsSnapshot,
        })
      } catch (err) {
        if (cancelled) return
        setLoad({
          status: 'error',
          message:
            getUserFacingErrorMessage(err, 'Nie udało się wczytać formularza.'),
        })
      }
    }

    void loadForm()
    return () => {
      cancelled = true
    }
  }, [token, authReady])

  const packages = load.status === 'ready' ? load.packages : undefined
  const additionalServices =
    load.status === 'ready' ? load.additionalServices : undefined
  const optionsSnapshot =
    load.status === 'ready' ? load.optionsSnapshot : null
  const schema = load.status === 'ready' ? load.schema : null
  const fallbackConfig = useMemo(
    () => defaultContractQuestionnaireConfig(),
    [],
  )
  const config =
    optionsSnapshot?.config ??
    (load.status === 'ready' ? fallbackConfig : null)

  const packagesKey =
    packages !== undefined && additionalServices !== undefined
      ? packageFingerprint(packages, additionalServices, config)
      : 'loading'

  const resolvedTemplate = useMemo(() => {
    if (packages === undefined || additionalServices === undefined) return null
    return resolvePublicFormTemplate(schema, packages, {
      packages,
      additionalServices,
      config,
    })
  }, [schema, packages, additionalServices, packagesKey, config])

  useEffect(() => {
    if (!resolvedTemplate || packages === undefined) return
    if (seededForPackagesRef.current === packagesKey) return
    setValues(emptyAnswers(resolvedTemplate))
    seededForPackagesRef.current = packagesKey
  }, [resolvedTemplate, packages, packagesKey])

  const view = derivePublicFormView({
    authReady,
    loadStatus: load.status,
    hasResolvedTemplate: Boolean(resolvedTemplate),
  })

  if (view === 'loading') {
    return (
      <div className={styles.shell}>
        <p className={styles.muted}>Ładowanie formularza…</p>
      </div>
    )
  }

  if (view === 'not_found') {
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

  if (view === 'expired') {
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

  if (view === 'error' || load.status !== 'ready' || !resolvedTemplate) {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nie udało się wczytać ankiety</h1>
          <p className={styles.lead}>
            {load.status === 'error' && load.message
              ? load.message
              : 'Odśwież stronę lub poproś fotografa o nowy link.'}
          </p>
        </header>
      </div>
    )
  }

  const { instance } = load
  const template = resolvedTemplate
  const greeting =
    config?.greeting?.trim() ||
    template.description ||
    DEFAULT_FORM_SETTINGS.welcomeDescription
  const footerText =
    template.footerText?.trim() ||
    config?.footerText?.trim() ||
    DEFAULT_FORM_SETTINGS.footerMessage
  const welcomeTitle = DEFAULT_FORM_SETTINGS.welcomeTitle
  const settings = {
    ...DEFAULT_FORM_SETTINGS,
    welcomeDescription: greeting,
    footerMessage: footerText,
    successDescription:
      config?.successMessage?.trim() || DEFAULT_FORM_SETTINGS.successDescription,
  }

  if (
    success ||
    instance.status === 'submitted' ||
    instance.status === 'approved'
  ) {
    return <FormSuccessView settings={settings} template={template} />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    const nextErrors = formEngine.validateAnswers(template, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const answers = formEngine.valuesToAnswers(values)
      const fields = formEngine.answersToFieldMap(template, answers)

      const selectedPackageIds = normalizeSelectedPackageIds(
        fields as Record<string, unknown>,
      )
      const selectedAdditionalServiceIds = Array.isArray(
        fields.selectedAdditionalServiceIds,
      )
        ? (fields.selectedAdditionalServiceIds as string[])
        : []

      const pkgCheck = validateIdsAgainstOptions(
        selectedPackageIds,
        packages ?? [],
      )
      if (!pkgCheck.ok) {
        setErrors({
          _form: 'Wybrany pakiet nie jest dostępny w tej ankiecie.',
        })
        return
      }
      const extraCheck = validateIdsAgainstOptions(
        selectedAdditionalServiceIds,
        additionalServices ?? [],
      )
      if (!extraCheck.ok) {
        setErrors({
          _form: 'Wybrana usługa dodatkowa nie jest dostępna w tej ankiecie.',
        })
        return
      }

      const customAnswers = template.questions
        .filter(
          (q) =>
            typeof q.fieldKey === 'string' && q.fieldKey.startsWith('custom.'),
        )
        .map((q) => ({
          fieldId: q.customFieldId || q.id,
          fieldKey: q.fieldKey?.replace(/^custom\./, ''),
          labelSnapshot: q.label,
          type: q.type,
          value: values[q.id],
          optionSnapshots: (q.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          })),
        }))

      const packageSnapshots = (packages ?? [])
        .filter((p) => selectedPackageIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
        }))
      const extraSnapshots = (additionalServices ?? [])
        .filter((s) => selectedAdditionalServiceIds.includes(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          currency: s.currency,
        }))

      const answerJson = {
        templateId: template.id,
        templateType: template.type,
        values,
        answers,
        fields: {
          ...fields,
          selectedPackageIds,
          packageId: selectedPackageIds[0] ?? '',
          selectedAdditionalServiceIds,
          bridePreparationLocation:
            fields.bridePreparationLocation ??
            fields.preparationLocation ??
            '',
          groomPreparationLocation: fields.groomPreparationLocation ?? '',
          ceremonyLocation: fields.ceremonyLocation ?? '',
          receptionLocation: fields.receptionLocation ?? '',
          preparationLocation:
            formatLocationAnswer(fields.bridePreparationLocation) ||
            formatLocationAnswer(fields.preparationLocation) ||
            '',
        },
        customAnswers,
        packageSnapshots,
        additionalServiceSnapshots: extraSnapshots,
        meta: {
          configVersion: config?.version ?? 1,
        },
      }

      await submitFormByToken(token, answerJson)
      setSuccess(true)
    } catch (err) {
      const message =
        getUserFacingErrorMessage(err, 'Nie udało się wysłać formularza.')
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
        <h1 className={styles.title}>{welcomeTitle}</h1>
        <p className={styles.lead}>{greeting}</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {sections.map((section) => {
          if (section.questions.length === 0) return null

          const isNotes =
            section.questions.length === 1 &&
            section.questions[0]?.type === 'textarea'
          const isLocations = isLocationsSection(section)

          return (
            <section key={section.id} className={styles.card}>
              {section.title ? (
                <h2 className={styles.cardTitle}>{section.title}</h2>
              ) : null}
              {section.description ? (
                <p className={styles.cardHelper}>{section.description}</p>
              ) : null}

              <div
                className={
                  isNotes
                    ? styles.cardBodySingle
                    : isLocations
                      ? styles.cardBodyStack
                      : styles.cardBodyGrid
                }
              >
                {section.questions.map((question) => (
                  <div
                    key={
                      question.fieldKey === 'selectedPackageIds' ||
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
                      question={isNotes ? { ...question, label: '' } : question}
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

      <p className={styles.footer}>{footerText}</p>
    </div>
  )
}
