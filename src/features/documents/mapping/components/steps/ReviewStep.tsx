import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPreviewOverlays } from '../../mapping/previewOverlays'
import { DocumentPreviewPane } from '../../preview/DocumentPreviewPane'
import { groupFieldsForReview } from '../../information/informationModel'
import {
  AdvancedModePanel,
  AdvancedModeUnlock,
} from '../AdvancedModePanel'
import { InformationItemCard } from '../InformationItemCard'
import { ComponentsStep } from './ComponentsStep'
import { ClausesStep } from './ClausesStep'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

type ReviewTab = 'information' | 'sections' | 'clauses'

/**
 * Semantic review: information the template needs ↔ document preview.
 * Registry keys stay in Advanced mode only.
 */
export function ReviewStep() {
  const {
    state,
    mapField,
    ignoreField,
    acceptSuggestion,
    selectField,
  } = useMappingWizard()
  const { draft, selectedFieldId } = state
  const analysis = draft.analysis
  const [tab, setTab] = useState<ReviewTab>('information')
  const [advanced, setAdvanced] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const overlays = useMemo(
    () =>
      buildPreviewOverlays({
        fields: draft.fields,
        manualMappings: draft.manualMappings,
        activeFieldId: selectedFieldId,
      }),
    [draft.fields, draft.manualMappings, selectedFieldId],
  )

  const groups = useMemo(
    () => groupFieldsForReview(draft.fields),
    [draft.fields],
  )

  const activeCount = draft.fields.filter((f) => f.status !== 'ignored').length
  const pendingCount = draft.fields.filter(
    (f) => f.status === 'needs_configuration',
  ).length

  useEffect(() => {
    if (!selectedFieldId || !listRef.current) return
    const el = listRef.current.querySelector(
      `[data-field-id="${CSS.escape(selectedFieldId)}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedFieldId])

  if (!analysis) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>
          Najpierw uruchom analizę AI w poprzednim kroku.
        </p>
      </section>
    )
  }

  return (
    <section className={styles.stepPanel} aria-labelledby="review-step-title">
      <div className={styles.stepIntro}>
        <div className={styles.stepIntroRow}>
          <h2 id="review-step-title" className={styles.stepTitle}>
            Przegląd informacji
          </h2>
          <AdvancedModeUnlock
            unlocked={advanced}
            onUnlock={() => setAdvanced(true)}
            onLock={() => setAdvanced(false)}
          />
        </div>
        <p className={styles.stepBody}>
          Potwierdź, czego kontrakt wymaga. Każdą informację możesz połączyć z
          ankietą, CRM lub ustawieniami firmy — albo zostawić niepołączoną.
        </p>
      </div>

      <div className={styles.reviewTabs} role="tablist" aria-label="Przegląd">
        {(
          [
            ['information', 'Informacje'],
            ['sections', 'Sekcje'],
            ['clauses', 'Opcjonalne zapisy'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.reviewTab} ${tab === id ? styles.reviewTabActive : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'information' && (
        <div className={styles.analysisSplit}>
          <DocumentPreviewPane
            sourceText={analysis.sourceText}
            structure={analysis.structure}
            overlays={overlays}
            fileName={draft.sourceFileName}
            hint="Kliknij podświetlenie, aby zobaczyć informację po prawej"
            onOverlayClick={(overlayId) => selectField(overlayId)}
          />

          <aside className={styles.detectedListPane}>
            <header className={styles.paneHeader}>
              <h3 className={styles.paneTitle}>Wykryte informacje</h3>
              <p className={styles.paneMeta}>
                {activeCount} łącznie
                {pendingCount > 0
                  ? ` · ${pendingCount} do potwierdzenia`
                  : ''}
              </p>
            </header>

            {advanced ? (
              <AdvancedModePanel
                fields={draft.fields.filter((f) => f.status !== 'ignored')}
                onMap={(fieldId, key) => mapField(fieldId, key)}
              />
            ) : (
              <div className={styles.infoGroups} ref={listRef}>
                {groups.length === 0 ? (
                  <p className={styles.emptyFieldsHint}>
                    AI nie wykryło informacji w tym dokumencie. Możesz wrócić i
                    spróbować innego pliku.
                  </p>
                ) : (
                  groups.map((group) => (
                    <section key={group.id} className={styles.infoGroup}>
                      <h4 className={styles.infoGroupTitle}>{group.label}</h4>
                      <div className={styles.infoGroupList}>
                        {group.fields.map((field) => (
                          <InformationItemCard
                            key={field.id}
                            field={field}
                            selected={selectedFieldId === field.id}
                            onSelect={() => selectField(field.id)}
                            onConnect={(key) => mapField(field.id, key)}
                            onConfirm={() => acceptSuggestion(field.id)}
                            onIgnore={() => ignoreField(field.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === 'sections' && <ComponentsStep embedded />}
      {tab === 'clauses' && <ClausesStep embedded />}
    </section>
  )
}
