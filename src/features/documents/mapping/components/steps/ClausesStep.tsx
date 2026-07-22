import { useMemo } from 'react'
import { useDocumentClauses } from '../../hooks/useDocumentClauses'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function ClausesStep() {
  const { state, toggleClauseId, toggleSuggestedClause } = useMappingWizard()
  const { draft } = state
  const { data: library = [], isLoading } = useDocumentClauses()

  const suggested = draft.analysis?.suggestedClauses ?? []
  const libraryKeys = useMemo(
    () => new Set(library.map((c) => c.key)),
    [library],
  )

  const pendingSuggestions = suggested.filter((s) => !libraryKeys.has(s.key))

  const enabledLibraryCount = draft.enabledClauseIds.length
  const enabledSuggestedCount = draft.enabledSuggestedClauseKeys.filter((k) =>
    pendingSuggestions.some((s) => s.key === k),
  ).length

  return (
    <section className={styles.stepPanel} aria-labelledby="clauses-step-title">
      <div className={styles.stepIntro}>
        <h2 id="clauses-step-title" className={styles.stepTitle}>
          Klauzule prawne
        </h2>
        <p className={styles.stepBody}>
          Dołącz gotowe klauzule do tej wersji umowy. Biblioteka studia jest
          wspólna — tu tylko wybierasz, co wchodzi w ten kontrakt.
        </p>
      </div>

      <p className={styles.compositionMeta}>
        Wybrane:{' '}
        <strong>{enabledLibraryCount + enabledSuggestedCount}</strong>
      </p>

      {isLoading ? (
        <p className={styles.helperText}>Ładowanie biblioteki klauzul…</p>
      ) : (
        <ul className={styles.compositionList}>
          {library.map((clause) => {
            const enabled = draft.enabledClauseIds.includes(clause.id)
            return (
              <li
                key={clause.id}
                className={`${styles.compositionItem} ${enabled ? styles.compositionItemOn : ''}`}
              >
                <label className={styles.compositionToggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      toggleClauseId(clause.id, e.target.checked)
                    }
                  />
                  <span>
                    <span className={styles.compositionTitle}>
                      {clause.title}
                    </span>
                    <span className={styles.compositionDesc}>
                      {clause.body?.trim()
                        ? clause.body.slice(0, 140) +
                          (clause.body.length > 140 ? '…' : '')
                        : `Klucz: ${clause.key}`}
                    </span>
                  </span>
                </label>
                {enabled && (
                  <span className={styles.compositionBadge}>W umowie</span>
                )}
              </li>
            )
          })}

          {pendingSuggestions.map((clause) => {
            const enabled = draft.enabledSuggestedClauseKeys.includes(
              clause.key,
            )
            return (
              <li
                key={`suggested-${clause.key}`}
                className={`${styles.compositionItem} ${enabled ? styles.compositionItemOn : ''}`}
              >
                <label className={styles.compositionToggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      toggleSuggestedClause(clause.key, e.target.checked)
                    }
                  />
                  <span>
                    <span className={styles.compositionTitle}>
                      {clause.title}
                    </span>
                    <span className={styles.compositionDesc}>
                      {clause.body}
                      <span className={styles.clauseSuggestedTag}>
                        {' '}
                        · proponowana (zostanie dodana do biblioteki przy
                        zapisie)
                      </span>
                    </span>
                  </span>
                </label>
                {enabled && (
                  <span className={styles.compositionBadge}>W umowie</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!isLoading && library.length === 0 && pendingSuggestions.length === 0 && (
        <p className={styles.helperText}>
          Brak klauzul w bibliotece. Możesz przejść dalej — klauzule dodasz
          później.
        </p>
      )}

      <p className={styles.helperText}>
        Wybrane klauzule zostaną powiązane z wersją szablonu przy zapisie
        konfiguracji (przez bloki optional_clause / enabledClauseIds).
      </p>
    </section>
  )
}
