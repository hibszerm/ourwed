import {
  DOCUMENT_VARIABLE_SECTIONS,
  DOCUMENT_VARIABLES,
} from '@/features/documents/registry/variableRegistry'
import styles from '../MappingWizard.module.css'

export function VariablePicker({
  value,
  onChange,
  id,
}: {
  value: string | null
  onChange: (key: string | null) => void
  id?: string
}) {
  return (
    <select
      id={id}
      className={styles.variableSelect}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Wybierz źródło danych…</option>
      {DOCUMENT_VARIABLE_SECTIONS.map((section) => {
        const vars = DOCUMENT_VARIABLES.filter((v) => v.section === section.id)
        if (vars.length === 0) return null
        return (
          <optgroup key={section.id} label={section.label}>
            {vars.map((v) => (
              <option key={v.key} value={v.key}>
                {v.labelPl} ({v.key})
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
