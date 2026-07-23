import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  BENCHMARK_FIXTURES,
  formatRecallPercent,
  runBenchmarkCase,
  runBenchmarkSuite,
  type BenchmarkCaseResult,
  type BenchmarkSuiteResult,
} from '@/features/documents/ai/evaluation'
import styles from './ContractAnalysisEval.module.css'

function IdList({ title, ids, tone }: { title: string; ids: string[]; tone?: 'bad' | 'ok' }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>
        {title} ({ids.length})
      </h3>
      {ids.length === 0 ? (
        <p className={styles.empty}>—</p>
      ) : (
        <ul className={tone === 'bad' ? styles.badList : styles.list}>
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CaseCard({ result }: { result: BenchmarkCaseResult }) {
  const fixture = BENCHMARK_FIXTURES.find((f) => f.id === result.fixtureId)
  const expectedAll = fixture
    ? [
        ...fixture.expected.couple,
        ...fixture.expected.company,
        ...fixture.expected.package,
      ]
    : []

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{result.name}</h2>
          <p className={styles.meta}>
            {result.fixtureId}
            {result.fromCache ? ' · cached' : ''}
            {' · '}
            {result.elapsedMs} ms
            {!result.ok ? ` · ERROR: ${result.error}` : ''}
          </p>
        </div>
        <div className={styles.recallBig}>
          {formatRecallPercent(result.overall.recall)}
        </div>
      </header>

      <dl className={styles.stats}>
        <div>
          <dt>Expected</dt>
          <dd>{result.overall.expected}</dd>
        </div>
        <div>
          <dt>Detected</dt>
          <dd>{result.overall.detected}</dd>
        </div>
        <div>
          <dt>Couple recall</dt>
          <dd>{formatRecallPercent(result.couple.recall)}</dd>
        </div>
        <div>
          <dt>Company recall</dt>
          <dd>{formatRecallPercent(result.company.recall)}</dd>
        </div>
        <div>
          <dt>Package recall</dt>
          <dd>{formatRecallPercent(result.package.recall)}</dd>
        </div>
      </dl>

      <div className={styles.grid}>
        <IdList title="Expected variables" ids={expectedAll} />
        <IdList
          title="Detected variables"
          ids={[
            ...result.detected.couple,
            ...result.detected.company,
            ...result.detected.package,
          ]}
        />
        <IdList title="Missing variables" ids={result.missingAll} tone="bad" />
        <IdList
          title="Unexpected variables"
          ids={result.unexpectedAll}
          tone="bad"
        />
      </div>
    </article>
  )
}

/**
 * DEV-only evaluation screen for AI Contract Analysis benchmarks.
 * Not part of production navigation unless `import.meta.env.DEV`.
 */
export function ContractAnalysisEvalPage() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [suite, setSuite] = useState<BenchmarkSuiteResult | null>(null)
  const [single, setSingle] = useState<BenchmarkCaseResult | null>(null)

  async function runAll() {
    setRunning(true)
    setSingle(null)
    setProgress('Starting…')
    try {
      const result = await runBenchmarkSuite({
        onCaseDone: (r, i, total) => {
          setProgress(`${i + 1}/${total}: ${r.fixtureId} → ${formatRecallPercent(r.overall.recall)}`)
        },
      })
      setSuite(result)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  async function runOne(id: string) {
    setRunning(true)
    setSuite(null)
    setProgress(`Running ${id}…`)
    try {
      const fixture = BENCHMARK_FIXTURES.find((f) => f.id === id)
      if (!fixture) return
      const result = await runBenchmarkCase(fixture)
      setSingle(result)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const cases = suite?.cases ?? (single ? [single] : [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>DEV only</p>
        <h1 className={styles.title}>Contract Analysis Evaluation</h1>
        <p className={styles.subtitle}>
          Golden expected vs production AI detected. Measure recall before
          changing prompts.
        </p>
      </header>

      <div className={styles.actions}>
        <Button type="button" disabled={running} onClick={() => void runAll()}>
          {running ? 'Running…' : 'Run all benchmarks'}
        </Button>
        {BENCHMARK_FIXTURES.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="ghost"
            disabled={running}
            onClick={() => void runOne(f.id)}
          >
            {f.id}
          </Button>
        ))}
      </div>

      {progress ? <p className={styles.progress}>{progress}</p> : null}

      {suite ? (
        <section className={styles.summary}>
          <h2 className={styles.summaryTitle}>Suite summary</h2>
          <dl className={styles.stats}>
            <div>
              <dt>Cases</dt>
              <dd>{suite.summary.cases}</dd>
            </div>
            <div>
              <dt>Overall recall</dt>
              <dd>{formatRecallPercent(suite.summary.overallRecall)}</dd>
            </div>
            <div>
              <dt>Couple recall</dt>
              <dd>{formatRecallPercent(suite.summary.coupleRecall)}</dd>
            </div>
            <div>
              <dt>Company recall</dt>
              <dd>{formatRecallPercent(suite.summary.companyRecall)}</dd>
            </div>
            <div>
              <dt>Package recall</dt>
              <dd>{formatRecallPercent(suite.summary.packageRecall)}</dd>
            </div>
            <div>
              <dt>Missing (total)</dt>
              <dd>{suite.summary.totalMissing}</dd>
            </div>
            <div>
              <dt>Unexpected (total)</dt>
              <dd>{suite.summary.totalUnexpected}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <div className={styles.cases}>
        {cases.map((c) => (
          <CaseCard key={c.fixtureId + c.elapsedMs} result={c} />
        ))}
      </div>

      <section className={styles.fixtures}>
        <h2 className={styles.summaryTitle}>Golden fixtures</h2>
        <ul className={styles.list}>
          {BENCHMARK_FIXTURES.map((f) => (
            <li key={f.id}>
              <strong>{f.id}</strong> — {f.name}
              {f.description ? (
                <span className={styles.meta}> — {f.description}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
