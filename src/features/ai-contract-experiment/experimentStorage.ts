/**
 * Local mock persistence for experiment templates / runs.
 * Backend-ready shape; storage is isolated from production templates.
 */

import type {
  AiContractExperimentRun,
  AiContractExperimentTemplate,
  ExperimentRunResult,
  ExperimentStoreState,
} from './types'
import { EXPERIMENT_PIPELINE_SCHEMA_VERSION } from './types'

const STORED_SCHEMA_KEY = 'pipelineSchemaVersion'

export const EXPERIMENT_STORAGE_KEY = 'ourwed:ai-contract-experiment:v3'

function emptyState(): ExperimentStoreState {
  return { templates: [], runs: [], results: {} }
}

export function readExperimentStore(): ExperimentStoreState {
  if (typeof localStorage === 'undefined') return emptyState()
  try {
    const raw = localStorage.getItem(EXPERIMENT_STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem('ourwed:ai-contract-experiment:v2')
      if (legacy) {
        localStorage.removeItem('ourwed:ai-contract-experiment:v2')
        if (import.meta.env?.DEV) {
          console.warn(
            '[ai-contract-experiment] Cleared v2 experiment state — re-analysis required after pipeline schema bump.',
          )
        }
      }
      return emptyState()
    }
    const parsed = JSON.parse(raw) as ExperimentStoreState & {
      [STORED_SCHEMA_KEY]?: string
    }
    if (parsed[STORED_SCHEMA_KEY] !== EXPERIMENT_PIPELINE_SCHEMA_VERSION) {
      if (import.meta.env?.DEV) {
        console.warn(
          `[ai-contract-experiment] Stored schema ${parsed[STORED_SCHEMA_KEY] ?? 'unknown'} ≠ ${EXPERIMENT_PIPELINE_SCHEMA_VERSION} — mapping state invalidated.`,
        )
      }
      return emptyState()
    }
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      results:
        parsed.results && typeof parsed.results === 'object'
          ? parsed.results
          : {},
    }
  } catch {
    return emptyState()
  }
}

export function writeExperimentStore(state: ExperimentStoreState): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    EXPERIMENT_STORAGE_KEY,
    JSON.stringify({
      ...state,
      [STORED_SCHEMA_KEY]: EXPERIMENT_PIPELINE_SCHEMA_VERSION,
    }),
  )
}

export function upsertExperimentTemplate(
  template: AiContractExperimentTemplate,
): void {
  const state = readExperimentStore()
  const idx = state.templates.findIndex((t) => t.id === template.id)
  if (idx >= 0) state.templates[idx] = template
  else state.templates.push(template)
  writeExperimentStore(state)
}

export function saveExperimentRun(
  run: AiContractExperimentRun,
  result?: ExperimentRunResult,
): void {
  const state = readExperimentStore()
  const idx = state.runs.findIndex((r) => r.id === run.id)
  if (idx >= 0) state.runs[idx] = run
  else state.runs.push(run)
  if (result) state.results[run.id] = result
  writeExperimentStore(state)
}

export function listExperimentTemplatesForPackage(
  packageId: string,
): AiContractExperimentTemplate[] {
  return readExperimentStore().templates.filter((t) => t.packageId === packageId)
}

export function getExperimentResult(
  runId: string,
): ExperimentRunResult | null {
  return readExperimentStore().results[runId] ?? null
}

export function clearExperimentStore(): void {
  writeExperimentStore(emptyState())
}
