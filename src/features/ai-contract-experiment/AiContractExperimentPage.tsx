/**
 * Laboratorium umów AI — Phase 1 experiment UI.
 * Isolated from production package-contract generation.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { isAiContractLabEnabled } from '@/features/ai-contract-lab/aiContractLabFlags'
import { packageService } from '@/lib/api/packageService'
import { weddingService } from '@/lib/api/weddingService'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  buildTestDownloadFileName,
  createExperimentTemplateFromDocx,
  getRenderedDocxBytes,
  renderExperimentalMapping,
  runExperiment,
  blocksFromPlainParagraphs,
} from './experimentService'
import { canRenderExperimentDocx, TXT_ONLY_FIXTURE_MESSAGE } from './experimentDocxStorage'
import { EXPERIMENT_FIELD_LABELS } from './fieldRegistry'
import { MappingDiagnosticsPanel } from './MappingDiagnosticsPanel'
import { TemplateRequirementsPanel } from './TemplateRequirementsPanel'
import { MappingReviewPanel } from './MappingReviewPanel'
import { mappingReadinessLabel } from './mappingReadiness'
import { applyReviewMappingsUpdate } from './experimentalReviewState'
import { selectExperimentalRunViewModel } from './experimentalRunViewModel'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import type {
  AiContractExperimentMode,
  AiContractExperimentTemplate,
  ExperimentRunResult,
  IndexedDocxBlock,
} from './types'
import styles from './AiContractExperimentPage.module.css'

type ResultTab =
  | 'summary'
  | 'fields'
  | 'changes'
  | 'safety'
  | 'raw'
  | 'cost'

const FULL_AI_STAGES = [
  'Odczyt dokumentu',
  'Analiza AI',
  'Generowanie AI',
  'Porównanie treści',
  'Audyt bezpieczeństwa',
] as const

const MAPPING_STAGES = [
  'Odczyt dokumentu',
  'Przygotowanie danych',
  'Analiza OpenAI',
  'Walidacja wskazań',
  'Sprawdź mapowanie',
  'Renderowanie testowe',
  'Audyt',
] as const

function formatMetric(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'Brak danych'
  return String(value)
}

export function AiContractExperimentPage() {
  if (!isAiContractLabEnabled()) {
    return <Navigate to="/dashboard" replace />
  }
  return <ExperimentInner />
}

function ExperimentInner() {
  const userId = useStudioAuthId()
  const [packageId, setPackageId] = useState('')
  const [weddingId, setWeddingId] = useState('')
  const [template, setTemplate] = useState<AiContractExperimentTemplate | null>(
    null,
  )
  const [blocks, setBlocks] = useState<IndexedDocxBlock[]>([])
  const [mode, setMode] = useState<AiContractExperimentMode>('structured_mapping')
  const [stage, setStage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExperimentRunResult | null>(null)
  const [compareResult, setCompareResult] = useState<ExperimentRunResult | null>(
    null,
  )
  const [tab, setTab] = useState<ResultTab>('summary')
  const [lastErrorRetryable, setLastErrorRetryable] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  const packagesQuery = useQuery({
    queryKey: ['ai-contract-experiment-packages', userId],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: Boolean(userId),
  })

  const weddingsQuery = useQuery({
    queryKey: ['ai-contract-experiment-weddings', userId],
    queryFn: () => weddingService.getAll(),
    enabled: Boolean(userId),
  })

  const packages = packagesQuery.data ?? []
  const weddings = useMemo(() => {
    const all = weddingsQuery.data ?? []
    if (!packageId) return all
    return all.filter((w) => w.packageId === packageId)
  }, [weddingsQuery.data, packageId])

  const selectedWedding = weddings.find((w) => w.id === weddingId) ?? null
  const selectedPackage = packages.find((p) => p.id === packageId) ?? null

  const normalizedPreview = useMemo(() => {
    if (!selectedWedding || !selectedPackage) return null
    const clients = [
      selectedWedding.couple.partner1,
      selectedWedding.couple.partner2,
    ]
      .filter(Boolean)
      .join(' i ')
    return [
      `Pakiet: ${selectedPackage.name}`,
      `Ślub: ${getWeddingDisplayName(selectedWedding)}`,
      `Data: ${selectedWedding.date ?? '—'}`,
      `Klienci: ${clients || '—'}`,
      `Przyjęcie: ${selectedWedding.receptionLocation ?? '—'}`,
    ].join('\n')
  }, [selectedWedding, selectedPackage])

  async function handleUpload(file: File | null) {
    setError(null)
    setResult(null)
    if (!file) return
    if (!packageId) {
      setError('Najpierw wybierz pakiet — szablon musi być do niego przypisany.')
      return
    }
    try {
      setBusy(true)
      const bytes = await file.arrayBuffer()
      const created = await createExperimentTemplateFromDocx({
        packageId,
        fileName: file.name,
        bytes,
      })
      setTemplate(created.template)
      setBlocks(created.blocks)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function loadNowiccyFixture() {
    setError(null)
    setResult(null)
    if (!packageId) {
      setError('Najpierw wybierz pakiet — szablon musi być do niego przypisany.')
      return
    }
    const fixtureBlocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
    const tpl: AiContractExperimentTemplate = {
      id: `exp-tpl-nowiccy-${Date.now()}`,
      packageId,
      sourceDocumentId: `exp-src-nowiccy-${Date.now()}`,
      sourceFileName: 'nowiccy-video-fixture.txt',
      uploadedAt: new Date().toISOString(),
      analysisStatus: 'completed',
      hasSourceDocx: false,
    }
    setTemplate(tpl)
    setBlocks(fixtureBlocks)
  }

  async function handleRun(isRetry = false) {
    setError(null)
    setLastErrorRetryable(false)
    if (!template || !selectedWedding || !selectedPackage || blocks.length === 0) {
      setError('Uzupełnij pakiet, umowę testową i ślub.')
      return
    }
    if (busy && !isRetry) return
    const runId = `run-${Date.now()}`
    setActiveRunId(runId)
    try {
      setBusy(true)
      setStage('Odczyt dokumentu')
      const next = await runExperiment({
        mode,
        template,
        blocks,
        wedding: selectedWedding,
        package: selectedPackage,
        onStage: (s) => {
          setStage(s)
        },
      })
      if (result && result.mode !== next.mode) {
        setCompareResult(result)
      }
      setResult(next)
      setTab('summary')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLastErrorRetryable(
        /limit|timeout|ponownie|sieć|network/i.test(msg),
      )
    } finally {
      setBusy(false)
      setActiveRunId(null)
    }
  }

  const docxEligibility = useMemo(() => {
    if (!template) return { ok: false as const, message: TXT_ONLY_FIXTURE_MESSAGE }
    return canRenderExperimentDocx({
      templateId: template.id,
      fileName: template.sourceFileName,
    })
  }, [template])

  const viewModel = useMemo(() => {
    if (!result) return null
    return selectExperimentalRunViewModel({
      result,
      sourceDocxAvailable: docxEligibility.ok,
    })
  }, [result, docxEligibility.ok])

  function handleDownloadRendered() {
    if (!result) return
    const bytes = getRenderedDocxBytes(result.run.id)
    if (!bytes) return
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = buildTestDownloadFileName(result.generationInput)
    a.click()
    URL.revokeObjectURL(url)
  }

  const stages = mode === 'full_ai' ? FULL_AI_STAGES : MAPPING_STAGES

  return (
    <AppLayout>
      <PageContainer>
        <div className={styles.page} data-testid="ai-contract-experiment-page">
          <div className={styles.warning} role="status">
            <p className={styles.warningTitle}>Narzędzie testowe</p>
            <p className={styles.warningBody}>
              Narzędzie testowe. Wyniki nie są zapisywane jako oficjalne umowy
              ślubne.
            </p>
            {mode === 'structured_mapping' ? (
              <p className={styles.warningBody}>
                Dokument jest przesyłany do OpenAI wyłącznie w celu testowej
                analizy pól.
              </p>
            ) : null}
          </div>

          <header className={styles.header}>
            <h1 className={styles.title}>Laboratorium umów AI</h1>
            <span className={styles.badge}>Eksperyment</span>
          </header>
          <p className={styles.lede}>
            Porównaj dwie strategie na tym samym dokumencie źródłowym i tych
            samych danych ślubu: pełne generowanie AI oraz mapowanie pól z
            deterministycznym rendererem.
          </p>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Konfiguracja eksperymentu</h2>
            <div className={styles.grid2}>
              <label className={styles.label}>
                Pakiet
                <Select
                  value={packageId}
                  onChange={(e) => {
                    setPackageId(e.target.value)
                    setWeddingId('')
                    setTemplate(null)
                    setBlocks([])
                    setResult(null)
                  }}
                >
                  <option value="">Wybierz pakiet</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={styles.label}>
                Ślub (ten sam pakiet)
                <Select
                  value={weddingId}
                  onChange={(e) => setWeddingId(e.target.value)}
                  disabled={!packageId}
                >
                  <option value="">Wybierz ślub</option>
                  {weddings.map((w) => (
                    <option key={w.id} value={w.id}>
                      {getWeddingDisplayName(w)} —{' '}
                      {w.date ?? 'bez daty'}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={styles.label}>
                Umowa testowa (DOCX)
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={!packageId || busy}
                  onChange={(e) => {
                    void handleUpload(e.target.files?.[0] ?? null)
                  }}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                disabled={!packageId || busy}
                onClick={loadNowiccyFixture}
              >
                Załaduj fixture Nowiccy
              </Button>
              {template ? (
                <span className={styles.muted}>
                  {template.sourceFileName} · {blocks.length} bloków · pakiet{' '}
                  {template.packageId.slice(0, 8)}…
                </span>
              ) : null}
            </div>
            {normalizedPreview ? (
              <pre className={styles.preview}>{normalizedPreview}</pre>
            ) : (
              <p className={styles.muted}>
                Podgląd znormalizowanych danych pojawi się po wyborze pakietu i
                ślubu.
              </p>
            )}
          </section>

          <section className={styles.strategyGrid}>
            <button
              type="button"
              className={`${styles.strategy} ${mode === 'full_ai' ? styles.strategyActive : ''}`}
              onClick={() => setMode('full_ai')}
            >
              <div className={styles.strategyHeader}>
                <h3 className={styles.strategyTitle}>Pełne AI</h3>
                <span className={styles.modeBadgeMock}>Mock — pełne AI</span>
              </div>
              <p className={styles.strategyBody}>
                Analiza źródła, potem generowanie całej umowy przez AI (mock).
                Integracja na żywo w kolejnym etapie. Wynik wymaga pełnego audytu
                treści.
              </p>
            </button>
            <button
              type="button"
              className={`${styles.strategy} ${mode === 'structured_mapping' ? styles.strategyActive : ''}`}
              onClick={() => setMode('structured_mapping')}
            >
              <div className={styles.strategyHeader}>
                <h3 className={styles.strategyTitle}>AI Mapping</h3>
                <span className={styles.modeBadgeLive}>OpenAI — analiza na żywo</span>
              </div>
              <p className={styles.strategyBody}>
                AI zwraca tylko strukturę pól. Aplikacja waliduje wskazania i
                renderuje dokument deterministycznie — bez przepisywania tekstu
                przez model.
              </p>
            </button>
          </section>

          <section className={styles.card}>
            <div className={styles.actions}>
              <Button
                type="button"
                disabled={busy || !template || !weddingId}
                onClick={() => void handleRun()}
              >
                {busy
                  ? mode === 'structured_mapping' &&
                    stage === 'Analiza OpenAI'
                    ? 'OpenAI analizuje strukturę dokumentu…'
                    : 'Trwa eksperyment…'
                  : 'Uruchom eksperyment'}
              </Button>
              {lastErrorRetryable ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleRun(true)}
                >
                  Spróbuj ponownie
                </Button>
              ) : null}
              {activeRunId ? (
                <span className={styles.muted}>Run: {activeRunId.slice(0, 12)}…</span>
              ) : null}
            </div>
            <ol className={styles.stages} aria-label="Etapy eksperymentu">
              {stages.map((s) => (
                <li
                  key={s}
                  className={`${styles.stage} ${stage === s ? styles.stageActive : ''}`}
                >
                  {s}
                </li>
              ))}
            </ol>
            {error ? <p className={styles.error}>{error}</p> : null}
          </section>

          {blocks.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Indeks dokumentu</h2>
              <div className={styles.blockList}>
                {blocks.slice(0, 40).map((b) => (
                  <div key={b.id} className={styles.blockItem}>
                    <p className={styles.blockMeta}>
                      {b.id}
                      {b.kind === 'tableCell'
                        ? ` · tabela ${b.tableIndex} r${b.rowIndex} c${b.cellIndex}`
                        : ''}
                    </p>
                    {b.text || <span className={styles.muted}>(pusty)</span>}
                  </div>
                ))}
                {blocks.length > 40 ? (
                  <p className={styles.muted}>
                    …oraz {blocks.length - 40} kolejnych bloków
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {viewModel &&
          result &&
          result.mode === 'structured_mapping' &&
          result.mappingPhase === 'review' &&
          selectedWedding &&
          selectedPackage ? (
            <MappingReviewPanel
              experimentRunId={result.run.id}
              mappings={viewModel.mappings}
              blocks={result.indexedBlocks}
              generationInput={result.generationInput}
              readiness={viewModel.readiness}
              renderEligibility={viewModel.renderEligibility}
              renderBlockedMessage={
                docxEligibility.ok
                  ? undefined
                  : 'Załaduj ponownie źródłowy DOCX, aby kontynuować renderowanie.'
              }
              onChange={(validatedMappings) => {
                setResult((prev) =>
                  prev
                    ? applyReviewMappingsUpdate(prev, validatedMappings, {
                        sourceDocxAvailable: docxEligibility.ok,
                      })
                    : prev,
                )
              }}
              onComplete={() => {
                void (async () => {
                  if (!template || !result?.validatedMappings) return
                  setBusy(true)
                  setStage('Renderowanie testowe')
                  try {
                    const next = await renderExperimentalMapping({
                      result,
                      template,
                      validatedMappings: result.validatedMappings,
                    })
                    setStage('Audyt')
                    setResult(next)
                    setTab('summary')
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            />
          ) : null}

          {result ? <MappingDiagnosticsPanel result={result} /> : null}
          {result ? <TemplateRequirementsPanel result={result} /> : null}

          {result ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Wyniki</h2>
              <div className={styles.tabs}>
                {(
                  [
                    ['summary', 'Podsumowanie'],
                    ['fields', 'Wykryte pola'],
                    ['changes', 'Podgląd zmian'],
                    ['safety', 'Bezpieczeństwo'],
                    ['raw', 'Surowa odpowiedź'],
                    ['cost', 'Koszt i czas'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'summary' ? (
                <div>
                  <p>
                    Tryb:{' '}
                    <strong>
                      {result.mode === 'full_ai' ? 'Pełne AI' : 'AI Mapping'}
                    </strong>
                  </p>
                  <p>
                    Status żądania:{' '}
                    <span
                      className={
                        result.run.status === 'completed'
                          ? styles.statusSafe
                          : styles.statusCritical
                      }
                    >
                      {result.run.status}
                    </span>
                  </p>
                  {result.mode === 'structured_mapping' && viewModel ? (
                    <p>
                      Gotowość mapowania:{' '}
                      <span
                        className={
                          viewModel.readiness === 'ready'
                            ? styles.statusSafe
                            : viewModel.readiness === 'needs_review'
                              ? styles.statusWarn
                              : styles.statusCritical
                        }
                      >
                        {mappingReadinessLabel(viewModel.readiness)}
                      </span>
                    </p>
                  ) : null}
                  {result.mode === 'structured_mapping' ? (
                    <>
                      <p>
                        Renderowanie:{' '}
                        <span
                          className={
                            result.mappingPhase === 'rendered'
                              ? styles.statusSafe
                              : styles.statusWarn
                          }
                        >
                          {result.mappingPhase === 'rendered'
                            ? 'Zakończone'
                            : 'Oczekuje'}
                        </span>
                      </p>
                      {result.renderAudit ? (
                        <p>
                          Audyt:{' '}
                          <span
                            className={
                              result.renderAudit.status === 'safe'
                                ? styles.statusSafe
                                : result.renderAudit.status === 'warning'
                                  ? styles.statusWarn
                                  : styles.statusCritical
                            }
                          >
                            {result.renderAudit.status === 'safe'
                              ? 'Bezpieczne'
                              : result.renderAudit.status === 'warning'
                                ? 'Ostrzeżenie'
                                : 'Krytyczne'}
                          </span>
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <p className={styles.muted}>
                    Propozycje AI:{' '}
                    {result.structuredMapping?.fields.length ??
                      viewModel?.mappings.length ??
                      result.validatedMappings?.length ??
                      0}{' '}
                    · zatwierdzone mapowania:{' '}
                    {viewModel?.counts.approved ??
                      result.metrics.approvedMappings ??
                      0}{' '}
                    ·{' '}
                    {result.mappingPhase === 'rendered'
                      ? `wykonane operacje renderera: ${viewModel?.counts.executedRendererOperations ?? result.metrics.rendererOperations}`
                      : `zaplanowane operacje renderera: ${viewModel?.counts.plannedRendererOperations ?? result.metrics.plannedRendererOperations ?? 0}`}{' '}
                    · zmienione akapity: {result.metrics.replacedParagraphs ?? 0} ·
                    sprawdzone bloki: {result.metrics.immutableBlocksChecked ?? 0} ·
                    problemy audytu: {result.metrics.auditIssues ?? 0}
                  </p>
                  {result.mappingMetadata ? (
                    <p className={styles.muted}>
                      OpenAI: {result.mappingMetadata.durationMs} ms
                      {result.mappingMetadata.inputTokens
                        ? ` · ${result.mappingMetadata.inputTokens} tok. wej.`
                        : ''}
                      {result.renderDurationMs
                        ? ` · render: ${result.renderDurationMs} ms`
                        : ''}
                    </p>
                  ) : null}
                  {result.renderedDocxAvailable &&
                  result.renderAudit &&
                  result.renderAudit.status !== 'critical' ? (
                    <div className={styles.actions}>
                      <p className={styles.muted}>
                        Wynik eksperymentalny — nie jest oficjalną umową ślubną.
                      </p>
                      <Button type="button" onClick={handleDownloadRendered}>
                        Pobierz wynik testowy
                      </Button>
                    </div>
                  ) : null}
                  {result.renderAudit?.status === 'critical' ? (
                    <div className={styles.error}>
                      <p>Pobieranie zablokowane — audyt krytyczny.</p>
                      <ul>
                        {result.renderAudit.issues
                          .filter((i) => i.severity === 'critical')
                          .map((i, idx) => (
                            <li key={idx}>{i.message}</li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                  {compareResult ? (
                    <pre className={styles.preview}>
                      {`Porównanie z poprzednim runem (${compareResult.mode}):
status ${compareResult.run.status} → ${result.run.status}
pola wymagane ${compareResult.metrics.requiredFieldsDetected} → ${result.metrics.requiredFieldsDetected}
nieautoryzowane zmiany ${compareResult.metrics.unauthorizedChanges} → ${result.metrics.unauthorizedChanges}
czas ${formatMetric(compareResult.metrics.totalDurationMs)} → ${formatMetric(result.metrics.totalDurationMs)} ms`}
                    </pre>
                  ) : null}
                </div>
              ) : null}

              {tab === 'fields' ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Pole</th>
                      <th>Tekst źródłowy</th>
                      <th>Status</th>
                      <th>Pewność</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.validatedMappings?.map((m, i) => (
                      <tr key={`${m.fieldKey}-${i}`}>
                        <td>{EXPERIMENT_FIELD_LABELS[m.fieldKey]}</td>
                        <td>{m.sourceText}</td>
                        <td>
                          {m.validationStatus}
                          {m.approvalStatus !== 'pending'
                            ? ` / ${m.approvalStatus}`
                            : ''}
                        </td>
                        <td>
                          {typeof m.confidence === 'string'
                            ? m.confidence
                            : Math.round((m.confidenceScore ?? 0) * 100) + '%'}
                        </td>
                      </tr>
                    )) ??
                      result.fullAiAnalysis?.detectedFields.map((f, i) => (
                        <tr key={`${f.fieldKey}-${i}`}>
                          <td>{EXPERIMENT_FIELD_LABELS[f.fieldKey]}</td>
                          <td>{f.sourceText}</td>
                          <td>detected</td>
                          <td>{Math.round(f.confidence * 100)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : null}

              {tab === 'changes' ? (
                <div>
                  {result.renderChanges?.length ? (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Pole</th>
                          <th>Źródło</th>
                          <th>Wynik</th>
                          <th>Akapitu</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.renderChanges.map((c, i) => (
                          <tr key={`${c.fieldKey}-${i}`}>
                            <td>{EXPERIMENT_FIELD_LABELS[c.fieldKey]}</td>
                            <td>{c.sourceValue}</td>
                            <td>{c.replacementValue}</td>
                            <td>{c.paragraphIndex}</td>
                            <td>{c.applied ? 'zastosowano' : 'pominięto'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className={styles.muted}>
                      Podgląd zmian pojawi się po renderowaniu testowym.
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'safety' ? (
                <div>
                  {result.renderAudit ? (
                    <>
                      <p
                        className={
                          result.renderAudit.status === 'safe'
                            ? styles.statusSafe
                            : result.renderAudit.status === 'warning'
                              ? styles.statusWarn
                              : styles.statusCritical
                        }
                      >
                        {result.renderAudit.status}
                      </p>
                      <pre className={styles.preview}>
                        {JSON.stringify(result.renderAudit, null, 2)}
                      </pre>
                    </>
                  ) : null}
                  {result.fullAiSafety ? (
                    <>
                      <p
                        className={
                          result.fullAiSafety.status === 'safe'
                            ? styles.statusSafe
                            : result.fullAiSafety.status === 'warning'
                              ? styles.statusWarn
                              : styles.statusCritical
                        }
                      >
                        {result.fullAiSafety.status}
                      </p>
                      <p className={styles.muted}>
                        Dozwolone: {result.fullAiSafety.allowedChangeCount} ·
                        niedozwolone:{' '}
                        {result.fullAiSafety.unauthorizedChangeCount} · usunięte:{' '}
                        {result.fullAiSafety.removedBlockCount} · dodane:{' '}
                        {result.fullAiSafety.addedBlockCount}
                      </p>
                      <ul>
                        {result.fullAiSafety.issues.map((issue, i) => (
                          <li key={i}>
                            {issue.code}: {issue.message}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className={styles.muted}>
                      Tryb AI Mapping nie przepisuje treści — audyt immutable
                      dotyczy Mode A.
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'raw' ? (
                <pre className={styles.preview}>
                  {JSON.stringify(result.rawResponse, null, 2)}
                </pre>
              ) : null}

              {tab === 'cost' ? (
                <div>
                  <p>
                    Liczba requestów:{' '}
                    {formatMetric(result.metrics.requestCount)}
                  </p>
                  <p>
                    Czas całkowity:{' '}
                    {formatMetric(result.metrics.totalDurationMs)} ms
                  </p>
                  <p>
                    Model: {formatMetric(result.mappingMetadata?.model)}
                  </p>
                  <p>
                    Tokeny wejścia:{' '}
                    {formatMetric(result.mappingMetadata?.inputTokens)}
                  </p>
                  <p>
                    Tokeny wyjścia:{' '}
                    {formatMetric(result.mappingMetadata?.outputTokens)}
                  </p>
                  <p>Koszt: Brak danych o koszcie</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </PageContainer>
    </AppLayout>
  )
}
