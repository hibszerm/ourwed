import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import { formEngine } from '@/lib/forms/formEngine'
import { packageService } from '@/lib/api/packageService'
import { QuestionField } from '@/features/forms/QuestionField'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
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
 * Template is rebuilt whenever the packages query result changes.
 */
export function QuestionnaireAnswersReadOnly({
  answerJson,
  formSchema = null,
}: QuestionnaireAnswersReadOnlyProps) {
  const userId = useStudioAuthId()
  const {
    data: packages,
    isPending,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: async () => {
      const list = await packageService.list({ activeOnly: true })
      if (import.meta.env.DEV) {
        console.info('[QuestionnaireAnswersReadOnly] packageService.list', {
          packagesLength: list.length,
          packageIds: list.map((p) => p.id),
          packageNames: list.map((p) => p.name),
        })
      }
      return list
    },
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1,
  })

  const template: FormTemplate | null = useMemo(() => {
    if (!isSuccess || !packages) return null
    return resolvePublicFormTemplate(
      formSchema,
      packages.map((p) => ({ id: p.id, name: p.name })),
    )
  }, [formSchema, isSuccess, packages])

  if (import.meta.env.DEV) {
    const pkg = template?.questions.find(
      (q) => q.id === 'q-package' || q.fieldKey === 'packageId',
    )
    console.info('[QuestionnaireAnswersReadOnly] render', {
      packagesIsLoading: isPending || isFetching,
      packagesIsSuccess: isSuccess,
      packagesLength: packages?.length ?? null,
      resolvedTemplate: template ? 'ready' : null,
      packageOptionsLength: pkg?.options?.length ?? null,
    })
  }

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

  if (!userId || isPending || !isSuccess || !packages || !template) {
    return (
      <div className={publicStyles.shell}>
        <p className={publicStyles.muted}>Ładowanie pakietów…</p>
      </div>
    )
  }

  const values = (answerJson.values ?? {}) as Record<string, AnswerValue>
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
                    const value = values[question.id]
                    return (
                      <div
                        key={
                          question.fieldKey === 'packageId' ||
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
      </div>
    </div>
  )
}
