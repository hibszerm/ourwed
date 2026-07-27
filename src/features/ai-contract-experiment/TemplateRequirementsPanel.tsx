/**
 * Template requirements diagnostics UI section.
 */

import { EXPERIMENT_FIELD_LABELS } from './fieldRegistry'
import { deriveExperimentalTemplateRequirements } from './templateShapeRequirements'
import type { ExperimentRunResult } from './types'
import styles from './AiContractExperimentPage.module.css'

type Props = {
  result: ExperimentRunResult
}

export function TemplateRequirementsPanel({ result }: Props) {
  if (result.mode !== 'structured_mapping' || !result.validatedMappings) return null

  const requirements = deriveExperimentalTemplateRequirements({
    blocks: result.indexedBlocks,
    mappings: result.validatedMappings,
    response: result.structuredMapping,
  })

  const requiredKeys = [
    ...requirements.universallyRequired,
    ...requirements.conditionalRequired.map((c) => c.fieldKey),
  ]

  return (
    <section className={styles.card} data-testid="template-requirements-panel">
      <h3 className={styles.cardTitle}>Wymagania wynikające z dokumentu</h3>

      <div>
        <p className={styles.muted}>Required:</p>
        <ul>
          {requiredKeys.map((key) => (
            <li key={key}>{EXPERIMENT_FIELD_LABELS[key]}</li>
          ))}
        </ul>
      </div>

      {requirements.notPresentInTemplate.length > 0 ? (
        <div>
          <p className={styles.muted}>Not present in template:</p>
          <ul>
            {requirements.notPresentInTemplate.map((key) => (
              <li key={key}>{EXPERIMENT_FIELD_LABELS[key]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {requirements.stageLabelsOnly.length > 0 ? (
        <div>
          <p className={styles.muted}>Stage labels only:</p>
          <ul>
            {requirements.stageLabelsOnly.map((s, i) => (
              <li key={`${s.fieldKey}-${i}`}>
                {EXPERIMENT_FIELD_LABELS[s.fieldKey]}: {s.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details>
        <summary className={styles.muted}>Diagnostyka techniczna</summary>
        <pre className={styles.preview}>
          {JSON.stringify(
            requirements.conditionalRequired.map((c) => ({
              fieldKey: c.fieldKey,
              reason: c.reason,
              evidenceBlockIds: c.evidenceBlockIds,
            })),
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  )
}
