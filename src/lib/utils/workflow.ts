import type { WeddingDetailSection, WorkflowStage } from '@/types/wedding'

export const WORKFLOW_STAGES: WorkflowStage[] = [
  'reservation',
  'contract',
  'deposit',
  'preparation',
  'pre_wedding_questionnaire',
  'wedding_day',
  'post_production',
  'completed',
]

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  reservation: 'Rezerwacja',
  contract: 'Umowa',
  deposit: 'Zadatek',
  preparation: 'Formalności zakończone',
  pre_wedding_questionnaire: 'Ankieta przedślubna',
  wedding_day: 'Ślub',
  post_production: 'Postprodukcja',
  completed: 'Oddane',
}

export const WORKFLOW_STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  reservation: 'Nowe zlecenie.',
  contract: 'Czekamy na podpis.',
  deposit: 'Czekamy na wpłatę zadatku.',
  preparation: 'Formalności zakończone.',
  pre_wedding_questionnaire: 'Zbieranie szczegółów przed ślubem.',
  wedding_day: 'Realizacja w dniu ślubu.',
  post_production: 'Montaż i przygotowanie materiałów.',
  completed: 'Materiały przekazane parze.',
}

const SECTIONS_BY_STAGE: Record<WorkflowStage, WeddingDetailSection[]> = {
  reservation: ['workflow', 'notes'],
  contract: ['workflow', 'questionnaires', 'notes'],
  deposit: ['workflow', 'payments', 'notes'],
  preparation: ['workflow', 'equipment', 'questionnaires', 'tasks', 'schedule', 'notes'],
  pre_wedding_questionnaire: [
    'workflow',
    'questionnaires',
    'equipment',
    'tasks',
    'schedule',
    'notes',
  ],
  wedding_day: ['workflow', 'schedule', 'equipment', 'notes'],
  post_production: ['workflow', 'tasks', 'payments', 'notes'],
  completed: ['workflow', 'deliverables', 'history', 'notes'],
}

export function getWorkflowProgress(stage: WorkflowStage): number {
  const index = WORKFLOW_STAGES.indexOf(stage)
  if (index === -1) return 0
  return Math.round(((index + 1) / WORKFLOW_STAGES.length) * 100)
}

export function getVisibleSections(stage: WorkflowStage): WeddingDetailSection[] {
  return SECTIONS_BY_STAGE[stage]
}

export function isSectionVisible(stage: WorkflowStage, section: WeddingDetailSection): boolean {
  return getVisibleSections(stage).includes(section)
}
