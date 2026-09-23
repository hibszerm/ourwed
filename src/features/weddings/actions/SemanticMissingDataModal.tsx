import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { SemanticContractCanonicalDataset, SemanticGenerationRequirement, SemanticGenerationRequirementValues } from '@/features/ai-contract-transform/semanticContractGenerationService'
import type { SemanticMissingDataErrors } from '@/features/ai-contract-transform/semanticMissingDataForm'
import { semanticEmailRequirementLabel } from '@/features/ai-contract-transform/semanticMissingDataForm'
import styles from './SemanticMissingDataModal.module.css'

export function SemanticMissingDataModal(props: {
  open: boolean
  busy: boolean
  requirements: readonly SemanticGenerationRequirement[]
  dataset: SemanticContractCanonicalDataset | null
  values: SemanticGenerationRequirementValues
  errors: SemanticMissingDataErrors
  onChange: (id: string, value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const customers = props.dataset?.clients.customers ?? []
  return (
    <Modal
      open={props.open}
      onClose={props.onCancel}
      onCancel={props.onCancel}
      title="Uzupełnij dane umowy"
      description="Uzupełnij poniższe wartości, aby przygotować dokument. Podane dane dotyczą tylko tej umowy."
      size="md"
      busy={props.busy}
      cancelLabel="Anuluj"
      cancelVariant="secondary"
      initialFocus="panel"
      primaryAction={(
        <Button type="button" variant="primary" disabled={props.busy} onClick={props.onSubmit}>
          {props.busy ? 'Generujemy…' : 'Generuj'}
        </Button>
      )}
    >
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); props.onSubmit() }}>
        {props.requirements.map((requirement) => {
          const label = requirement.kind === 'date'
            ? requirement.label || 'Termin umowny'
            : semanticEmailRequirementLabel(requirement, customers)
          return (
            <label className={styles.field} key={requirement.id}>
              <span>{label}</span>
              <input
                type={requirement.kind === 'date' ? 'date' : 'email'}
                autoComplete={requirement.kind === 'customer_email' ? 'email' : 'off'}
                required
                disabled={props.busy}
                value={props.values[requirement.id] ?? ''}
                aria-invalid={Boolean(props.errors[requirement.id])}
                aria-describedby={props.errors[requirement.id] ? `semantic-input-error-${requirement.id}` : undefined}
                data-testid={`semantic-input-${requirement.kind}-${requirement.id}`}
                onChange={(event) => props.onChange(requirement.id, event.target.value)}
              />
              {props.errors[requirement.id] ? (
                <span className={styles.error} role="alert" id={`semantic-input-error-${requirement.id}`}>
                  {props.errors[requirement.id]}
                </span>
              ) : null}
            </label>
          )
        })}
      </form>
    </Modal>
  )
}
