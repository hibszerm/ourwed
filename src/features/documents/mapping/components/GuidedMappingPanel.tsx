import { Button } from '@/components/ui/Button'
import {
  DOCUMENT_VARIABLE_SECTIONS,
  DOCUMENT_VARIABLES,
  getVariableDef,
} from '@/features/documents/registry/variableRegistry'
import type { ManualDocumentMapping, SelectedDocumentBlock } from '../types'
import styles from '../MappingWizard.module.css'

export function GuidedMappingPanel({
  selected,
  existingMapping,
  onAssign,
  onRemove,
  onClearSelection,
}: {
  selected: SelectedDocumentBlock | null
  existingMapping: ManualDocumentMapping | null
  onAssign: (variableKey: string) => void
  onRemove: (mappingId: string) => void
  onClearSelection: () => void
}) {
  if (!selected) {
    return (
      <div className={styles.guidedIdle}>
        <p className={styles.guidedIdleTitle}>Tryb prowadzony</p>
        <p className={styles.guidedIdleBody}>
          Kliknij fragment w dokumencie — na przykład pustą linię lub podkreślenia
          — i wskaż, jakie dane OurWed ma tam wstawiać.
        </p>
      </div>
    )
  }

  const currentDef = existingMapping
    ? getVariableDef(existingMapping.variableKey)
    : null

  return (
    <div className={styles.guidedPanel}>
      <header className={styles.guidedPanelHeader}>
        <div>
          <p className={styles.suggestionEyebrow}>Wybrany fragment</p>
          <p className={styles.guidedSelectedText}>
            {selected.blankish
              ? 'Puste miejsce / podkreślenie'
              : selected.selectedText.trim() || '(pusty akapit)'}
          </p>
        </div>
        <button
          type="button"
          className={styles.ignoreLink}
          onClick={onClearSelection}
        >
          Anuluj
        </button>
      </header>

      <p className={styles.guidedQuestion}>Co ma się tu pojawić?</p>

      {existingMapping && (
        <div className={styles.guidedCurrent}>
          <span className={styles.statusPillSuccess}>
            {currentDef?.labelPl ?? existingMapping.variableKey}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(existingMapping.id)}
          >
            Usuń mapowanie
          </Button>
        </div>
      )}

      <div className={styles.guidedVariableGroups}>
        {DOCUMENT_VARIABLE_SECTIONS.map((section) => {
          const vars = DOCUMENT_VARIABLES.filter((v) => v.section === section.id)
          if (vars.length === 0) return null
          return (
            <section key={section.id} className={styles.guidedVariableGroup}>
              <h4 className={styles.mappingGroupTitle}>{section.label}</h4>
              <ul className={styles.guidedVariableList}>
                {vars.map((v) => {
                  const active =
                    existingMapping?.variableKey === v.key
                  return (
                    <li key={v.key}>
                      <button
                        type="button"
                        className={`${styles.guidedVariableBtn} ${active ? styles.guidedVariableBtnActive : ''}`}
                        onClick={() => onAssign(v.key)}
                      >
                        <span className={styles.guidedVariableLabel}>
                          {v.labelPl}
                        </span>
                        <span className={styles.guidedVariableKey}>{v.key}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
