/**
 * Experiment review panel — three-dimension validation display.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  EXPERIMENT_FIELD_GROUPS,
  EXPERIMENT_FIELD_LABELS,
} from './fieldRegistry'
import { logApprovalState } from './approvalStateDiagnostics'
import { validateManualMapping } from './mappingValidator'
import { mappingReadinessLabel } from './mappingReadiness'
import { ManualBlockSelector } from './ManualBlockSelector'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { graphToValidatedMappings } from './pipeline/graphAdapters'
import {
  approveAllAutoOccurrences,
  approveOccurrence,
  ignoreOccurrence,
  rejectOccurrence,
  restoreOccurrenceDecision,
  setOccurrenceCustomReplacement,
} from './pipeline/graphReviewActions'
import { groupOccurrencesByField } from './pipeline/pipelineSelectors'
import { getOccurrenceTargetValue } from './validation/occurrenceAccessors'
import { suggestedTargetForOccurrence, replacementStrategyLabel } from './pipeline/replacementStrategy'
import {
  canAutoApproveOccurrence,
  deriveOccurrenceDisplayStatus,
  displayStatusLabel,
  replacementReadinessLabel,
  semanticValidityLabel,
  sourceValidityLabel,
} from './validation/occurrenceDisplayStatus'
import { getFieldDefinition } from './validation/fieldDefinitionRegistry'
import type { ExperimentalRenderEligibility } from './experimentalRenderEligibility'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  ContractOccurrence,
  IndexedDocxBlock,
  MappingReadinessStatus,
  ReplacementStrategy,
  ValidatedAiMapping,
} from './types'
import styles from './AiContractExperimentPage.module.css'

type Props = {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  blocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
  readiness: MappingReadinessStatus
  renderEligibility: ExperimentalRenderEligibility
  onChange: (next: ValidatedAiMapping[]) => void
  onComplete: () => void
  renderBlockedMessage?: string
}

function blockKindLabel(occurrence: ContractOccurrence): string {
  if (occurrence.physicalRange.tableIndex !== undefined) return 'Tabela'
  return 'Treść umowy'
}

function previewTargetValue(occurrence: ContractOccurrence): string {
  const suggested = suggestedTargetForOccurrence(occurrence) ?? getOccurrenceTargetValue(occurrence)
  if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
    if (suggested) return suggested
    return '—'
  }
  if (occurrence.replacementStrategy === 'IGNORE_OCCURRENCE') return '— pominięte'
  return suggested ?? '—'
}

export function MappingReviewPanel({
  experimentRunId,
  mappings,
  blocks,
  generationInput,
  readiness,
  renderEligibility,
  onChange,
  onComplete,
  renderBlockedMessage,
}: Props) {
  const [manualField, setManualField] = useState<ContractFieldKey | null>(null)
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({})

  const graph = useMemo(
    () =>
      buildOccurrenceGraphFromMappings({
        experimentRunId,
        mappings,
        blocks,
        generationInput,
        supplement: false,
      }),
    [experimentRunId, mappings, blocks, generationInput],
  )

  const logicalGroups = useMemo(
    () => groupOccurrencesByField(graph),
    [graph],
  )

  function emitGraph(nextGraph: typeof graph) {
    const nextMappings = graphToValidatedMappings(nextGraph)
    logApprovalState({
      experimentRunId,
      source: 'review_ui',
      mappings: nextMappings,
    })
    onChange(nextMappings)
  }

  function handleApprove(occurrence: ContractOccurrence) {
    if (!canAutoApproveOccurrence(occurrence)) return
    emitGraph(approveOccurrence({ graph, occurrenceId: occurrence.id }))
  }

  function handleReject(occurrence: ContractOccurrence) {
    const status = deriveOccurrenceDisplayStatus(occurrence)
    if (status === 'rejected_invalid_span' || status === 'protected_provider_data') return
    emitGraph(rejectOccurrence({ graph, occurrenceId: occurrence.id }))
  }

  function handleRestore(occurrence: ContractOccurrence) {
    emitGraph(restoreOccurrenceDecision({ graph, occurrenceId: occurrence.id }))
  }

  function handleIgnore(occurrence: ContractOccurrence) {
    emitGraph(ignoreOccurrence({ graph, occurrenceId: occurrence.id }))
  }

  function handleSaveCustom(occurrence: ContractOccurrence) {
    const value = customDraft[occurrence.id] ?? ''
    emitGraph(
      setOccurrenceCustomReplacement({
        graph,
        occurrenceId: occurrence.id,
        value,
      }),
    )
  }

  function handleApproveAllAuto() {
    emitGraph(approveAllAutoOccurrences(graph))
  }

  function handleManualSelect(input: {
    fieldKey: ContractFieldKey
    blockId: string
    exactValue: string
  }) {
    const manual = validateManualMapping({
      fieldKey: input.fieldKey,
      blockId: input.blockId,
      exactValue: input.exactValue,
      blocks,
      existing: mappings,
    })
    onChange([...mappings.filter((m) => m.id !== manual.id), manual])
    setManualField(null)
  }

  const canContinue = renderEligibility.eligible
  const hasUnresolvedOccurrences = readiness === 'needs_review'

  const groupedBySection = useMemo(() => {
    const map = new Map(logicalGroups.map((g) => [g.fieldKey, g]))
    return Object.values(EXPERIMENT_FIELD_GROUPS)
      .map((group) => ({
        title: group.title,
        fields: group.keys
          .map((key) => map.get(key))
          .filter((g): g is NonNullable<typeof g> => Boolean(g?.occurrences.length)),
      }))
      .filter((g) => g.fields.length > 0)
  }, [logicalGroups])

  function strategyActions(strategy: ReplacementStrategy, occurrence: ContractOccurrence) {
    const displayStatus = deriveOccurrenceDisplayStatus(occurrence)
    const showCustom = strategy === 'CUSTOM_TEXT_REQUIRED'
    const showApprove =
      displayStatus === 'ready_for_approval' ||
      displayStatus === 'needs_role_review' ||
      displayStatus === 'needs_manual_text'

    return (
      <>
        <p className={styles.muted}>
          Podgląd zamiany:{' '}
          <strong>
            {occurrence.sourceValue} → {previewTargetValue(occurrence)}
          </strong>
        </p>
        {showCustom ? (
          <div className={styles.actions}>
            <input
              type="text"
              value={customDraft[occurrence.id] ?? occurrence.customReplacement ?? ''}
              placeholder="Wpisz bezpieczną frazę zamiany"
              onChange={(e) =>
                setCustomDraft((prev) => ({
                  ...prev,
                  [occurrence.id]: e.target.value,
                }))
              }
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSaveCustom(occurrence)}
            >
              Zapisz tekst zamiany
            </Button>
          </div>
        ) : null}
        {showApprove && occurrence.approvalStatus === 'pending' ? (
          <div className={styles.actions}>
            <Button
              type="button"
              disabled={!canAutoApproveOccurrence(occurrence)}
              onClick={() => handleApprove(occurrence)}
            >
              Zatwierdź
            </Button>
            {strategy !== 'AUTO_REPLACE' ? (
              <Button type="button" variant="secondary" onClick={() => handleReject(occurrence)}>
                Odrzuć
              </Button>
            ) : null}
            {strategy === 'CUSTOM_TEXT_REQUIRED' ? (
              <Button type="button" variant="secondary" onClick={() => handleIgnore(occurrence)}>
                Pomiń jako niezmienne
              </Button>
            ) : null}
          </div>
        ) : null}
        {occurrence.approvalStatus !== 'pending' ? (
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => handleRestore(occurrence)}>
              Przywróć decyzję
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className={styles.reviewPanel} data-testid="mapping-review-panel">
      <h2 className={styles.cardTitle}>Sprawdź mapowanie</h2>
      <p className={styles.muted}>
        Różnica między wartością źródłową a nową wartością ślubu jest oczekiwana i nie
        unieważnia mapowania.
      </p>
      <p>
        Gotowość mapowania:{' '}
        <strong>{mappingReadinessLabel(readiness)}</strong>
      </p>
      {hasUnresolvedOccurrences ? (
        <p className={styles.error}>
          Nie wszystkie operacje w planie renderowania są gotowe.
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={handleApproveAllAuto}>
          Zatwierdź wszystkie automatyczne
        </Button>
      </div>

      {groupedBySection.map((section) => (
        <section key={section.title} className={styles.reviewGroup}>
          <h3 className={styles.reviewGroupTitle}>{section.title}</h3>
          {section.fields.map((group) => (
            <article key={group.fieldKey} className={styles.reviewItem}>
              <div className={styles.reviewItemHeader}>
                <strong>{EXPERIMENT_FIELD_LABELS[group.fieldKey as ContractFieldKey]}</strong>
              </div>
              <p className={styles.muted}>
                Wystąpienia ({group.occurrences.length})
              </p>
              {group.occurrences.map((occurrence) => {
                const fieldDef = getFieldDefinition(occurrence.fieldKey)
                const displayStatus = deriveOccurrenceDisplayStatus(occurrence)
                return (
                  <div key={occurrence.id} className={styles.reviewOccurrence}>
                    <div className={styles.reviewItemHeader}>
                      <span>{blockKindLabel(occurrence)}</span>
                      <span className={styles.statusBadge}>
                        {displayStatusLabel(displayStatus)}
                      </span>
                      <span className={styles.muted}>
                        {replacementStrategyLabel(occurrence.replacementStrategy)}
                      </span>
                    </div>
                    <p>
                      <span className={styles.muted}>Pole: </span>
                      <strong>{EXPERIMENT_FIELD_LABELS[occurrence.fieldKey]}</strong>
                    </p>
                    <p>
                      <span className={styles.muted}>Źródło: </span>
                      <strong>{occurrence.sourceValue}</strong>
                    </p>
                    <p>
                      <span className={styles.muted}>Nowa wartość: </span>
                      <strong>{previewTargetValue(occurrence)}</strong>
                    </p>
                    <p>
                      <span className={styles.muted}>Mapowanie źródła: </span>
                      {sourceValidityLabel(occurrence)}
                    </p>
                    <p>
                      <span className={styles.muted}>Rola semantyczna: </span>
                      {semanticValidityLabel(occurrence)} ({fieldDef.logicalRole})
                    </p>
                    <p>
                      <span className={styles.muted}>Zamiana: </span>
                      {replacementReadinessLabel(occurrence)}
                    </p>
                    {occurrence.origin === 'validator' ? (
                      <p className={styles.muted}>Wykryte powiązane wystąpienie (walidator)</p>
                    ) : null}
                    {strategyActions(occurrence.replacementStrategy, occurrence)}
                  </div>
                )
              })}
            </article>
          ))}
        </section>
      ))}

      {manualField ? (
        <ManualBlockSelector
          fieldKey={manualField}
          blocks={blocks}
          onCancel={() => setManualField(null)}
          onConfirm={(blockId, exactValue) =>
            handleManualSelect({ fieldKey: manualField, blockId, exactValue })
          }
        />
      ) : null}

      <div className={styles.actions}>
        <Button type="button" disabled={!canContinue} onClick={onComplete}>
          Kontynuuj do renderowania testowego
        </Button>
        {!canContinue && readiness !== 'ready' ? (
          <span className={styles.muted}>
            Zatwierdź wszystkie wymagane operacje przed kontynuacją.
          </span>
        ) : null}
        {!canContinue && readiness === 'ready' && renderBlockedMessage ? (
          <p className={styles.error}>{renderBlockedMessage}</p>
        ) : null}
      </div>
    </div>
  )
}
