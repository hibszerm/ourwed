import { getDaysUntil } from '@/lib/utils/dates'
import { getDepositPaid } from '@/lib/utils/finance'
import { WORKFLOW_STAGE_LABELS, WORKFLOW_STAGES } from '@/lib/utils/workflow'
import type {
  StageTask,
  Wedding,
  WeddingDeliverable,
  WorkflowStage,
} from '@/types/wedding'

export interface WorkflowStatus {
  stage: WorkflowStage
  stageLabel: string
  /** Jednozdaniowy status wyprowadzony z danych ślubu. */
  message: string
}

export interface WorkflowStep {
  id: string
  label: string
}

export interface RecommendedAction {
  id: string
  label: string
}

export interface WorkflowSnapshot {
  status: WorkflowStatus
  currentStep: WorkflowStep
  remainingTasks: StageTask[]
  canAdvance: boolean
  nextAction: RecommendedAction | null
}

// ---------------------------------------------------------------------------
// Predicates — small, reusable checks against wedding data
// ---------------------------------------------------------------------------

function isDepositPaid(wedding: Wedding): boolean {
  return getDepositPaid(wedding.payments) > 0
}

function findDeliverable(
  deliverables: WeddingDeliverable[],
  match: (d: WeddingDeliverable) => boolean,
): WeddingDeliverable | undefined {
  return deliverables.find(match)
}

function isTeaserDeliverable(d: WeddingDeliverable): boolean {
  const name = d.name.toLowerCase()
  return d.packageDeliverableId === 'pd-teaser' || name.includes('teaser')
}

function isMainFilmDeliverable(d: WeddingDeliverable): boolean {
  const name = d.name.toLowerCase()
  return (
    d.packageDeliverableId === 'pd-full-film' ||
    name.includes('film główny') ||
    name.includes('full film')
  )
}

function isTeaserPending(wedding: Wedding): boolean {
  const teaser = findDeliverable(wedding.deliverables, isTeaserDeliverable)
  return Boolean(teaser && !teaser.completed)
}

function isTeaserDelivered(wedding: Wedding): boolean {
  const teaser = findDeliverable(wedding.deliverables, isTeaserDeliverable)
  return Boolean(teaser?.completed)
}

function isMainFilmPending(wedding: Wedding): boolean {
  const film = findDeliverable(wedding.deliverables, isMainFilmDeliverable)
  return Boolean(film && !film.completed)
}

function areAllDeliverablesCompleted(wedding: Wedding): boolean {
  if (wedding.deliverables.length === 0) return false
  return wedding.deliverables.every((d) => d.completed)
}

function incompleteChecklistTasks(wedding: Wedding): StageTask[] {
  return wedding.checklist
    .filter((item) => !item.completed)
    .map((item) => ({
      id: item.id,
      title: item.label,
      completed: false,
    }))
}

function task(id: string, title: string): StageTask {
  return { id, title, completed: false }
}

// ---------------------------------------------------------------------------
// Status messages — derived per stage from real data
// ---------------------------------------------------------------------------

function statusMessageReservation(wedding: Wedding): string {
  const { status } = wedding.questionnaires.contractData
  if (status === 'not_sent') return 'Wyślij ankietę do umowy'
  if (status === 'sent') return 'Czekamy na odpowiedzi pary'
  return 'Gotowe do wygenerowania umowy'
}

function statusMessageContract(wedding: Wedding): string {
  const { status } = wedding.contract
  if (status === 'none') return 'Gotowe do wygenerowania umowy'
  if (status === 'generated') return 'Wyślij umowę'
  if (status === 'sent') return 'Czekamy na podpis'
  return 'Oczekujemy na zadatek'
}

function statusMessageDeposit(wedding: Wedding): string {
  if (isDepositPaid(wedding)) return 'Można rozpocząć przygotowania'
  return 'Czekamy na wpłatę zadatku'
}

function statusMessagePreparation(wedding: Wedding): string {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') return 'Wyślij ankietę ślubną'
  if (status === 'sent') return 'Czekamy na wypełnienie ankiety ślubnej'
  return 'Oczekiwanie na dzień ślubu'
}

function statusMessagePreWeddingQuestionnaire(wedding: Wedding): string {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') return 'Wyślij ankietę przedślubną'
  if (status === 'sent') return 'Czekamy na wypełnienie ankiety przedślubnej'
  return 'Oczekiwanie na dzień ślubu'
}

function statusMessageWeddingDay(wedding: Wedding): string {
  const days = getDaysUntil(wedding.date)
  if (days === 0) return 'Dzisiaj realizacja'
  if (days < 0) return 'Ślub się odbył — przejdź do postprodukcji'
  if (days === 1) return 'Jutro realizacja'
  return `Realizacja za ${days} dni`
}

function statusMessagePostProduction(wedding: Wedding): string {
  if (areAllDeliverablesCompleted(wedding)) return 'Materiały gotowe do oddania'
  if (isTeaserPending(wedding)) return 'Przygotuj teaser'
  if (isTeaserDelivered(wedding) && isMainFilmPending(wedding)) return 'Montaż filmu'
  const pending = wedding.deliverables.find((d) => !d.completed)
  if (pending) return `Do oddania: ${pending.name}`
  return 'Trwa montaż materiałów'
}

function statusMessageCompleted(wedding: Wedding): string {
  if (areAllDeliverablesCompleted(wedding)) return 'Zlecenie zakończone'
  return 'Oddaj pozostałe materiały'
}

const STATUS_BY_STAGE: Record<WorkflowStage, (wedding: Wedding) => string> = {
  reservation: statusMessageReservation,
  contract: statusMessageContract,
  deposit: statusMessageDeposit,
  preparation: statusMessagePreparation,
  pre_wedding_questionnaire: statusMessagePreWeddingQuestionnaire,
  wedding_day: statusMessageWeddingDay,
  post_production: statusMessagePostProduction,
  completed: statusMessageCompleted,
}

/** Jednozdaniowy status zlecenia — nigdy nie hardkodowany wyłącznie z etapu. */
export function getWorkflowStatus(wedding: Wedding): WorkflowStatus {
  const stage = wedding.workflowStage
  return {
    stage,
    stageLabel: WORKFLOW_STAGE_LABELS[stage],
    message: STATUS_BY_STAGE[stage](wedding),
  }
}

// ---------------------------------------------------------------------------
// Current step — finer grain than workflowStage
// ---------------------------------------------------------------------------

function stepReservation(wedding: Wedding): WorkflowStep {
  const { status } = wedding.questionnaires.contractData
  if (status === 'not_sent') {
    return { id: 'send_contract_questionnaire', label: 'Wysłanie ankiety do umowy' }
  }
  if (status === 'sent') {
    return { id: 'await_contract_questionnaire', label: 'Oczekiwanie na dane do umowy' }
  }
  return { id: 'ready_for_contract', label: 'Gotowość do umowy' }
}

function stepContract(wedding: Wedding): WorkflowStep {
  const { status } = wedding.contract
  if (status === 'none') return { id: 'generate_contract', label: 'Generowanie umowy' }
  if (status === 'generated') return { id: 'send_contract', label: 'Wysłanie umowy' }
  if (status === 'sent') return { id: 'await_signature', label: 'Oczekiwanie na podpis' }
  return { id: 'contract_signed', label: 'Umowa podpisana' }
}

function stepDeposit(wedding: Wedding): WorkflowStep {
  if (!isDepositPaid(wedding)) {
    return { id: 'await_deposit', label: 'Oczekiwanie na zadatek' }
  }
  return { id: 'deposit_received', label: 'Zadatek otrzymany' }
}

function stepPreparation(wedding: Wedding): WorkflowStep {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') {
    return { id: 'send_wedding_questionnaire', label: 'Wysłanie ankiety ślubnej' }
  }
  if (status === 'sent') {
    return { id: 'await_wedding_questionnaire', label: 'Oczekiwanie na ankietę ślubną' }
  }
  return { id: 'await_wedding_day', label: 'Oczekiwanie na dzień ślubu' }
}

function stepPreWeddingQuestionnaire(wedding: Wedding): WorkflowStep {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') {
    return { id: 'send_pre_wedding_questionnaire', label: 'Wysłanie ankiety przedślubnej' }
  }
  if (status === 'sent') {
    return { id: 'await_pre_wedding_questionnaire', label: 'Oczekiwanie na ankietę przedślubną' }
  }
  return { id: 'await_wedding_day', label: 'Oczekiwanie na dzień ślubu' }
}

function stepWeddingDay(wedding: Wedding): WorkflowStep {
  const days = getDaysUntil(wedding.date)
  if (days === 0) return { id: 'wedding_today', label: 'Dzień ślubu' }
  if (days < 0) return { id: 'wedding_done', label: 'Po ślubie' }
  return { id: 'wedding_upcoming', label: 'Przygotowanie do realizacji' }
}

function stepPostProduction(wedding: Wedding): WorkflowStep {
  if (areAllDeliverablesCompleted(wedding)) {
    return { id: 'ready_to_complete', label: 'Gotowe do zamknięcia' }
  }
  if (isTeaserPending(wedding)) return { id: 'teaser', label: 'Teaser' }
  if (isMainFilmPending(wedding)) return { id: 'main_film', label: 'Film główny' }
  return { id: 'other_deliverables', label: 'Pozostałe materiały' }
}

function stepCompleted(wedding: Wedding): WorkflowStep {
  if (areAllDeliverablesCompleted(wedding)) {
    return { id: 'archived', label: 'Zlecenie zakończone' }
  }
  return { id: 'final_delivery', label: 'Finalne oddanie' }
}

const STEP_BY_STAGE: Record<WorkflowStage, (wedding: Wedding) => WorkflowStep> = {
  reservation: stepReservation,
  contract: stepContract,
  deposit: stepDeposit,
  preparation: stepPreparation,
  pre_wedding_questionnaire: stepPreWeddingQuestionnaire,
  wedding_day: stepWeddingDay,
  post_production: stepPostProduction,
  completed: stepCompleted,
}

export function getCurrentStep(wedding: Wedding): WorkflowStep {
  return STEP_BY_STAGE[wedding.workflowStage](wedding)
}

// ---------------------------------------------------------------------------
// Remaining stage tasks — derived from data, not hardcoded mocks
// ---------------------------------------------------------------------------

function tasksReservation(wedding: Wedding): StageTask[] {
  const { status } = wedding.questionnaires.contractData
  if (status === 'not_sent') return [task('send-contract-q', 'Wyślij ankietę do umowy')]
  if (status === 'sent') return [task('await-contract-q', 'Czekaj na odpowiedzi pary')]
  return [task('generate-contract', 'Wygeneruj umowę')]
}

function tasksContract(wedding: Wedding): StageTask[] {
  const { status } = wedding.contract
  if (status === 'none') return [task('generate-contract', 'Wygeneruj umowę')]
  if (status === 'generated') return [task('send-contract', 'Wyślij umowę')]
  if (status === 'sent') return [task('await-sign', 'Oczekuj na podpis')]
  return []
}

function tasksDeposit(wedding: Wedding): StageTask[] {
  if (!isDepositPaid(wedding)) {
    return [task('await-deposit', 'Oczekuj na wpłatę zadatku')]
  }
  return [task('start-prep', 'Rozpocznij przygotowania')]
}

function tasksPreparation(wedding: Wedding): StageTask[] {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') return [task('send-wedding-q', 'Wyślij ankietę ślubną')]
  if (status === 'sent') return [task('await-wedding-q', 'Czekaj na ankietę ślubną')]

  const checklist = incompleteChecklistTasks(wedding)
  if (checklist.length > 0) return checklist.slice(0, 5)
  return []
}

function tasksPreWeddingQuestionnaire(wedding: Wedding): StageTask[] {
  const { status } = wedding.questionnaires.weddingQuestionnaire
  if (status === 'not_sent') return [task('send-pre-wedding-q', 'Wyślij ankietę przedślubną')]
  if (status === 'sent') return [task('await-pre-wedding-q', 'Czekaj na ankietę przedślubną')]

  const checklist = incompleteChecklistTasks(wedding)
  if (checklist.length > 0) return checklist.slice(0, 5)
  return []
}

function tasksWeddingDay(wedding: Wedding): StageTask[] {
  return incompleteChecklistTasks(wedding).slice(0, 5)
}

function tasksPostProduction(wedding: Wedding): StageTask[] {
  return wedding.deliverables
    .filter((d) => !d.completed)
    .map((d) => task(`del-${d.id}`, `Oddaj: ${d.name}`))
}

function tasksCompleted(wedding: Wedding): StageTask[] {
  return wedding.deliverables
    .filter((d) => !d.completed)
    .map((d) => task(`del-${d.id}`, `Oddaj: ${d.name}`))
}

const TASKS_BY_STAGE: Record<WorkflowStage, (wedding: Wedding) => StageTask[]> = {
  reservation: tasksReservation,
  contract: tasksContract,
  deposit: tasksDeposit,
  preparation: tasksPreparation,
  pre_wedding_questionnaire: tasksPreWeddingQuestionnaire,
  wedding_day: tasksWeddingDay,
  post_production: tasksPostProduction,
  completed: tasksCompleted,
}

export function getRemainingStageTasks(wedding: Wedding): StageTask[] {
  return TASKS_BY_STAGE[wedding.workflowStage](wedding)
}

// ---------------------------------------------------------------------------
// Advance gates
// ---------------------------------------------------------------------------

function canAdvanceReservation(wedding: Wedding): boolean {
  return wedding.questionnaires.contractData.status === 'completed'
}

function canAdvanceContract(wedding: Wedding): boolean {
  return wedding.contract.status === 'signed'
}

function canAdvanceDeposit(wedding: Wedding): boolean {
  return isDepositPaid(wedding)
}

function canAdvancePreparation(wedding: Wedding): boolean {
  return wedding.questionnaires.weddingQuestionnaire.status === 'completed'
}

function canAdvancePreWeddingQuestionnaire(wedding: Wedding): boolean {
  return wedding.questionnaires.weddingQuestionnaire.status === 'completed'
}

function canAdvanceWeddingDay(wedding: Wedding): boolean {
  return getDaysUntil(wedding.date) < 0
}

function canAdvancePostProduction(wedding: Wedding): boolean {
  return areAllDeliverablesCompleted(wedding)
}

function canAdvanceCompleted(): boolean {
  return false
}

const ADVANCE_BY_STAGE: Record<WorkflowStage, (wedding: Wedding) => boolean> = {
  reservation: canAdvanceReservation,
  contract: canAdvanceContract,
  deposit: canAdvanceDeposit,
  preparation: canAdvancePreparation,
  pre_wedding_questionnaire: canAdvancePreWeddingQuestionnaire,
  wedding_day: canAdvanceWeddingDay,
  post_production: canAdvancePostProduction,
  completed: canAdvanceCompleted,
}

export function canAdvanceStage(wedding: Wedding): boolean {
  return ADVANCE_BY_STAGE[wedding.workflowStage](wedding)
}

// ---------------------------------------------------------------------------
// Next recommended action
// ---------------------------------------------------------------------------

export function getNextRecommendedAction(wedding: Wedding): RecommendedAction | null {
  const remaining = getRemainingStageTasks(wedding)
  const first = remaining[0]
  if (!first) {
    if (canAdvanceStage(wedding)) {
      return { id: 'advance-stage', label: 'Przejdź do kolejnego etapu' }
    }
    return null
  }
  return { id: first.id, label: first.title }
}

/** Pełny snapshot — jeden punkt wejścia dla UI. */
export function getWorkflowSnapshot(wedding: Wedding): WorkflowSnapshot {
  const remainingTasks = getRemainingStageTasks(wedding)
  return {
    status: getWorkflowStatus(wedding),
    currentStep: getCurrentStep(wedding),
    remainingTasks,
    canAdvance: canAdvanceStage(wedding),
    nextAction: getNextRecommendedAction(wedding),
  }
}

export function getNextStage(stage: WorkflowStage): WorkflowStage | null {
  const index = WORKFLOW_STAGES.indexOf(stage)
  if (index === -1 || index >= WORKFLOW_STAGES.length - 1) return null
  return WORKFLOW_STAGES[index + 1]
}

/** Pastelowe kolory etapu — używane w kalendarzu i innych widokach operacyjnych. */
export interface WorkflowStageColor {
  background: string
  text: string
  border: string
}

export const WORKFLOW_STAGE_COLORS: Record<WorkflowStage, WorkflowStageColor> = {
  reservation: {
    background: '#f0f0f2',
    text: '#6e6e73',
    border: '#d2d2d7',
  },
  contract: {
    background: '#e8f1fb',
    text: '#1d4f91',
    border: '#b3d0f0',
  },
  deposit: {
    background: '#f3effa',
    text: '#5c3d9e',
    border: '#d4c4f0',
  },
  preparation: {
    background: '#fef3e8',
    text: '#b35c00',
    border: '#f0d0a8',
  },
  pre_wedding_questionnaire: {
    background: '#fdeef2',
    text: '#a13a63',
    border: '#f2ccd9',
  },
  wedding_day: {
    background: '#e8f5ec',
    text: '#1a7a3a',
    border: '#b5dfc0',
  },
  post_production: {
    background: '#eceaf8',
    text: '#3d3a8c',
    border: '#c5c0e8',
  },
  completed: {
    background: '#f5f5f7',
    text: '#6e6e73',
    border: '#e0e0e4',
  },
}

export function getWorkflowStageColor(stage: WorkflowStage): WorkflowStageColor {
  return WORKFLOW_STAGE_COLORS[stage]
}
