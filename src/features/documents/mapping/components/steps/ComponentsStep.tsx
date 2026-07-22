import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  WIZARD_COMPONENT_CATALOG,
} from '../../composition/defaultComponentBlocks'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function ComponentsStep({ embedded = false }: { embedded?: boolean }) {
  const { state, toggleComponent, moveComponent } = useMappingWizard()
  const { draft } = state

  const enabledCount = draft.enabledComponentKinds.length

  return (
    <section
      className={embedded ? styles.embeddedPanel : styles.stepPanel}
      aria-labelledby="components-step-title"
    >
      {!embedded && (
        <div className={styles.stepIntro}>
          <h2 id="components-step-title" className={styles.stepTitle}>
            Sekcje umowy
          </h2>
          <p className={styles.stepBody}>
            Wybierz części kontraktu, które mają być inteligentne — uzupełniane
            danymi ślubu i pakietu. Kolejność odzwierciedla układ dokumentu.
          </p>
        </div>
      )}

      <p className={styles.compositionMeta}>
        Aktywne sekcje: <strong>{enabledCount}</strong>
      </p>

      <ol className={styles.compositionList}>
        {draft.componentOrder.map((kind, index) => {
          const meta = WIZARD_COMPONENT_CATALOG.find((c) => c.kind === kind)
          if (!meta) return null
          const enabled = draft.enabledComponentKinds.includes(kind)
          const blocks = draft.componentBlocks[kind] ?? []
          const infoCount = blocks.reduce(
            (n, b) => n + (b.payload.variableKeys?.length ?? 0),
            0,
          )

          return (
            <li
              key={kind}
              className={`${styles.compositionItem} ${enabled ? styles.compositionItemOn : ''}`}
            >
              <div className={styles.compositionMain}>
                <label className={styles.compositionToggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      toggleComponent(kind, e.target.checked)
                    }
                  />
                  <span className={styles.compositionIndex}>{index + 1}</span>
                  <span>
                    <span className={styles.compositionTitle}>{meta.title}</span>
                    <span className={styles.compositionDesc}>
                      {meta.description}
                    </span>
                  </span>
                </label>
              </div>

              <div className={styles.compositionAside}>
                {enabled && (
                  <span className={styles.compositionBadge}>
                    {infoCount > 0
                      ? `${infoCount} ${infoCount === 1 ? 'informacja' : 'informacji'}`
                      : 'W umowie'}
                  </span>
                )}
                <div className={styles.compositionOrderBtns}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Przenieś wyżej"
                    disabled={index === 0}
                    onClick={() => moveComponent(kind, 'up')}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Przenieś niżej"
                    disabled={index === draft.componentOrder.length - 1}
                    onClick={() => moveComponent(kind, 'down')}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <p className={styles.helperText}>
        Włączone sekcje wejdą do kontraktu i będą uzupełniane danymi ślubu.
        Zapis nastąpi w ostatnim kroku.
      </p>
    </section>
  )
}
