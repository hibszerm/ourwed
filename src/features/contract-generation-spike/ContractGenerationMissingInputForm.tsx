import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { ContractGenerationAnswer, MissingInput } from './generationProtocol'
import { answersForMissingInputs } from './missingInputAnswers'
import styles from './ContractGenerationMissingInputForm.module.css'

function inputType(kind: MissingInput['answerKind']): 'text' | 'date' | 'number' | 'email' | 'tel' {
  if (kind === 'date' || kind === 'number' || kind === 'email') return kind
  if (kind === 'phone') return 'tel'
  return 'text'
}

export function ContractGenerationMissingInputForm(props: {
  open: boolean
  busy: boolean
  requirements: readonly MissingInput[]
  onSubmit: (answers: ContractGenerationAnswer[]) => void
  onCancel: () => void
}) {
  const formId = useId()
  const [fieldState, setFieldState] = useState<{ requirements: readonly MissingInput[]; values: Record<string, string> }>({
    requirements: props.requirements,
    values: {},
  })
  const values = fieldState.requirements === props.requirements ? fieldState.values : {}

  function changeValue(id: string, value: string) {
    setFieldState({
      requirements: props.requirements,
      values: { ...values, [id]: value },
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    props.onSubmit(answersForMissingInputs(props.requirements, values))
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onCancel}
      onCancel={props.onCancel}
      title="Uzupełnij dane umowy"
      description="Uzupełnij wszystkie poniższe informacje, aby kontynuować przygotowanie dokumentu."
      size="md"
      busy={props.busy}
      cancelLabel="Anuluj"
      cancelVariant="secondary"
      initialFocus="first"
      primaryAction={(
        <Button type="submit" form={formId} variant="primary" disabled={props.busy}>
          {props.busy ? 'Kontynuujemy…' : 'Kontynuuj generowanie'}
        </Button>
      )}
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        {props.requirements.map((requirement, index) => {
          const fieldId = `${formId}-${index}`
          const multiline = requirement.answerKind === 'multiline'
          const type = inputType(requirement.answerKind)
          return (
            <label className={styles.field} htmlFor={fieldId} key={requirement.id}>
              <span>{requirement.label}</span>
              {requirement.subject?.displayName ? (
                <small>{requirement.subject.displayName}</small>
              ) : null}
              {multiline ? (
                <textarea
                  id={fieldId}
                  required
                  disabled={props.busy}
                  rows={3}
                  value={values[requirement.id] ?? ''}
                  onChange={(event) => changeValue(requirement.id, event.target.value)}
                />
              ) : (
                <input
                  id={fieldId}
                  type={type}
                  inputMode={requirement.answerKind === 'phone' ? 'tel' : undefined}
                  autoComplete={requirement.answerKind === 'email' ? 'email' : requirement.answerKind === 'phone' ? 'tel' : 'off'}
                  step={requirement.answerKind === 'number' ? 'any' : undefined}
                  required
                  disabled={props.busy}
                  value={values[requirement.id] ?? ''}
                  onChange={(event) => changeValue(requirement.id, event.target.value)}
                />
              )}
            </label>
          )
        })}
      </form>
    </Modal>
  )
}
