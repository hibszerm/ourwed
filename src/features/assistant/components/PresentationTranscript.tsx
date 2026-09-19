/**
 * Phase 2D — intent-aware display policy over frozen Presentation Contract.
 * Phase 2F/2G — Premium Minimal presentation + collection results.
 * Phase 2H.1 — elliptical follow-up presentation intent continuity.
 * Phase 2H.2 — unified chronological mixed collection results.
 * Phase 2I — multi-turn result semantics (result vs evidence).
 * Phase 2I.1 — authoritative result membership + deterministic mixed top-K.
 */

import type { ReactNode } from 'react'
import type { TranscriptEntry } from '../v7/presentation/types'
import type { PresentationIntent } from './presentation/classifyPresentationIntent'
import { AssistantSafeText } from './presentation/AssistantSafeText'
import { buildContextCards } from './presentation/buildContextCards'
import { AssistantContextCard } from './presentation/AssistantContextCard'
import { AssistantContextAction } from './presentation/AssistantActionControl'
import { AssistantCollectionResult } from './presentation/AssistantCollectionResult'
import { derivePresentationDisplayPlan } from './presentation/derivePresentationDisplayPlan'
import { messageWithoutDuplicateCollectionList } from './presentation/suppressDuplicateCollectionList'
import { AssistantProcessingIndicator } from './AssistantProcessingIndicator'
import styles from './Assistant.module.css'

function precedingUserUtterance(
  entries: TranscriptEntry[],
  assistantIndex: number,
): string {
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    const e = entries[i]
    if (e?.role === 'user') return e.text
  }
  const assistant = entries[assistantIndex]
  if (assistant?.role === 'assistant') {
    return assistant.presentation.retryUtterance ?? ''
  }
  return ''
}

export function PresentationTranscript({
  entries,
  loading,
  onNavigate,
  onRetry,
}: {
  entries: TranscriptEntry[]
  loading: boolean
  onNavigate: (path: string) => void
  onRetry?: (utterance: string) => void
}) {
  // Single linear pass — carry effective intent for elliptical follow-ups (2H.1).
  const nodes: ReactNode[] = []
  let previousEffectiveIntent: PresentationIntent | null = null

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    if (entry.role === 'user') {
      nodes.push(
        <div
          key={entry.id}
          data-testid="assistant-transcript-user"
          data-status={entry.status}
          className={styles.userTurn}
        >
          <div className={styles.userUtterance}>{entry.text}</div>
        </div>,
      )
      continue
    }

    const { presentation } = entry
    const utterance = precedingUserUtterance(entries, index)
    const plan = derivePresentationDisplayPlan({
      utterance,
      presentationTurn: presentation,
      previousEffectiveIntent,
    })
    previousEffectiveIntent = plan.intent

    const isCollection = plan.mode === 'collection'
    const labels = plan.displayReferences
      .map((r) => r.label)
      .filter((l): l is string => Boolean(l?.trim()))
    const prose = isCollection
      ? messageWithoutDuplicateCollectionList(presentation.message, labels)
      : { text: presentation.message, suppressed: false }
    const cards = isCollection
      ? []
      : buildContextCards(plan.displayReferences)
    const addressCards = cards.filter((c) => c.kind === 'address')
    const otherCards = cards.filter((c) => c.kind !== 'address')
    const useAddressGrid = addressCards.length === 2

    nodes.push(
      <div
        key={entry.id}
        data-testid="assistant-transcript-assistant"
        data-status={entry.status}
        data-display-intent={plan.intent}
        data-display-raw-intent={plan.rawIntent}
        data-display-inherited={plan.inherited ? 'true' : 'false'}
        data-display-mode={plan.mode}
        data-phase="2i1"
        className={styles.assistantTurn}
      >
        <AssistantSafeText text={prose.text} />
        {plan.inlineActions.length > 0 ? (
          <div
            className={styles.inlineActions}
            data-testid="assistant-inline-actions"
          >
            {plan.inlineActions.map((action, i) => (
              <AssistantContextAction
                key={`inline-${action.type}-${i}`}
                action={action}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
        {isCollection ? (
          <AssistantCollectionResult
            references={plan.displayReferences}
            onNavigate={onNavigate}
          />
        ) : null}
        {cards.length > 0 ? (
          <div className={styles.contextCardStack}>
            {otherCards.map((card) => (
              <AssistantContextCard
                key={card.id}
                card={card}
                onNavigate={onNavigate}
              />
            ))}
            {useAddressGrid ? (
              <div className={styles.contextCardGrid}>
                {addressCards.map((card) => (
                  <AssistantContextCard
                    key={card.id}
                    card={card}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ) : (
              addressCards.map((card) => (
                <AssistantContextCard
                  key={card.id}
                  card={card}
                  onNavigate={onNavigate}
                />
              ))
            )}
          </div>
        ) : null}
        {presentation.status === 'error' &&
        presentation.retryUtterance &&
        onRetry ? (
          <button
            type="button"
            data-testid="assistant-presentation-retry"
            className={styles.contextAction}
            onClick={() => onRetry(presentation.retryUtterance!)}
          >
            Ponów
          </button>
        ) : null}
      </div>,
    )
  }

  return (
    <div
      className={styles.transcriptList}
      data-testid="assistant-presentation-transcript"
    >
      {nodes}
      {loading ? <AssistantProcessingIndicator /> : null}
    </div>
  )
}
