/**
 * Side-by-side AI contract transformation comparison lab.
 * Isolated from semantic mapping experiment.
 */

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { packageService } from '@/lib/api/packageService'
import { weddingService } from '@/lib/api/weddingService'
import { isAiContractLabEnabled, isContractAiDebugModesEnabled } from '@/features/ai-contract-lab/aiContractLabFlags'
import { ExperimentalPdfActions } from '@/features/documents/contract-experience'
import { downloadFileName } from './docxTransformWriter'
import { indexDocxForTransform } from './indexDocxForTransform'
import { isAllowedChange } from './changeClassifier'
import {
  buildComparisonScorecard,
  getStoredDocxBytes,
  readTransformStore,
  upsertEvaluation,
} from './transformStorage'
import {
  createComparisonRunShell,
  runBothTransformModes,
  applyLocalModeA,
} from './transformService'
import { runFullAiRewrite } from './transformApi'
import { buildProtectedContractData, protectedDataSummary } from './protectedContractData'
import { buildContractTransformationDataset } from './transformationDataset'
import type {
  ContractTransformationDataset,
  TransformComparisonRun,
  TransformDocumentBlock,
  TransformMode,
  TransformationEvaluation,
} from './types'
import type { DocumentQualityReport, QualityIssue } from './quality/types'
import styles from './TransformComparisonPage.module.css'

function downloadBytes(bytes: ArrayBuffer, fileName: string) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function newRunId(): string {
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function TransformComparisonPage() {
  const [fileName, setFileName] = useState<string>('')
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null)
  const [blocks, setBlocks] = useState<TransformDocumentBlock[]>([])
  const [weddingId, setWeddingId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [dataset, setDataset] = useState<ContractTransformationDataset | null>(
    null,
  )
  const [run, setRun] = useState<TransformComparisonRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<TransformMode | null>(null)

  const weddingsQuery = useQuery({
    queryKey: ['transform-lab-weddings'],
    queryFn: () => weddingService.getAll(),
  })
  const packagesQuery = useQuery({
    queryKey: ['transform-lab-packages'],
    queryFn: () => packageService.list({ activeOnly: true }),
  })

  if (!isAiContractLabEnabled()) {
    return (
      <div className={styles.page}>
        <p>Laboratorium AI jest wyłączone (VITE_ENABLE_AI_CONTRACT_LAB).</p>
      </div>
    )
  }

  const scorecard = buildComparisonScorecard(readTransformStore().runs)

  async function onUpload(file: File | null) {
    if (!file) return
    setError(null)
    setRun(null)
    setDiffMode(null)
    try {
      const bytes = await file.arrayBuffer()
      const indexed = await indexDocxForTransform(bytes)
      setSourceBytes(bytes)
      setBlocks(indexed)
      setFileName(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się odczytać DOCX')
    }
  }

  function resolveDataset() {
    setError(null)
    const wedding = weddingsQuery.data?.find((w) => w.id === weddingId)
    const pkg = packagesQuery.data?.find((p) => p.id === packageId)
    if (!wedding || !pkg) {
      setError('Wybierz ślub i pakiet')
      return
    }
    try {
      const built = buildContractTransformationDataset({
        wedding,
        package: { id: pkg.id, name: pkg.name },
      })
      setDataset(built)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd danych ślubu')
    }
  }

  async function onRunBoth() {
    if (!sourceBytes || !dataset || blocks.length === 0) return
    setBusy(true)
    setError(null)
    setDiffMode(null)
    const shell = createComparisonRunShell({
      runId: newRunId(),
      sourceFileName: fileName,
      blocks,
      dataset,
    })
    const runningShell: TransformComparisonRun = {
      ...shell,
      modeA: { ...shell.modeA, status: 'running' },
      modeB: isContractAiDebugModesEnabled()
        ? { ...shell.modeB, status: 'running' }
        : { ...shell.modeB, status: 'idle' },
    }
    setRun(runningShell)
    try {
      if (!isContractAiDebugModesEnabled()) {
        const protectedData = buildProtectedContractData({
          blocks,
          blockTexts: blocks.map((b) => b.text),
        })
        const result = await runFullAiRewrite({
          runId: runningShell.runId,
          documentBlocks: blocks,
          transformationDataset: dataset,
          protectedDataSummary: protectedDataSummary(protectedData),
        })
        if (!result.ok) {
          setRun({
            ...runningShell,
            modeA: {
              ...runningShell.modeA,
              status: 'error',
              errorMessage: result.error.message,
              downloadAvailable: false,
            },
          })
        } else {
          setRun(
            await applyLocalModeA({
              run: runningShell,
              sourceBytes,
              sourceBlocks: blocks,
              transformedBlocks: result.transformedBlocks,
              dataset,
              durationMs: result.durationMs,
              model: result.model,
              responseVersion: result.responseVersion,
              responseSizeDiagnostics: result.responseSizeDiagnostics,
            }),
          )
        }
      } else {
        const finished = await runBothTransformModes({
          run: runningShell,
          sourceBytes,
          sourceBlocks: blocks,
          dataset,
        })
        setRun(finished)
      }
      } catch (e) {
      // Modes should already be terminal inside runBothTransformModes;
      // keep page-level note only as last resort.
      setError(e instanceof Error ? e.message : 'Uruchomienie nie powiodło się')
      setRun((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          modeA:
            prev.modeA.status === 'running'
              ? {
                  ...prev.modeA,
                  status: 'error',
                  errorCode: 'unknown_error',
                  errorMessage:
                    e instanceof Error ? e.message : String(e),
                }
              : prev.modeA,
          modeB:
            prev.modeB.status === 'running'
              ? {
                  ...prev.modeB,
                  status: 'error',
                  errorCode: 'unknown_error',
                  errorMessage:
                    e instanceof Error ? e.message : String(e),
                }
              : prev.modeB,
        }
      })
    } finally {
      setBusy(false)
    }
  }

  function markEvaluation(
    mode: TransformMode,
    documentCorrect: true | false,
  ) {
    if (!run) return
    const evaluation: TransformationEvaluation = {
      runId: run.runId,
      mode,
      documentCorrect,
      preservedFormatting: null,
      changedOnlyExpectedData: null,
      grammaticalQuality: null,
      updatedAt: new Date().toISOString(),
    }
    const updated = upsertEvaluation(run.runId, evaluation)
    if (updated) setRun({ ...updated })
  }

  function downloadMode(which: 'a' | 'b') {
    if (!run) return
    const bytes =
      getStoredDocxBytes(run.runId, which) ||
      (which === 'a' ? run.modeA.outputBytes : run.modeB.outputBytes)
    if (!bytes) return
    downloadBytes(
      bytes,
      downloadFileName(fileName || 'umowa', which === 'a' ? 'full-ai' : 'guarded-ai'),
    )
  }

  function modeDocxBytes(which: 'a' | 'b'): ArrayBuffer | null {
    if (!run) return null
    return (
      getStoredDocxBytes(run.runId, which) ||
      (which === 'a' ? run.modeA.outputBytes : run.modeB.outputBytes) ||
      null
    )
  }

  const debugModes = isContractAiDebugModesEnabled()
  const bothFinished =
    run != null &&
    run.modeA.status !== 'running' &&
    run.modeA.status !== 'idle' &&
    (debugModes
      ? run.modeB.status !== 'running' && run.modeB.status !== 'idle'
      : true)
  const step =
    !sourceBytes ? 1 : !dataset ? 2 : busy || (run && !bothFinished) ? 3 : 4

  const buttonLabel = busy
    ? 'Trwa generowanie…'
    : debugModes
      ? 'Uruchom Pełne AI + AI z kontrolą'
      : 'Uruchom transformację AI'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Porównanie generowania umowy przez AI</h1>
        <p>
          {debugModes
            ? 'Uruchom dwa niezależne sposoby przekształcenia tej samej umowy i porównaj wyniki.'
            : 'Uruchom transformację AI (Full AI). Tryby debugowania Guarded AI włączysz flagą VITE_ENABLE_CONTRACT_AI_DEBUG_MODES.'}
        </p>
        <p className={styles.meta}>
          <Link to="/laboratorium-umow-ai">← Laboratorium mapowania</Link>
        </p>
      </header>

      <ol className={styles.steps}>
        <li className={`${styles.step} ${step === 1 ? styles.stepActive : ''}`}>
          1. Umowa źródłowa
        </li>
        <li className={`${styles.step} ${step === 2 ? styles.stepActive : ''}`}>
          2. Dane ślubu
        </li>
        <li className={`${styles.step} ${step === 3 ? styles.stepActive : ''}`}>
          3. Uruchomienie
        </li>
        <li className={`${styles.step} ${step >= 4 ? styles.stepActive : ''}`}>
          4. Porównanie
        </li>
      </ol>

      <section className={styles.section}>
        <h2>1. Umowa źródłowa (DOCX)</h2>
        <div className={styles.row}>
          <input
            className={styles.fileInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
          {blocks.length > 0 ? (
            <span className={styles.meta}>
              {fileName} · {blocks.length} bloków
            </span>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <h2>2. Dane ślubu / pakietu</h2>
        <div className={styles.row}>
          <select
            className={styles.select}
            value={weddingId}
            onChange={(e) => setWeddingId(e.target.value)}
          >
            <option value="">Wybierz ślub…</option>
            {(weddingsQuery.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.couple?.partner1 ?? w.id}
                {w.date ? ` · ${w.date}` : ''}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            <option value="">Wybierz pakiet…</option>
            {(packagesQuery.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={resolveDataset}>
            Przygotuj dane
          </button>
        </div>
        {dataset ? (
          <p className={styles.meta}>
            Klienci: {dataset.clients.displayNames} · Data ślubu:{' '}
            {dataset.dates.weddingDate} · Wartość:{' '}
            {dataset.finances.contractValueFormatted}
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2>3. {debugModes ? 'Uruchom obie transformacje' : 'Uruchom transformację'}</h2>
        <button
          type="button"
          className={styles.btn}
          disabled={!sourceBytes || !dataset || busy}
          onClick={() => void onRunBoth()}
        >
          {buttonLabel}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      {run ? (
        <section className={styles.section}>
          <h2>4. Wyniki — run {run.runId}</h2>
          <div className={styles.columns}>
            <article className={styles.card}>
              <h3>{debugModes ? 'Pełne AI' : 'Transformacja AI'}</h3>
              <p className={styles.cardSubtitle}>
                AI tworzy nową wersję umowy. Wynik możesz pobrać niezależnie od
                ostrzeżeń.
              </p>
              <div className={styles.trustLabel}>
                Wynik AI — wymaga przeczytania całej umowy
              </div>
              <ModeStats
                status={run.modeA.status}
                durationMs={run.modeA.durationMs}
                changed={run.modeA.changedBlockCount}
                total={run.modeA.totalTextChanges}
                expected={run.modeA.expectedChanges}
                unexpected={run.modeA.unexpectedChanges}
                protectedCount={run.modeA.protectedChanges}
                structure={run.modeA.structureChanges}
                model={run.modeA.model}
                promptVersion={run.modeA.promptVersion}
                downloadAvailable={run.modeA.downloadAvailable}
                errorMessage={run.modeA.errorMessage}
                errorType={run.modeA.edgeError?.errorType}
                httpStatus={run.modeA.edgeError?.httpStatus}
              />
              {run.modeA.modeADiagnostics?.warnings.length ? (
                <ul className={styles.warnList}>
                  {run.modeA.modeADiagnostics.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {run.modeA.qualityReport ? (
                <QualityReportView report={run.modeA.qualityReport} />
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => setDiffMode('full_ai_trusted_rewrite')}
                >
                  Zobacz zmiany
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!run.modeA.downloadAvailable}
                  onClick={() => downloadMode('a')}
                >
                  Pobierz DOCX
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOk}`}
                  onClick={() => markEvaluation('full_ai_trusted_rewrite', true)}
                >
                  Oznacz: poprawny
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => markEvaluation('full_ai_trusted_rewrite', false)}
                >
                  Oznacz: niepoprawny
                </button>
              </div>
              <ExperimentalPdfActions
                compact
                docxBytes={
                  run.modeA.downloadAvailable ? modeDocxBytes('a') : null
                }
                fileName={downloadFileName(
                  fileName || 'umowa',
                  'full-ai',
                )}
                runId={`${run.runId}-a`}
              />
            </article>

            {debugModes ? (
            <article className={styles.card}>
              <h3>AI z kontrolą zmian</h3>
              <p className={styles.cardSubtitle}>
                Każda zmiana jest porównywana z dozwolonymi danymi.
              </p>
              <ModeStats
                status={run.modeB.status}
                durationMs={run.modeB.durationMs}
                changed={run.modeB.changedBlockCount}
                total={run.modeB.totalTextChanges}
                expected={run.modeB.expectedChanges}
                unexpected={run.modeB.unexpectedChanges}
                protectedCount={run.modeB.protectedChanges}
                structure={run.modeB.structureChanges}
                model={run.modeB.model}
                promptVersion={run.modeB.promptVersion}
                downloadAvailable={run.modeB.downloadAvailable}
                errorMessage={run.modeB.errorMessage}
                errorType={run.modeB.edgeError?.errorType}
                httpStatus={run.modeB.edgeError?.httpStatus}
                guardedStatus={run.modeB.modeBVerification?.status}
              />
              {run.modeB.qualityReport ? (
                <QualityReportView report={run.modeB.qualityReport} />
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => setDiffMode('guarded_ai_transform')}
                >
                  Zobacz zmiany
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => setDiffMode('guarded_ai_transform')}
                >
                  Przejrzyj ostrzeżenia
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!run.modeB.downloadAvailable}
                  onClick={() => downloadMode('b')}
                >
                  Pobierz DOCX
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOk}`}
                  onClick={() => markEvaluation('guarded_ai_transform', true)}
                >
                  Oznacz: poprawny
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => markEvaluation('guarded_ai_transform', false)}
                >
                  Oznacz: niepoprawny
                </button>
              </div>
              <ExperimentalPdfActions
                compact
                docxBytes={
                  run.modeB.downloadAvailable ? modeDocxBytes('b') : null
                }
                fileName={downloadFileName(
                  fileName || 'umowa',
                  'guarded-ai',
                )}
                runId={`${run.runId}-b`}
              />
            </article>
            ) : null}
          </div>

          {diffMode ? (
            <DiffReview
              run={run}
              mode={diffMode}
              onClose={() => setDiffMode(null)}
            />
          ) : null}

          <details className={styles.drawer}>
            <summary>Diagnostyka JSON (eksperyment)</summary>
            <pre className={styles.beforeAfter}>
              {JSON.stringify(
                {
                  runId: run.runId,
                  modeA: {
                    status: run.modeA.status,
                    qualityReport: run.modeA.qualityReport
                      ? sanitizeQualityReportForExport(run.modeA.qualityReport)
                      : null,
                    diagnostics: run.modeA.modeADiagnostics,
                    responseSize: run.modeA.responseSizeDiagnostics
                      ? {
                          incompleteReason:
                            run.modeA.responseSizeDiagnostics.incompleteReason,
                          configuredMaxOutputTokens:
                            run.modeA.responseSizeDiagnostics
                              .configuredMaxOutputTokens,
                          attemptCount:
                            run.modeA.responseSizeDiagnostics.attemptCount,
                          responseStatus:
                            run.modeA.responseSizeDiagnostics.responseStatus,
                          changedBlockCount:
                            run.modeA.responseSizeDiagnostics.changedBlockCount,
                          sourceBlockCount:
                            run.modeA.responseSizeDiagnostics.sourceBlockCount,
                          outputTokens:
                            run.modeA.responseSizeDiagnostics.outputTokens,
                          inputTokens:
                            run.modeA.responseSizeDiagnostics.inputTokens,
                        }
                      : null,
                    errorCode: run.modeA.errorCode,
                    errorMessage: run.modeA.errorMessage,
                    edgeError: run.modeA.edgeError
                      ? {
                          mode: run.modeA.edgeError.mode,
                          functionName: run.modeA.edgeError.functionName,
                          httpStatus: run.modeA.edgeError.httpStatus,
                          errorType: run.modeA.edgeError.errorType,
                          providerCode: run.modeA.edgeError.providerCode,
                          message: run.modeA.edgeError.message,
                          incompleteReason: run.modeA.edgeError.incompleteReason,
                          configuredMaxOutputTokens:
                            run.modeA.edgeError.configuredMaxOutputTokens,
                          attemptCount: run.modeA.edgeError.attemptCount,
                          responseStatus: run.modeA.edgeError.responseStatus,
                          rawResponse: run.modeA.edgeError.rawResponse,
                        }
                      : null,
                  },
                  modeB: {
                    status: run.modeB.status,
                    qualityReport: run.modeB.qualityReport
                      ? sanitizeQualityReportForExport(run.modeB.qualityReport)
                      : null,
                    verification: run.modeB.modeBVerification
                      ? {
                          status: run.modeB.modeBVerification.status,
                          blockingIssues:
                            run.modeB.modeBVerification.blockingIssues,
                          reviewIssues: run.modeB.modeBVerification.reviewIssues,
                        }
                      : null,
                    responseSize: run.modeB.responseSizeDiagnostics
                      ? {
                          incompleteReason:
                            run.modeB.responseSizeDiagnostics.incompleteReason,
                          configuredMaxOutputTokens:
                            run.modeB.responseSizeDiagnostics
                              .configuredMaxOutputTokens,
                          attemptCount:
                            run.modeB.responseSizeDiagnostics.attemptCount,
                          responseStatus:
                            run.modeB.responseSizeDiagnostics.responseStatus,
                          changedBlockCount:
                            run.modeB.responseSizeDiagnostics.changedBlockCount,
                          sourceBlockCount:
                            run.modeB.responseSizeDiagnostics.sourceBlockCount,
                          outputTokens:
                            run.modeB.responseSizeDiagnostics.outputTokens,
                          inputTokens:
                            run.modeB.responseSizeDiagnostics.inputTokens,
                        }
                      : null,
                    errorCode: run.modeB.errorCode,
                    errorMessage: run.modeB.errorMessage,
                    edgeError: run.modeB.edgeError
                      ? {
                          mode: run.modeB.edgeError.mode,
                          functionName: run.modeB.edgeError.functionName,
                          httpStatus: run.modeB.edgeError.httpStatus,
                          errorType: run.modeB.edgeError.errorType,
                          providerCode: run.modeB.edgeError.providerCode,
                          message: run.modeB.edgeError.message,
                          incompleteReason: run.modeB.edgeError.incompleteReason,
                          configuredMaxOutputTokens:
                            run.modeB.edgeError.configuredMaxOutputTokens,
                          attemptCount: run.modeB.edgeError.attemptCount,
                          responseStatus: run.modeB.edgeError.responseStatus,
                          rawResponse: run.modeB.edgeError.rawResponse,
                        }
                      : null,
                  },
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      ) : null}

      <section className={styles.section}>
        <h2>Scorecard eksperymentu</h2>
        <div className={styles.scorecard}>
          <div>
            Sukces Pełne AI
            <strong>
              {scorecard.successfulDocumentsPerMode.full_ai_trusted_rewrite}
            </strong>
          </div>
          <div>
            Sukces Guarded
            <strong>
              {scorecard.successfulDocumentsPerMode.guarded_ai_transform}
            </strong>
          </div>
          <div>
            Blokady Guarded
            <strong>{scorecard.blockedGuardedRuns}</strong>
          </div>
          <div>
            Preferowany tryb
            <strong>
              {scorecard.preferredMode === 'full_ai_trusted_rewrite'
                ? 'Pełne AI'
                : scorecard.preferredMode === 'guarded_ai_transform'
                  ? 'Guarded'
                  : '—'}
            </strong>
          </div>
        </div>
      </section>
    </div>
  )
}

function lifecycleLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'running':
      return 'Running'
    case 'success':
      return 'Success'
    case 'error':
      return 'Error'
    default:
      return status
  }
}

function sanitizeQualityReportForExport(report: DocumentQualityReport) {
  return {
    completeness: {
      status: report.completeness.status,
      requiredFieldCount: report.completeness.requiredFieldCount,
      satisfiedFieldCount: report.completeness.satisfiedFieldCount,
      missingFields: report.completeness.missingFields,
      staleSourceValues: report.completeness.staleSourceValues,
      partialApplications: report.completeness.partialApplications,
      mixedSourceTargetFields: report.completeness.mixedSourceTargetFields,
    },
    protection: {
      status: report.protection.status,
      changedProtectedFields: report.protection.changedProtectedFields,
    },
    financialConsistency: {
      status: report.financialConsistency.status,
      totalPriceMatches: report.financialConsistency.totalPriceMatches,
      moneyWordsMatch: report.financialConsistency.moneyWordsMatch,
      depositMatches: report.financialConsistency.depositMatches,
      remainingMatches: report.financialConsistency.remainingMatches,
      paymentStructureMatches:
        report.financialConsistency.paymentStructureMatches,
      issueCodes: report.financialConsistency.issues.map((i) => i.code),
    },
    locationConsistency: {
      status: report.locationConsistency.status,
      suppliedRoles: report.locationConsistency.suppliedRoles,
      representedRoles: report.locationConsistency.representedRoles,
      missingRoles: report.locationConsistency.missingRoles,
      grammarIssueBlockIds: report.locationConsistency.grammarIssues,
      staleLocationCount: report.locationConsistency.staleLocations.length,
    },
    businessConsistency: {
      referenceCodes:
        report.businessConsistency.referenceNumberIssues.map((i) => i.code),
      packageCodes:
        report.businessConsistency.packageScopeIssues.map((i) => i.code),
    },
    repairCodes: report.repairs.map((r) => r.repairCode),
    blocking: report.blockingIssues.map(issueExport),
    review: report.reviewIssues.map(issueExport),
    warnings: report.warnings.map(issueExport),
  }
}

function issueExport(i: QualityIssue) {
  return {
    severity: i.severity,
    code: i.code,
    canonicalField: i.canonicalField,
    blockId: i.blockId,
    safeDescription: i.safeDescription,
  }
}

function IssueList({ title, issues }: { title: string; issues: QualityIssue[] }) {
  if (!issues.length) return null
  return (
    <div className={styles.qualityGroup}>
      <h5>{title}</h5>
      <ul className={styles.qualityIssues}>
        {issues.map((i, idx) => (
          <li key={`${i.code}-${i.blockId ?? ''}-${idx}`}>
            <span className={styles.severity}>{i.severity}</span> {i.code}
            {i.canonicalField ? ` · ${i.canonicalField}` : ''}
            {i.blockId ? ` · ${i.blockId}` : ''}
            <div className={styles.issueDesc}>{i.safeDescription}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function QualityReportView({ report }: { report: DocumentQualityReport }) {
  const c = report.completeness
  const f = report.financialConsistency
  const l = report.locationConsistency
  return (
    <details className={styles.qualityReport}>
      <summary>
        Raport jakości — {c.status} / finanse {f.status}
      </summary>
      <div className={styles.qualitySections}>
        <section>
          <h4>COMPLETENESS</h4>
          <ul className={styles.qualityMeta}>
            <li>
              Stare wartości usunięte:{' '}
              {c.staleSourceValues.length === 0 ? 'tak' : `nie (${c.staleSourceValues.length})`}
            </li>
            <li>
              Pola reprezentowane: {c.satisfiedFieldCount}/{c.requiredFieldCount}
            </li>
            <li>
              Częściowe zamiany: {c.partialApplications.length || 'brak'}
            </li>
            <li>
              Mieszane stare/nowe: {c.mixedSourceTargetFields.length || 'brak'}
            </li>
          </ul>
        </section>
        <section>
          <h4>PROTECTED DATA</h4>
          <ul className={styles.qualityMeta}>
            <li>Status: {report.protection.status}</li>
            <li>
              Zmienione chronione pola:{' '}
              {report.protection.changedProtectedFields.length
                ? report.protection.changedProtectedFields.join(', ')
                : 'brak'}
            </li>
          </ul>
        </section>
        <section>
          <h4>FINANCES</h4>
          <ul className={styles.qualityMeta}>
            <li>Total: {f.totalPriceMatches ? 'ok' : 'brak'}</li>
            <li>Słownie: {f.moneyWordsMatch ? 'ok' : 'błąd'}</li>
            <li>
              Zadatek:{' '}
              {f.depositMatches == null ? 'n/d' : f.depositMatches ? 'ok' : 'brak'}
            </li>
            <li>
              Pozostała:{' '}
              {f.remainingMatches == null
                ? 'n/d'
                : f.remainingMatches
                  ? 'ok'
                  : 'brak'}
            </li>
            <li>
              Struktura płatności:{' '}
              {f.paymentStructureMatches == null
                ? 'n/d'
                : f.paymentStructureMatches
                  ? 'ok'
                  : 'błąd'}
            </li>
          </ul>
        </section>
        <section>
          <h4>LOCATIONS</h4>
          <ul className={styles.qualityMeta}>
            <li>Dostarczone: {l.suppliedRoles.join(', ') || '—'}</li>
            <li>Reprezentowane: {l.representedRoles.join(', ') || '—'}</li>
            <li>Brakujące: {l.missingRoles.join(', ') || 'brak'}</li>
            <li>Gramatyka: {l.grammarIssues.length || 'brak'}</li>
          </ul>
        </section>
        <section>
          <h4>BUSINESS REVIEW</h4>
          <ul className={styles.qualityMeta}>
            <li>
              Numer umowy:{' '}
              {report.businessConsistency.referenceNumberIssues
                .map((i) => i.code)
                .join(', ') || 'ok'}
            </li>
            <li>
              Zakres pakietu:{' '}
              {report.businessConsistency.packageScopeIssues
                .map((i) => i.code)
                .join(', ') || 'ok'}
            </li>
          </ul>
        </section>
        <IssueList title="Blocking" issues={report.blockingIssues} />
        <IssueList title="Review" issues={report.reviewIssues} />
        <IssueList title="Warnings" issues={report.warnings} />
      </div>
    </details>
  )
}

function ModeStats(props: {
  status: string
  durationMs?: number
  changed: number
  total: number
  expected: number
  unexpected: number
  protectedCount: number
  structure: number
  model?: string
  promptVersion: string
  downloadAvailable: boolean
  errorMessage?: string
  errorType?: string
  httpStatus?: number
  guardedStatus?: string
}) {
  return (
    <>
      <dl className={styles.stats}>
        <dt>Status</dt>
        <dd>{lifecycleLabel(props.status)}</dd>
        {props.guardedStatus ? (
          <>
            <dt>Weryfikacja</dt>
            <dd>{props.guardedStatus}</dd>
          </>
        ) : null}
        {props.status === 'error' && props.errorType ? (
          <>
            <dt>Typ błędu</dt>
            <dd>{props.errorType}</dd>
          </>
        ) : null}
        {props.status === 'error' && props.httpStatus != null ? (
          <>
            <dt>HTTP</dt>
            <dd>{props.httpStatus}</dd>
          </>
        ) : null}
        <dt>Czas</dt>
        <dd>{props.durationMs != null ? `${props.durationMs} ms` : '—'}</dd>
        <dt>Zmienione bloki</dt>
        <dd>{props.changed}</dd>
        <dt>Zmiany tekstu</dt>
        <dd>{props.total}</dd>
        <dt>Oczekiwane</dt>
        <dd>{props.expected}</dd>
        <dt>Nieoczekiwane</dt>
        <dd>{props.unexpected}</dd>
        <dt>Chronione</dt>
        <dd>{props.protectedCount}</dd>
        <dt>Struktura</dt>
        <dd>{props.structure}</dd>
        <dt>Pobieranie</dt>
        <dd>{props.downloadAvailable ? 'dostępne' : 'niedostępne'}</dd>
        <dt>Model</dt>
        <dd>{props.model ?? '—'}</dd>
        <dt>Prompt</dt>
        <dd>{props.promptVersion}</dd>
      </dl>
      {props.errorMessage ? (
        <p className={styles.error}>{props.errorMessage}</p>
      ) : null}
    </>
  )
}

function DiffReview(props: {
  run: TransformComparisonRun
  mode: TransformMode
  onClose: () => void
}) {
  const result =
    props.mode === 'full_ai_trusted_rewrite' ? props.run.modeA : props.run.modeB
  const diffs = result.diffs.filter((d) => d.changes.length > 0)

  return (
    <div className={styles.section} style={{ marginTop: '1rem' }}>
      <div className={styles.row}>
        <h2 style={{ margin: 0 }}>
          Zmiany —{' '}
          {props.mode === 'full_ai_trusted_rewrite' ? 'Pełne AI' : 'Guarded'}
        </h2>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecondary}`}
          onClick={props.onClose}
        >
          Zamknij
        </button>
      </div>
      {diffs.length === 0 ? (
        <p className={styles.meta}>Brak zmienionych bloków.</p>
      ) : (
        <ul className={styles.blockList}>
          {diffs.map((d) => (
            <li key={d.blockId} className={styles.blockItem}>
              <h4>Akapit {d.paragraphIndex}</h4>
              <div className={styles.beforeAfter}>
                <div>
                  <strong>Przed:</strong>
                  <pre>{d.sourceText}</pre>
                </div>
                <div>
                  <strong>Po:</strong>
                  <pre>{d.transformedText}</pre>
                </div>
              </div>
              <ul className={styles.changeList}>
                {d.changes.map((c, i) => (
                  <li
                    key={`${d.blockId}-${i}`}
                    className={
                      isAllowedChange(c)
                        ? styles.changeExpected
                        : styles.changeUnexpected
                    }
                  >
                    {c.matchedDatasetField ?? c.classification}:{' '}
                    {c.sourceText || '∅'} → {c.replacementText || '∅'} (
                    {c.severity})
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
