import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import { formEngine } from '@/lib/forms/formEngine'
import { packageService } from '@/lib/api/packageService'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { QuestionField } from '@/features/forms/QuestionField'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import { normalizeContractQuestionnaireConfig } from '@/lib/forms/contractQuestionnaireSnapshot'
import type { AnswerValue, FormTemplate } from '@/types/form'
import type { FormAnswerJson, FormSchema } from '@/types/formEngine'
import publicStyles from '@/features/forms/FormPublicPage.module.css'

interface QuestionnaireAnswersReadOnlyProps {
  answerJson: FormAnswerJson
  /** When set, replay the same form schema the couple filled (AI or built-in). */
  formSchema?: FormSchema | null
}

/**
 * Read-only replay of the public contract questionnaire layout.
 */
export function QuestionnaireAnswersReadOnly({
  answerJson,
  formSchema = null,
}: QuestionnaireAnswersReadOnlyProps) {
  const userId = useStudioAuthId()
  const {
    data,
    isPending,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['studio-packages-extras-config', userId, 'active'],
    queryFn: async () => {
      const [packages, extras, company] = await Promise.all([
        packageService.list({ activeOnly: true }),
        extraServiceService.list({ activeOnly: true }),
        companyDetailsService.get(),
      ])
      return { packages, extras, company }
    },
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1,
  })

  const template: FormTemplate | null = useMemo(() => {
    if (!isSuccess || !data) return null
    const packageSnapshots =
      Array.isArray(answerJson.packageSnapshots) &&
      (answerJson.packageSnapshots as unknown[]).length > 0
        ? (answerJson.packageSnapshots as Array<{ id: string; name: string }>)
        : data.packages.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            currency: p.currency,
          }))
    const extraSnapshots =
      Array.isArray(answerJson.additionalServiceSnapshots) &&
      (answerJson.additionalServiceSnapshots as unknown[]).length > 0
        ? (answerJson.additionalServiceSnapshots as Array<{
            id: string
            name: string
          }>)
        : data.extras.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            price: e.price,
            currency: e.currency,
          }))
    const config = normalizeContractQuestionnaireConfig(
      data.company?.questionnaireConfig ?? null,
    )
    return resolvePublicFormTemplate(formSchema, packageSnapshots, {
      packages: packageSnapshots,
      additionalServices: extraSnapshots,
      config,
    })
  }, [formSchema, isSuccess, data, answerJson])

  if (isError) {
    return (
      <div className={publicStyles.shell}>
        <p className={publicStyles.muted}>
          Nie udało się załadować pakietów.{' '}
          <button type="button" onClick={() => void refetch()}>
            Spróbuj ponownie
          </button>
        </p>
      </div>
    )
  }

  if (!userId || isPending || isFetching || !isSuccess || !data || !template) {
    return (
      <div className={publicStyles.shell}>
        <p className={publicStyles.muted}>Ładowanie odpowiedzi…</p>
      </div>
    )
  }

  const values = (answerJson.values ?? {}) as Record<string, AnswerValue>
  // Legacy packageId → array for multiselect display
  const normalizedValues = { ...values }
  const pkgQ = template.questions.find(
    (q) =>
      q.fieldKey === 'selectedPackageIds' ||
      q.fieldKey === 'packageId' ||
      q.id === 'q-package',
  )
  if (pkgQ) {
    const current = normalizedValues[pkgQ.id]
    if (typeof current === 'string' && current) {
      normalizedValues[pkgQ.id] = [current]
    } else if (!current && typeof answerJson.fields === 'object') {
      const fields = answerJson.fields as Record<string, unknown>
      if (Array.isArray(fields.selectedPackageIds)) {
        normalizedValues[pkgQ.id] = fields.selectedPackageIds as string[]
      } else if (typeof fields.packageId === 'string' && fields.packageId) {
        normalizedValues[pkgQ.id] = [fields.packageId]
      }
    }
  }

  const customAnswers = Array.isArray(answerJson.customAnswers)
    ? (answerJson.customAnswers as Array<{
        fieldId: string
        labelSnapshot: string
        type: string
        value: unknown
      }>)
    : []

  const fullSections = groupQuestionsIntoSections(template.questions)

  return (
    <div className={publicStyles.shell}>
      <header className={publicStyles.header}>
        <p className={publicStyles.eyebrow}>{template.title}</p>
        <h2 className={publicStyles.title}>Wysłane odpowiedzi</h2>
        <p className={publicStyles.lead}>
          Podgląd tylko do odczytu — układ jak w ankiecie publicznej.
        </p>
      </header>

      <div className={publicStyles.form}>
        {fullSections.map((section) => {
          const isNotes =
            section.questions.length === 1 &&
            section.questions[0]?.type === 'textarea'

          return (
            <section key={section.id} className={publicStyles.card}>
              {section.title ? (
                <h3 className={publicStyles.cardTitle}>{section.title}</h3>
              ) : null}
              <div
                className={
                  isNotes
                    ? publicStyles.cardBodySingle
                    : publicStyles.cardBodyGrid
                }
              >
                {section.questions
                  .filter((q) => !formEngine.isDisplayQuestion(q))
                  .map((question) => {
                    const value = normalizedValues[question.id]
                    return (
                      <div
                        key={
                          question.fieldKey === 'selectedPackageIds' ||
                          question.id === 'q-package'
                            ? `${question.id}-opts-${question.options?.length ?? 0}`
                            : question.id
                        }
                        className={
                          isFullWidthQuestion(question)
                            ? publicStyles.fullWidth
                            : undefined
                        }
                      >
                        <QuestionField
                          question={
                            isNotes ? { ...question, label: '' } : question
                          }
                          value={value ?? ''}
                          onChange={() => undefined}
                          readOnly
                        />
                      </div>
                    )
                  })}
              </div>
            </section>
          )
        })}

        {customAnswers.length > 0 ? (
          <section className={publicStyles.card}>
            <h3 className={publicStyles.cardTitle}>Pola własne (zapis)</h3>
            <div className={publicStyles.cardBodySingle}>
              {customAnswers.map((a) => (
                <div key={a.fieldId} className={publicStyles.muted}>
                  <strong>{a.labelSnapshot}</strong>
                  <div>
                    {Array.isArray(a.value)
                      ? a.value.join(', ')
                      : typeof a.value === 'boolean'
                        ? a.value
                          ? 'Tak'
                          : 'Nie'
                        : String(a.value ?? '—')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
