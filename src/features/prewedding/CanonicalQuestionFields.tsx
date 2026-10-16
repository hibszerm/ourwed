import { DatePickerField } from '@/features/forms/DatePickerField'
import { QuestionnaireLocationField } from '@/features/prewedding/QuestionnaireLocationField'
import { isStructuredLocationAnswer } from '@/features/prewedding/preweddingLocation'
import { normalizeMultipleChoiceAnswer, toggleMultipleChoiceValue } from '@/features/prewedding/multipleChoiceAnswer'
import type { PreWeddingAnswerValue, PreWeddingQuestion } from '@/types/preweddingQuestionnaire'
import styles from './PreWeddingPublicForm.module.css'


export interface FieldProps {
  question: PreWeddingQuestion
  value: PreWeddingAnswerValue
  error?: string
  onChange: (value: PreWeddingAnswerValue) => void
  /** Scalar placeholder only — structured place prefill is applied as answer value. */
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
  const isoValue = String(value ?? prefill ?? '')
  return (
    <div className={styles.field}>
      <label htmlFor={question.id} className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </label>
      {question.helpText && <p className={styles.helpText}>{question.helpText}</p>}
      <DatePickerField
        id={question.id}
        value={isoValue}
        error={error}
        placeholder="dd.mm.rrrr"
        onChange={(iso) => onChange(iso)}
      />
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

function MultipleChoiceField({ question, value, error, onChange }: FieldProps) {
  const options = question.options ?? []
  const selected = normalizeMultipleChoiceAnswer(value)
  return (
    <fieldset
      className={styles.fieldset}
      data-testid={`prewedding-multi-${question.id}`}
      aria-describedby={error ? `${question.id}-error` : undefined}
    >
      <legend className={styles.label}>
        {question.label}
        {question.required && <span className={styles.required} aria-label="wymagane"> *</span>}
      </legend>
      {question.helpText && <p className={styles.helpText}>{question.helpText}</p>}
      <div className={styles.optionsList}>
        {options.map((opt) => (
          <label key={opt} className={styles.optionLabel}>
            <input
              type="checkbox"
              name={`${question.id}[]`}
              value={opt}
              checked={selected.includes(opt)}
              onChange={() => onChange(toggleMultipleChoiceValue(selected, opt))}
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

export function AcknowledgementField({ question, value, error, onChange }: FieldProps) {
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

export function QuestionFieldRouter({
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
      return <MultipleChoiceField question={question} value={value} error={error} onChange={onChange} prefill={prefill} />
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
