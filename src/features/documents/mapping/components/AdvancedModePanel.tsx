import { useState } from 'react'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DetectedField } from '../types'
import { VariablePicker } from './VariablePicker'
import styles from '../MappingWizard.module.css'

/**
 * Developer-facing panel — registry keys, IDs, composition hints.
 * Not part of the normal import experience.
 */
export function AdvancedModePanel({
  fields,
  onMap,
}: {
  fields: DetectedField[]
  onMap: (fieldId: string, key: string | null) => void
}) {
  return (
    <section className={styles.advancedPanel}>
      <header className={styles.advancedHeader}>
        <h3 className={styles.paneTitle}>Tryb zaawansowany</h3>
        <p className={styles.paneMeta}>
          Klucze rejestru, identyfikatory i szczegóły techniczne — tylko dla
          programistów.
        </p>
      </header>
      <ul className={styles.detectedList}>
        {fields.map((field) => {
          const key = field.mappedKey ?? field.suggestedKey
          const def = key ? getVariableDef(key) : undefined
          return (
            <li key={field.id} className={styles.mappingRowWrap}>
              <div className={styles.mappingRow}>
                <p className={styles.detectedLabel}>{field.label}</p>
                <p className={styles.mappingToken}>
                  id: {field.id}
                  {key ? ` · key: ${key}` : ' · key: —'}
                  {def ? ` · ${def.section}/${def.dataSource}` : ''}
                </p>
                <label className={styles.mappingFieldLabel}>
                  Registry key
                  <VariablePicker
                    value={field.mappedKey ?? field.suggestedKey}
                    onChange={(k) => onMap(field.id, k)}
                  />
                </label>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Subtle unlock control — triple-click the label to reveal advanced mode. */
export function AdvancedModeUnlock({
  unlocked,
  onUnlock,
  onLock,
}: {
  unlocked: boolean
  onUnlock: () => void
  onLock: () => void
}) {
  const [clicks, setClicks] = useState(0)

  if (unlocked) {
    return (
      <button type="button" className={styles.advancedToggle} onClick={onLock}>
        Ukryj tryb zaawansowany
      </button>
    )
  }

  return (
    <button
      type="button"
      className={styles.advancedUnlock}
      aria-label="Odblokuj tryb zaawansowany"
      onClick={() => {
        const next = clicks + 1
        setClicks(next)
        if (next >= 3) {
          onUnlock()
          setClicks(0)
        }
      }}
    >
      ···
    </button>
  )
}
