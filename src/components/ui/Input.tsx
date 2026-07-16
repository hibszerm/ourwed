import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from 'react'
import styles from './Input.module.css'

type FieldSize = 'sm' | 'md'

interface SharedFieldProps {
  label?: string
  hint?: string
  error?: string
  fieldSize?: FieldSize
  className?: string
}

type InputProps = SharedFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>
type TextareaProps = SharedFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>
type SelectProps = SharedFieldProps & SelectHTMLAttributes<HTMLSelectElement>

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string
  label?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      {label ? <span className={styles.label}>{label}</span> : null}
      {children}
      {error ? <span className={styles.error}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  )
}

/** Shared text input — visual foundation only. */
export function Input({
  label,
  hint,
  error,
  fieldSize = 'md',
  className = '',
  id,
  ...props
}: InputProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={`${styles.control} ${styles[fieldSize]} ${error ? styles.invalid : ''} ${className}`}
        {...props}
      />
    </FieldShell>
  )
}

export function Textarea({
  label,
  hint,
  error,
  fieldSize = 'md',
  className = '',
  id,
  ...props
}: TextareaProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.textarea} ${styles[fieldSize]} ${error ? styles.invalid : ''} ${className}`}
        {...props}
      />
    </FieldShell>
  )
}

export function Select({
  label,
  hint,
  error,
  fieldSize = 'md',
  className = '',
  id,
  children,
  ...props
}: SelectProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={`${styles.control} ${styles[fieldSize]} ${error ? styles.invalid : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}
