import {
  DOCUMENT_VARIABLE_SECTIONS,
  DOCUMENT_VARIABLES,
} from '@/features/documents/registry/variableRegistry'
import { Button } from '@/components/ui/Button'
import styles from '../MappingWizard.module.css'

/**
 * Variable assignment after a free-placement click on the document canvas.
 */
export function PlacementVariablePanel({
  onAssign,
  onCancel,
}: {
  onAssign: (variableKey: string) => void
  onCancel: () => void
}) {
  return (
    <div className={styles.guidedPanel}>
      <header className={styles.guidedPanelHeader}>
        <div>
          <p className={styles.suggestionEyebrow}>Nowe pole dynamiczne</p>
          <p className={styles.guidedQuestion}>Co ma się tu pojawić?</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Anuluj
        </Button>
      </header>

      <div className={styles.guidedVariableGroups}>
        {DOCUMENT_VARIABLE_SECTIONS.map((section) => {
          const vars = DOCUMENT_VARIABLES.filter((v) => v.section === section.id)
          if (vars.length === 0) return null
          return (
            <section key={section.id} className={styles.guidedVariableGroup}>
              <h4 className={styles.mappingGroupTitle}>{section.label}</h4>
              <ul className={styles.guidedVariableList}>
                {vars.map((v) => (
                  <li key={v.key}>
                    <button
                      type="button"
                      className={styles.guidedVariableBtn}
                      onClick={() => onAssign(v.key)}
                    >
                      <span className={styles.guidedVariableLabel}>
                        {v.labelPl}
                      </span>
                      <span className={styles.guidedVariableKey}>{v.key}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
