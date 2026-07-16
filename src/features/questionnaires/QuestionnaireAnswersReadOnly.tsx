import { useQuery } from '@tanstack/react-query'
import {
  buildContractQuestionnaireTemplate,
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
} from '@/lib/forms/contractQuestionnaireTemplate'
import { formEngine } from '@/lib/forms/formEngine'
import { packageService } from '@/lib/api/packageService'
import { QuestionField } from '@/features/forms/QuestionField'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import type { AnswerValue } from '@/types/form'
import type { FormAnswerJson } from '@/types/formEngine'
import publicStyles from '@/features/forms/FormPublicPage.module.css'

interface QuestionnaireAnswersReadOnlyProps {
  answerJson: FormAnswerJson
}

/**
 * Read-only replay of the public contract questionnaire layout.
 */
export function QuestionnaireAnswersReadOnly({
  answerJson,
}: QuestionnaireAnswersReadOnlyProps) {
  const { data: packages = [] } = useQuery({
    queryKey: ['studio-packages'],
    queryFn: () => packageService.list(),
  })

  const template =
    packages.length > 0
      ? buildContractQuestionnaireTemplate(
          packages.map((p) => ({ id: p.id, name: p.name })),
        )
      : CONTRACT_QUESTIONNAIRE_TEMPLATE

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
                        key={question.id}
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
