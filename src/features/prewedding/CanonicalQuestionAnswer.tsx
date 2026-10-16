import { formatAnswerValueForDisplay } from '@/features/prewedding/answerSummary'
import type { PreWeddingAnswerValue, PreWeddingQuestion } from '@/types/preweddingQuestionnaire'
import { QuestionFieldRouter } from './CanonicalQuestionFields'
import styles from './CanonicalQuestionAnswer.module.css'

export function CanonicalQuestionAnswer({
  question,
  value,
  mode,
  onChange,
  error,
  saving = false,
  conflict = false,
}: {
  question: PreWeddingQuestion
  value: PreWeddingAnswerValue | undefined
  mode: 'read' | 'edit'
  onChange?: (value: PreWeddingAnswerValue) => void
  error?: string
  saving?: boolean
  conflict?: boolean
}) {
  if (mode === 'read' || question.type === 'information') {
    return <div className={styles.read} data-question-id={question.id}>
      <strong>{question.label}</strong>
      <p>{value == null || value === '' ? '—' : formatAnswerValueForDisplay(question, value)}</p>
      {question.type === 'information' && question.helpText ? <p>{question.helpText}</p> : null}
    </div>
  }

  return <div className={styles.editor} data-question-id={question.id}>
    <QuestionFieldRouter question={question} value={value ?? ''} error={error} onChange={onChange ?? (() => undefined)} />
    {saving ? <span role="status">Zapisywanie…</span> : null}
    {conflict ? <p role="alert">Odpowiedź zmieniła się w innym miejscu. Odśwież ją przed ponownym zapisem.</p> : null}
  </div>
}
