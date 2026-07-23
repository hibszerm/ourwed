import { useState } from 'react'
import {
  coverageStatusDisplayLabel,
  lossStageDisplayLabel,
} from '@/features/documents/ai/diagnostics/compareExtractionDiagnostic'
import type { ExtractionDiagnosticReport } from '@/features/documents/ai/diagnostics/types'
import styles from './ExtractionDiagnosticReport.module.css'

export function ExtractionDiagnosticPanel({
  report,
}: {
  report: ExtractionDiagnosticReport
}) {
  const [open, setOpen] = useState(true)
  const coverage = report.coverage
  const changing = report.understanding.changingInformation
  const missingNeeded = report.understanding.missingInformationNeeded
  const understandingNames = [
    ...changing.map((c) => c.name),
    ...missingNeeded
      .map((c) => c.name)
      .filter(
        (n) =>
          !changing.some(
            (c) => c.name.trim().toLowerCase() === n.trim().toLowerCase(),
          ),
      ),
  ]

  const coveredRows = report.comparisons.filter((c) =>
    ['covered', 'covered_expanded', 'covered_mapped'].includes(c.coverageStatus),
  )

  return (
    <aside className={styles.panel} data-diagnostic="extraction">
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.toggleLabel}>
          Extraction diagnostic (dev)
        </span>
        <span className={styles.toggleMeta}>
          {coverage.coveragePercent}% coverage · {coverage.missing} missing
        </span>
        <span className={styles.chevron} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open ? (
        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Coverage summary</h3>
            <p className={styles.hint}>
              Business concepts — can production regenerate the contract?
            </p>
            <dl className={styles.stats}>
              <div>
                <dt>Business concepts</dt>
                <dd>{coverage.businessConcepts}</dd>
              </div>
              <div>
                <dt>Covered</dt>
                <dd>{coverage.covered}</dd>
              </div>
              <div>
                <dt>Expanded</dt>
                <dd>{coverage.expanded}</dd>
              </div>
              <div>
                <dt>Mapped</dt>
                <dd>{coverage.mapped}</dd>
              </div>
              <div>
                <dt>Partial</dt>
                <dd>{coverage.partial}</dd>
              </div>
              <div>
                <dt>Missing</dt>
                <dd>{coverage.missing}</dd>
              </div>
              <div className={styles.statsCoverage}>
                <dt>Coverage</dt>
                <dd>{coverage.coveragePercent}%</dd>
              </div>
            </dl>
            <p className={styles.businessType}>
              Business type: {report.businessType || '—'}
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Business Understanding</h3>
            <p className={styles.hint}>Pass 1 — concepts (no registry IDs)</p>
            <ul className={styles.list}>
              {understandingNames.length === 0 ? (
                <li className={styles.empty}>No changing concepts returned</li>
              ) : (
                understandingNames.map((name) => (
                  <li key={name}>{name}</li>
                ))
              )}
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Production fields</h3>
            <p className={styles.hint}>Pass 2 — validated extraction</p>
            <ul className={styles.list}>
              {report.productionDisplayNames.length === 0 ? (
                <li className={styles.empty}>Empty production arrays</li>
              ) : (
                report.productionDisplayNames.map((name) => (
                  <li key={name}>{name}</li>
                ))
              )}
            </ul>
            <details className={styles.raw}>
              <summary>Raw validated IDs</summary>
              <pre>{JSON.stringify(report.production, null, 2)}</pre>
            </details>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Concept coverage</h3>
            <ul className={styles.missingList}>
              {report.comparisons.map((row) => (
                <li key={row.name}>
                  <span className={styles.missingName}>{row.name}</span>
                  <span className={styles.missingReason}>
                    {coverageStatusDisplayLabel(row.coverageStatus)}
                  </span>
                  {row.coveredBy.length > 0 ? (
                    <span className={styles.missingDetail}>
                      → {row.coveredBy.join(', ')}
                    </span>
                  ) : null}
                  {row.detail && row.coverageStatus === 'missing' ? (
                    <span className={styles.missingDetail}>{row.detail}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {report.missing.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Truly missing</h3>
              <p className={styles.hint}>
                Production cannot regenerate these concepts
                {report.likelyFirstLoss !== 'none'
                  ? ` · likely first loss: ${lossStageDisplayLabel(report.likelyFirstLoss)}`
                  : ''}
              </p>
              <ul className={styles.list}>
                {report.missing.map((row) => (
                  <li key={row.name}>{row.name}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.partial.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Partial</h3>
              <ul className={styles.missingList}>
                {report.partial.map((row) => (
                  <li key={row.name}>
                    <span className={styles.missingName}>{row.name}</span>
                    <span className={styles.missingDetail}>
                      {row.coveredBy.join(', ') || 'incomplete'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className={styles.raw}>
            <summary>
              Covered details ({coveredRows.length})
            </summary>
            <pre>
              {JSON.stringify(
                report.comparisons.map((c) => ({
                  name: c.name,
                  status: c.coverageStatus,
                  coveredBy: c.coveredBy,
                  detail: c.detail,
                })),
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ) : null}
    </aside>
  )
}
