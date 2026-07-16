import type { AnswerValue, Question } from '@/types/form'
import styles from './QuestionField.module.css'

interface QuestionFieldProps {
  question: Question
  value: AnswerValue
  error?: string
  onChange: (value: AnswerValue) => void
}

export function QuestionField({ question, value, error, onChange }: QuestionFieldProps) {
  if (question.type === 'section_title') {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{question.label}</h2>
        {question.description && (
          <p className={styles.sectionDesc}>{question.description}</p>
        )}
      </div>
    )
  }

  if (question.type === 'paragraph') {
    return <p className={styles.paragraph}>{question.label}</p>
  }

  const id = `q-${question.id}`
  const stringValue = typeof value === 'string' ? value : ''
  const boolValue = typeof value === 'boolean' ? value : false
  const arrayValue = Array.isArray(value) ? value : []

  return (
    <div className={styles.field}>
      {question.label ? (
        <label className={styles.label} htmlFor={id}>
          {question.label}
          {question.required ? ' *' : ''}
        </label>
      ) : null}

      {question.type === 'textarea' && (
        <textarea
          id={id}
          className={styles.textarea}
          rows={4}
          placeholder={question.placeholder}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {(question.type === 'text' ||
        question.type === 'email' ||
        question.type === 'phone' ||
        question.type === 'date' ||
        question.type === 'location') && (
        <input
          id={id}
          className={styles.input}
          type={
            question.type === 'email'
              ? 'email'
              : question.type === 'phone'
                ? 'tel'
                : question.type === 'date'
                  ? 'date'
                  : 'text'
          }
          placeholder={question.placeholder}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === 'select' && (
        <select
          id={id}
          className={styles.input}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Wybierz…</option>
          {(question.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {question.type === 'radio' && (
        <div className={styles.options} role="radiogroup" aria-labelledby={id}>
          {(question.options ?? []).map((opt) => (
            <label key={opt.value} className={styles.option}>
              <input
                type="radio"
                name={question.id}
                checked={stringValue === opt.value}
                onChange={() => onChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === 'checkbox' && (
        <label className={styles.option}>
          <input
            id={id}
            type="checkbox"
            checked={boolValue}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{question.placeholder || question.label}</span>
        </label>
      )}

      {question.type === 'multiselect' && (
        <div className={styles.options}>
          {(question.options ?? []).map((opt) => {
            const checked = arrayValue.includes(opt.value)
            return (
              <label key={opt.value} className={styles.option}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onChange(arrayValue.filter((v) => v !== opt.value))
                    } else {
                      onChange([...arrayValue, opt.value])
                    }
                  }}
                />
                <span>{opt.label}</span>
              </label>
            )
          })}
        </div>
      )}

      {error && <span className={styles.error}>{error}</span>}
      {question.description && (
        <p className={styles.hint}>{question.description}</p>
      )}
    </div>
  )
}
