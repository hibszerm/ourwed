import { useState } from 'react'
import {
  WORKFLOW_STAGE_DESCRIPTIONS,
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGES,
} from '@/lib/utils/workflow'
import styles from './WorkflowTimeline.module.css'

export function WorkflowTimeline() {
  const [active, setActive] = useState(0)

  return (
    <ol className={styles.track}>
      {WORKFLOW_STAGES.map((stage, index) => (
        <li
          key={stage}
          className={`${styles.stage} ${active === index ? styles.stageActive : ''}`}
          onMouseEnter={() => setActive(index)}
          onFocus={() => setActive(index)}
        >
          <button
            type="button"
            className={styles.stageButton}
            onClick={() => setActive(index)}
            aria-current={active === index ? 'step' : undefined}
          >
            <div className={styles.node}>
              <span className={styles.icon} aria-hidden>
                {index + 1}
              </span>
              {index < WORKFLOW_STAGES.length - 1 ? (
                <span className={styles.connector} aria-hidden />
              ) : null}
            </div>
            <div className={styles.copy}>
              <strong>{WORKFLOW_STAGE_LABELS[stage]}</strong>
              <p>{WORKFLOW_STAGE_DESCRIPTIONS[stage]}</p>
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}
