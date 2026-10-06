import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { ContractGenerationAnswer, MissingInput, MissingInputAnswerKind } from './generationProtocol'
import { answersForMissingInputs } from './missingInputAnswers'
import styles from './ContractGenerationMissingInputForm.module.css'

function inputType(kind: MissingInputAnswerKind): 'text' | 'date' | 'number' | 'email' | 'tel' {
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
  const [fieldState, setFieldState] = useState<{ requirements: readonly MissingInput[]; values: Record<string, string>; selectedOptions: Record<string, string> }>({
    requirements: props.requirements,
    values: {},
    selectedOptions: {},
  })
  const values = fieldState.requirements === props.requirements ? fieldState.values : {}
  const selectedOptions = fieldState.requirements === props.requirements ? fieldState.selectedOptions : {}

  function changeValue(id: string, value: string) {
    setFieldState({
      requirements: props.requirements,
      values: { ...values, [id]: value },
      selectedOptions,
    })
  }

  function selectOption(id: string, optionId: string) {
    setFieldState({ requirements: props.requirements, values, selectedOptions: { ...selectedOptions, [id]: optionId } })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    props.onSubmit(answersForMissingInputs(props.requirements, values, selectedOptions))
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
      mobileFooterLayout="inline"
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
          if (requirement.kind === 'choice') {
            return (
              <fieldset className={styles.choiceGroup} key={requirement.id}>
                <legend>{requirement.label}</legend>
                {requirement.options.map((option, optionIndex) => {
                  const optionFieldId = `${fieldId}-${optionIndex}`
                  return (
                    <label className={styles.choiceOption} htmlFor={optionFieldId} key={option.id}>
                      <input
                        id={optionFieldId}
                        type="radio"
                        name={fieldId}
                        value={option.id}
                        required
                        disabled={props.busy}
                        checked={selectedOptions[requirement.id] === option.id}
                        onChange={() => selectOption(requirement.id, option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </fieldset>
            )
          }
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
