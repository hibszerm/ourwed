import { useMemo } from 'react'
import { Crosshair, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import { buildPreviewOverlays } from '../../mapping/previewOverlays'
import { DocumentPreviewPane } from '../../preview/DocumentPreviewPane'
import { PlacementVariablePanel } from '../PlacementVariablePanel'
import { FieldMappingRow } from '../FieldMappingRow'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function MappingStep() {
  const {
    state,
    mapField,
    ignoreField,
    acceptSuggestion,
    startFieldPlacement,
    stopFieldPlacement,
    placeFieldPending,
    cancelPendingPlacement,
    placeField,
    removeFieldPlacement,
  } = useMappingWizard()
  const { draft, placementMode, pendingPlacement } = state
  const analysis = draft.analysis

  const overlays = useMemo(
    () =>
      buildPreviewOverlays({
        fields: draft.fields,
        manualMappings: draft.manualMappings,
      }),
    [draft.fields, draft.manualMappings],
  )

  if (!analysis) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>
          Najpierw uruchom analizę dokumentu w poprzednim kroku.
        </p>
      </section>
    )
  }

  const visibleFields = draft.fields.filter((f) => f.status !== 'ignored')
  const placeholders = visibleFields.filter(
    (f) => f.origin !== 'heuristic' && f.origin !== 'manual',
  )
  const suggestions = visibleFields.filter((f) => f.origin === 'heuristic')
  const pendingSuggestions = suggestions.filter(
    (f) => f.status === 'needs_configuration',
  )
  const placedCount = draft.manualPlacements.length
  const connected =
    draft.fields.filter((f) => f.status === 'connected').length + placedCount

  return (
    <section className={styles.stepPanel} aria-labelledby="mapping-step-title">
      <div className={styles.stepIntro}>
        <div className={styles.mappingIntroRow}>
          <div>
            <h2 id="mapping-step-title" className={styles.stepTitle}>
              Pola dynamiczne
            </h2>
            <p className={styles.stepBody}>
              Kliknij w dokumencie tam, gdzie mają pojawić się dane OurWed —
              nawet na pustym miejscu. Dokument nie jest edytowany; pola to
              warstwa konfiguracji.
            </p>
          </div>
          {!placementMode ? (
            <Button
              type="button"
              variant="primary"
              onClick={startFieldPlacement}
            >
              <Plus size={15} style={{ marginRight: 6 }} aria-hidden />
              Dodaj pole dynamiczne
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={stopFieldPlacement}
            >
              <Crosshair size={15} style={{ marginRight: 6 }} aria-hidden />
              Zakończ dodawanie
            </Button>
          )}
        </div>
      </div>

      <div className={styles.analysisSummary}>
        <span className={styles.statusPillSuccess}>
          {connected} połączonych
        </span>
        {placedCount > 0 && (
          <span className={styles.statusPillNeutral}>
            {placedCount} umieszczonych
          </span>
        )}
        {pendingSuggestions.length > 0 && (
          <span className={styles.statusPillWarning}>
            {pendingSuggestions.length} propozycji
          </span>
        )}
        {placementMode && (
          <span className={styles.placementModeBadge}>
            Kliknij w dokumencie, aby umieścić pole
          </span>
        )}
      </div>

      <div className={styles.analysisSplit}>
        <DocumentPreviewPane
          sourceText={analysis.sourceText}
          structure={analysis.structure}
          overlays={overlays}
          placements={draft.manualPlacements}
          fileName={draft.sourceFileName}
          placementMode={placementMode}
          pendingPlacement={pendingPlacement}
          onCanvasPlace={placeFieldPending}
          onRemovePlacement={removeFieldPlacement}
          hint={
            placementMode
              ? 'Kliknij dowolne miejsce — także pusty obszar — aby dodać pole'
              : 'Włącz „Dodaj pole dynamiczne”, aby umieszczać dane w kontrakcie'
          }
        />

        <aside className={styles.detectedListPane}>
          <header className={styles.paneHeader}>
            <h3 className={styles.paneTitle}>
              {pendingPlacement
                ? 'Wybierz dane'
                : placementMode
                  ? 'Umieszczanie'
                  : 'Konfiguracja'}
            </h3>
          </header>

          <div className={styles.mappingGroups}>
            {pendingPlacement ? (
              <PlacementVariablePanel
                onAssign={placeField}
                onCancel={cancelPendingPlacement}
              />
            ) : placementMode ? (
              <div className={styles.guidedIdle}>
                <p className={styles.guidedIdleTitle}>Tryb aktywny</p>
                <p className={styles.guidedIdleBody}>
                  Kliknij w podglądzie dokumentu. Po kliknięciu wybierzesz, jakie
                  dane mają się tam pojawiać.
                </p>
              </div>
            ) : (
              <div className={styles.guidedIdle}>
                <p className={styles.guidedIdleTitle}>Pusty szablon?</p>
                <p className={styles.guidedIdleBody}>
                  Nie potrzebujesz znaczników ani kropek. Użyj „Dodaj pole
                  dynamiczne” i wskaż miejsca w umowie.
                </p>
              </div>
            )}

            {placedCount > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>
                  Umieszczone pola
                </h4>
                <ul className={styles.detectedList}>
                  {draft.manualPlacements.map((p) => {
                    const def = getVariableDef(p.variableKey)
                    return (
                      <li key={p.id} className={styles.mappingRowWrap}>
                        <div className={styles.mappingRow}>
                          <div className={styles.mappingRowHead}>
                            <div>
                              <p className={styles.detectedLabel}>
                                {def?.labelPl ?? p.variableKey}
                              </p>
                              <p className={styles.mappingToken}>
                                {p.variableKey} · {Math.round(p.position.x)}%,{' '}
                                {Math.round(p.position.y)}%
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.ignoreLink}
                              onClick={() => removeFieldPlacement(p.id)}
                            >
                              Usuń
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {placeholders.length > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>
                  Znaczniki w dokumencie
                </h4>
                <ul className={styles.detectedList}>
                  {placeholders.map((field) => (
                    <li key={field.id} className={styles.mappingRowWrap}>
                      <FieldMappingRow
                        field={field}
                        onMap={(key) => mapField(field.id, key)}
                        onIgnore={() => ignoreField(field.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {suggestions.length > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>
                  Propozycje z treści
                </h4>
                <ul className={styles.detectedList}>
                  {suggestions.map((field) => (
                    <li key={field.id} className={styles.mappingRowWrap}>
                      <FieldMappingRow
                        field={field}
                        onMap={(key) => mapField(field.id, key)}
                        onAccept={() => acceptSuggestion(field.id)}
                        onIgnore={() => ignoreField(field.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
