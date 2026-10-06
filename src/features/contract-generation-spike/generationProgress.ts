export const OPTION_B_PROGRESS_STAGES = [
  'preparing',
  'analyzing',
  'building_document',
  'verifying',
  'preparing_preview',
] as const

export type OptionBProgressStage = typeof OPTION_B_PROGRESS_STAGES[number]

export type OptionBProgressRow = {
  session_state: string | null
  generation_status: string | null
  progress_stage: string | null
  updated_at: string | null
}

export const OPTION_B_PROGRESS_STEPS = [
  { stage: 'preparing', label: 'Dane', title: 'Przygotowuję dane', copy: 'Sprawdzam umowę źródłową i aktualne dane zlecenia.' },
  { stage: 'analyzing', label: 'Analiza', title: 'Analizuję umowę', copy: 'Porównuję treść dokumentu z danymi zlecenia.' },
  { stage: 'building_document', label: 'Dokument', title: 'Przygotowuję dokument', copy: 'Wprowadzam potrzebne zmiany i sprawdzam dokument.' },
  { stage: 'verifying', label: 'Kontrola', title: 'Sprawdzam zgodność', copy: 'Weryfikuję przygotowaną umowę.' },
  { stage: 'preparing_preview', label: 'Podgląd', title: 'Przygotowuję podgląd', copy: 'Otwieram gotowy dokument do sprawdzenia.' },
] as const

export function isOptionBProgressStage(value: unknown): value is OptionBProgressStage {
  return typeof value === 'string' && (OPTION_B_PROGRESS_STAGES as readonly string[]).includes(value)
}

export function progressStageIndex(stage: OptionBProgressStage): number {
  return OPTION_B_PROGRESS_STAGES.indexOf(stage)
}

export function highestVisibleProgressStage(
  current: OptionBProgressStage,
  observed: OptionBProgressStage,
): OptionBProgressStage {
  return progressStageIndex(observed) > progressStageIndex(current) ? observed : current
}

export type ActiveProcessingClock = { accumulatedMs: number; activeSinceMs: number | null }

export function startActiveProcessing(clock: ActiveProcessingClock, now: number): ActiveProcessingClock {
  return clock.activeSinceMs === null ? { ...clock, activeSinceMs: now } : clock
}

export function pauseActiveProcessing(clock: ActiveProcessingClock, now: number): ActiveProcessingClock {
  if (clock.activeSinceMs === null) return clock
  return { accumulatedMs: clock.accumulatedMs + Math.max(0, now - clock.activeSinceMs), activeSinceMs: null }
}

export function readActiveProcessing(clock: ActiveProcessingClock, now: number): number {
  return clock.accumulatedMs + (clock.activeSinceMs === null ? 0 : Math.max(0, now - clock.activeSinceMs))
}

export function shouldAcceptProgressRow(row: OptionBProgressRow | null, minimumUpdatedAt: number): boolean {
  if (!row || row.session_state !== 'processing' || row.generation_status !== 'processing' || !isOptionBProgressStage(row.progress_stage)) return false
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : Number.NaN
  return Number.isFinite(updatedAt) && updatedAt >= minimumUpdatedAt
}

export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function elapsedStageCopy(stage: OptionBProgressStage, stageElapsedMs: number): string {
  if (stage === 'analyzing' && stageElapsedMs >= 20_000) {
    return 'Analiza nadal trwa. Bardziej rozbudowane dokumenty mogą wymagać więcej czasu.'
  }
  return OPTION_B_PROGRESS_STEPS[progressStageIndex(stage)].copy
}

export function progressSupportingCopy(
  stage: OptionBProgressStage,
  stageElapsedMs: number,
  continuationPreparing: boolean,
): string {
  if (stage === 'analyzing' && continuationPreparing) {
    return 'Uwzględniam uzupełnione dane i kontynuuję przygotowanie dokumentu.'
  }
  return elapsedStageCopy(stage, stageElapsedMs)
}
