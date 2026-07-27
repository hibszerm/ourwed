/**
 * Collapsible diagnostics drawer for structured mapping runs.
 */

import { useState } from 'react'
import { EXPERIMENT_FIELD_REGISTRY } from './fieldRegistry'
import type {
  ExperimentRunResult,
  ValidatedAiMapping,
} from './types'
import styles from './AiContractExperimentPage.module.css'

type Props = {
  result: ExperimentRunResult
}

function copyJson(value: unknown) {
  void navigator.clipboard.writeText(JSON.stringify(value, null, 2))
}

export function MappingDiagnosticsPanel({ result }: Props) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<
    'request' | 'prompt' | 'raw' | 'validation' | 'metrics'
  >('request')

  if (result.mode !== 'structured_mapping') return null

  const accepted = result.validatedMappings?.filter(
    (m) => m.validationStatus === 'valid' && m.approvalStatus !== 'rejected',
  )
  const needsReview = result.validatedMappings?.filter(
    (m) => m.validationStatus === 'valid' && m.approvalStatus === 'pending',
  )
  const rejected = result.validatedMappings?.filter(
    (m) => m.validationStatus === 'rejected' || m.approvalStatus === 'rejected',
  )

  return (
    <section className={styles.card} data-testid="mapping-diagnostics">
      <button
        type="button"
        className={styles.diagnosticsToggle}
        onClick={() => setOpen((v) => !v)}
      >
        Diagnostyka {open ? '▾' : '▸'}
      </button>
      {open ? (
        <>
          <div className={styles.tabs}>
            {(
              [
                ['request', 'Dane przekazane'],
                ['prompt', 'Prompt'],
                ['raw', 'Surowa odpowiedź AI'],
                ['validation', 'Walidacja'],
                ['metrics', 'Metryki'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tab} ${section === id ? styles.tabActive : ''}`}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {section === 'request' ? (
            <div>
              <p className={styles.muted}>Klucze pól z rejestru:</p>
              <pre className={styles.preview}>
                {EXPERIMENT_FIELD_REGISTRY.map((f) => f.key).join('\n')}
              </pre>
              <pre className={styles.preview}>
                {JSON.stringify(
                  result.mappingDiagnostics?.sanitizedRequest ?? {},
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : null}

          {section === 'prompt' ? (
            <div>
              <p>Wersja promptu: {result.mappingDiagnostics?.promptVersion}</p>
              <p>
                Wersja odpowiedzi:{' '}
                {result.rawResponse &&
                typeof result.rawResponse === 'object' &&
                'responseVersion' in result.rawResponse
                  ? String(
                      (result.rawResponse as { responseVersion?: string })
                        .responseVersion,
                    )
                  : '—'}
              </p>
              <pre className={styles.preview}>
                {result.mappingDiagnostics?.systemPrompt}
              </pre>
              <pre className={styles.preview}>
                {JSON.stringify(
                  result.mappingDiagnostics?.taskPayload ?? {},
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : null}

          {section === 'raw' ? (
            <div>
              <ButtonRow onCopy={() => copyJson(result.rawResponse)} />
              <pre className={styles.preview}>
                {JSON.stringify(result.rawResponse, null, 2)}
              </pre>
            </div>
          ) : null}

          {section === 'validation' ? (
            <ValidationSection
              accepted={accepted ?? []}
              needsReview={needsReview ?? []}
              rejected={rejected ?? []}
            />
          ) : null}

          {section === 'metrics' ? (
            <div>
              <p>Model: {result.mappingMetadata?.model ?? '—'}</p>
              <p>Response ID: {result.mappingMetadata?.responseId ?? '—'}</p>
              <p>Input tokens: {result.mappingMetadata?.inputTokens ?? '—'}</p>
              <p>Output tokens: {result.mappingMetadata?.outputTokens ?? '—'}</p>
              <p>Duration: {result.mappingMetadata?.durationMs ?? '—'} ms</p>
              <p>Request count: {result.mappingMetadata?.requestCount ?? '—'}</p>
              <p>Koszt: Brak danych o koszcie</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function ButtonRow({ onCopy }: { onCopy: () => void }) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.tab} onClick={onCopy}>
        Kopiuj JSON
      </button>
    </div>
  )
}

function ValidationSection(input: {
  accepted: ValidatedAiMapping[]
  needsReview: ValidatedAiMapping[]
  rejected: ValidatedAiMapping[]
}) {
  return (
    <div className={styles.validationGrid}>
      <div>
        <h4 className={styles.reviewGroupTitle}>Zaakceptowane</h4>
        <pre className={styles.preview}>
          {JSON.stringify(input.accepted, null, 2)}
        </pre>
      </div>
      <div>
        <h4 className={styles.reviewGroupTitle}>Do przeglądu</h4>
        <pre className={styles.preview}>
          {JSON.stringify(input.needsReview, null, 2)}
        </pre>
      </div>
      <div>
        <h4 className={styles.reviewGroupTitle}>Odrzucone</h4>
        <pre className={styles.preview}>
          {JSON.stringify(input.rejected, null, 2)}
        </pre>
      </div>
    </div>
  )
}
