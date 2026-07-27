/**
 * Local persistence for transform comparison runs (isolated from mapping experiment).
 */

import type {
  ComparisonScorecard,
  TransformComparisonRun,
  TransformationEvaluation,
  TransformMode,
} from './types'
import { TRANSFORM_PIPELINE_SCHEMA_VERSION } from './types'

export const TRANSFORM_STORAGE_KEY = 'ourwed:ai-contract-transform:v2'
const LEGACY_STORAGE_KEYS = ['ourwed:ai-contract-transform:v1']

type StoreState = {
  schemaVersion: string
  runs: TransformComparisonRun[]
  /** Source DOCX bytes are kept in-memory only — not persisted. */
}

const docxBytesByRun = new Map<string, ArrayBuffer>()

function empty(): StoreState {
  return { schemaVersion: TRANSFORM_PIPELINE_SCHEMA_VERSION, runs: [] }
}

function clearLegacyStores(): void {
  if (typeof localStorage === 'undefined') return
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

export function readTransformStore(): StoreState {
  if (typeof localStorage === 'undefined') return empty()
  try {
    clearLegacyStores()
    const raw = localStorage.getItem(TRANSFORM_STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as StoreState
    if (parsed.schemaVersion !== TRANSFORM_PIPELINE_SCHEMA_VERSION) {
      localStorage.removeItem(TRANSFORM_STORAGE_KEY)
      if (import.meta.env?.DEV) {
        console.warn(
          '[ai-contract-transform] Cleared incompatible store — re-run required.',
        )
      }
      return empty()
    }
    // Invalidate unfinished v1-shaped runs that somehow landed in v2 store
    parsed.runs = parsed.runs.filter((run) => {
      const aOk =
        run.modeA.status !== 'running' &&
        run.modeA.promptVersion !== '2026-07-full-ai-v1'
      const bOk =
        run.modeB.status !== 'running' &&
        run.modeB.promptVersion !== '2026-07-guarded-ai-v1'
      return aOk && bOk
    })
    return parsed
  } catch {
    return empty()
  }
}

function writeStore(state: StoreState): void {
  if (typeof localStorage === 'undefined') return
  // Strip ArrayBuffers before persist
  const serializable: StoreState = {
    schemaVersion: state.schemaVersion,
    runs: state.runs.map((run) => ({
      ...run,
      modeA: { ...run.modeA, outputBytes: undefined },
      modeB: { ...run.modeB, outputBytes: undefined },
    })),
  }
  localStorage.setItem(TRANSFORM_STORAGE_KEY, JSON.stringify(serializable))
}

export function saveTransformRun(run: TransformComparisonRun): void {
  const store = readTransformStore()
  const idx = store.runs.findIndex((r) => r.runId === run.runId)
  if (idx >= 0) store.runs[idx] = run
  else store.runs.unshift(run)
  store.runs = store.runs.slice(0, 40)
  writeStore(store)
  if (run.modeA.outputBytes) {
    docxBytesByRun.set(`${run.runId}:a`, run.modeA.outputBytes)
  }
  if (run.modeB.outputBytes) {
    docxBytesByRun.set(`${run.runId}:b`, run.modeB.outputBytes)
  }
}

export function getTransformRun(runId: string): TransformComparisonRun | null {
  return readTransformStore().runs.find((r) => r.runId === runId) ?? null
}

export function getStoredDocxBytes(
  runId: string,
  mode: 'a' | 'b',
): ArrayBuffer | undefined {
  return docxBytesByRun.get(`${runId}:${mode}`)
}

export function setInMemoryDocxBytes(
  runId: string,
  mode: 'a' | 'b',
  bytes: ArrayBuffer,
): void {
  docxBytesByRun.set(`${runId}:${mode}`, bytes)
}

export function upsertEvaluation(
  runId: string,
  evaluation: TransformationEvaluation,
): TransformComparisonRun | null {
  const store = readTransformStore()
  const run = store.runs.find((r) => r.runId === runId)
  if (!run) return null
  const rest = run.evaluations.filter((e) => e.mode !== evaluation.mode)
  run.evaluations = [...rest, evaluation]
  writeStore(store)
  return run
}

export function buildComparisonScorecard(
  runs: TransformComparisonRun[],
): ComparisonScorecard {
  const modes: TransformMode[] = [
    'full_ai_trusted_rewrite',
    'guarded_ai_transform',
  ]
  const successfulDocumentsPerMode = {
    full_ai_trusted_rewrite: 0,
    guarded_ai_transform: 0,
  }
  const unexpectedSums = { ...successfulDocumentsPerMode }
  const unexpectedCounts = { ...successfulDocumentsPerMode }
  const correctionSums = { ...successfulDocumentsPerMode }
  const correctionCounts = { ...successfulDocumentsPerMode }
  const timeSums = { ...successfulDocumentsPerMode }
  const timeCounts = { ...successfulDocumentsPerMode }
  let blockedGuardedRuns = 0
  let preferA = 0
  let preferB = 0

  for (const run of runs) {
    for (const mode of modes) {
      const result = mode === 'full_ai_trusted_rewrite' ? run.modeA : run.modeB
      if (result.status === 'success' && result.downloadAvailable) {
        successfulDocumentsPerMode[mode] += 1
      }
      unexpectedSums[mode] += result.unexpectedChanges
      unexpectedCounts[mode] += 1
      if (result.durationMs != null) {
        timeSums[mode] += result.durationMs
        timeCounts[mode] += 1
      }
      const ev = run.evaluations.find((e) => e.mode === mode)
      if (ev?.manualCorrectionsCount != null) {
        correctionSums[mode] += ev.manualCorrectionsCount
        correctionCounts[mode] += 1
      }
      if (ev?.documentCorrect === true) {
        if (mode === 'full_ai_trusted_rewrite') preferA += 1
        else preferB += 1
      }
    }
    if (run.modeB.modeBVerification?.status === 'blocked') {
      blockedGuardedRuns += 1
    }
  }

  const avg = (sum: number, count: number) => (count ? sum / count : 0)

  return {
    successfulDocumentsPerMode,
    averageUnexpectedChanges: {
      full_ai_trusted_rewrite: avg(
        unexpectedSums.full_ai_trusted_rewrite,
        unexpectedCounts.full_ai_trusted_rewrite,
      ),
      guarded_ai_transform: avg(
        unexpectedSums.guarded_ai_transform,
        unexpectedCounts.guarded_ai_transform,
      ),
    },
    averageManualCorrections: {
      full_ai_trusted_rewrite: avg(
        correctionSums.full_ai_trusted_rewrite,
        correctionCounts.full_ai_trusted_rewrite,
      ),
      guarded_ai_transform: avg(
        correctionSums.guarded_ai_transform,
        correctionCounts.guarded_ai_transform,
      ),
    },
    averageProcessingTimeMs: {
      full_ai_trusted_rewrite: avg(
        timeSums.full_ai_trusted_rewrite,
        timeCounts.full_ai_trusted_rewrite,
      ),
      guarded_ai_transform: avg(
        timeSums.guarded_ai_transform,
        timeCounts.guarded_ai_transform,
      ),
    },
    blockedGuardedRuns,
    preferredMode:
      preferA === preferB
        ? null
        : preferA > preferB
          ? 'full_ai_trusted_rewrite'
          : 'guarded_ai_transform',
  }
}
