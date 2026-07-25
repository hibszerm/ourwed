import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type {
  ContractGenerationValidation,
  MissingDataCorrectionKind,
} from '@/lib/utils/validateContractGeneration'
import styles from './MissingContractDataDialog.module.css'

interface MissingContractDataDialogProps {
  open: boolean
  validation: ContractGenerationValidation | null
  onClose: () => void
  onCorrect: (kind: MissingDataCorrectionKind) => void
}

/**
 * Generation-time blockers only — never shows completed fields or readiness counts.
 */
export function MissingContractDataDialog({
  open,
  validation,
  onClose,
  onCorrect,
}: MissingContractDataDialogProps) {
  const groups = validation?.missingGroups ?? []
  const primary = validation?.primaryCorrection

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Uzupełnij dane do umowy"
      description="Przed wygenerowaniem umowy uzupełnij poniższe informacje."
      size="md"
      primaryAction={
        primary ? (
          <Button
            type="button"
            variant="primary"
            onClick={() => onCorrect(primary.kind)}
          >
            {primary.label}
          </Button>
        ) : undefined
      }
      cancelLabel="Anuluj"
    >
      <div
        className={styles.body}
        data-testid="missing-contract-data-dialog"
      >
        {groups.map((group) => (
          <section key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>{group.label}</h3>
              {group.contextualAction.kind === 'company_settings' ? (
                <Link
                  to="/ustawienia/firma"
                  className={styles.contextLink}
                  onClick={onClose}
                >
                  {group.contextualAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.contextLink}
                  onClick={() => onCorrect(group.contextualAction.kind)}
                >
                  {group.contextualAction.label}
                </button>
              )}
            </div>
            <ul className={styles.list}>
              {group.items.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
