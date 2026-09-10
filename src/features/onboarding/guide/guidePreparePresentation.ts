import type {
  GuideActivationStage,
  SetupGuidanceDerivedState,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'

export type GuidePrepareStatusTone =
  | 'ready'
  | 'recommended'
  | 'started'
  | 'dependency'
  | 'optional'
  | 'optional_ready'

export type GuidePrepareAction = {
  label: string
  to: string
  style: 'action-row' | 'quiet'
}

export type GuidePrepareModuleView = {
  id: 'packages' | 'templates' | 'company'
  title: string
  body: string
  optional?: boolean
  /** Slightly elevated when this is the single recommended next core action. */
  recommendedNext?: boolean
  statusLabel: string | null
  statusTone: GuidePrepareStatusTone | null
  actions: GuidePrepareAction[]
}

export type GuidePrepareSummary = {
  title: string
  body: string
}

export type GuidePreparePresentation = {
  activationStage: GuideActivationStage
  summary: GuidePrepareSummary | null
  modules: GuidePrepareModuleView[]
}

function packageReadyCopy(count: number): string {
  if (count === 1) return 'Masz już zapisany pakiet.'
  return `Masz już zapisane pakiety (${count}).`
}

function actionRow(label: string, to: string): GuidePrepareAction {
  return { label, to, style: 'action-row' }
}

function quietAction(label: string, to: string): GuidePrepareAction {
  return { label, to, style: 'quiet' }
}

function buildSummary(
  stage: GuideActivationStage,
): GuidePrepareSummary | null {
  if (stage === 'package_without_template') {
    return {
      title: 'Następny krok',
      body: 'Dodaj wzór umowy DOCX do pakietu, aby OurWed mógł przygotowywać na jego podstawie umowy.',
    }
  }
  if (stage === 'core_ready') {
    return {
      title: 'Podstawowa konfiguracja jest gotowa',
      body: 'Masz pakiet z przypisanym wzorem umowy. Możesz korzystać z niego przy kolejnych zleceniach.',
    }
  }
  return null
}

/**
 * Maps domain-derived setup state to Guide preparation module presentation.
 */
export function buildGuidePrepareModules(
  state: SetupGuidanceDerivedState,
): GuidePrepareModuleView[] {
  return buildGuidePreparePresentation(state).modules
}

/**
 * Full Przygotuj OurWed presentation: activation stage, optional summary, modules.
 */
export function buildGuidePreparePresentation(
  state: SetupGuidanceDerivedState,
): GuidePreparePresentation {
  const stage = state.activationStage

  const packages: GuidePrepareModuleView =
    state.packageRow === 'actionable'
      ? {
          id: 'packages',
          title: 'Pakiety',
          body: 'Pakiety przechowują ofertę, ceny i warunki, z których OurWed korzysta przy zleceniach, ankietach i umowach.',
          recommendedNext: true,
          statusLabel: 'Do ustawienia',
          statusTone: 'recommended',
          actions: [
            actionRow('Dodaj pakiet →', SETUP_GUIDANCE_ROUTES.packages),
          ],
        }
      : state.packageRow === 'started'
        ? {
            id: 'packages',
            title: 'Pakiety',
            body: packageReadyCopy(state.packageCount),
            statusLabel: 'Pakiet dodany',
            statusTone: 'started',
            actions: [
              quietAction('Zobacz pakiety →', SETUP_GUIDANCE_ROUTES.packages),
            ],
          }
        : {
            id: 'packages',
            title: 'Pakiety',
            body: packageReadyCopy(state.packageCount),
            statusLabel: 'Gotowe',
            statusTone: 'ready',
            actions: [
              quietAction('Zobacz pakiety →', SETUP_GUIDANCE_ROUTES.packages),
            ],
          }

  let templates: GuidePrepareModuleView
  if (state.templateRow === 'depends_on_package') {
    templates = {
      id: 'templates',
      title: 'Wzory umów',
      body: 'Najpierw dodaj pakiet. W kolejnym kroku przypiszesz do niego wzór umowy.',
      statusLabel: 'Wymaga pakietu',
      statusTone: 'dependency',
      actions: [],
    }
  } else if (state.templateRow === 'actionable') {
    templates = {
      id: 'templates',
      title: 'Wzory umów',
      body: 'Dodaj wzór DOCX do pakietu, aby OurWed mógł przygotowywać na jego podstawie umowy.',
      recommendedNext: true,
      statusLabel: 'Do ustawienia',
      statusTone: 'recommended',
      actions: [
        actionRow('Dodaj wzór umowy →', SETUP_GUIDANCE_ROUTES.packages),
      ],
    }
  } else {
    templates = {
      id: 'templates',
      title: 'Wzory umów',
      body: 'Co najmniej jeden pakiet ma przypisany wzór umowy.',
      statusLabel: 'Gotowe',
      statusTone: 'ready',
      actions: [quietAction('Zobacz pakiety →', SETUP_GUIDANCE_ROUTES.packages)],
    }
  }

  const company: GuidePrepareModuleView = {
    id: 'company',
    title: 'Dane firmy',
    optional: true,
    body:
      state.companyRow === 'quiet_ready'
        ? 'Dane firmy są uzupełnione i mogą być używane w dokumentach.'
        : 'Uzupełnij dane używane w dokumentach i ustawieniach.',
    statusLabel: state.companyRow === 'quiet_ready' ? 'Gotowe' : 'Opcjonalne',
    statusTone:
      state.companyRow === 'quiet_ready' ? 'optional_ready' : 'optional',
    actions:
      state.companyRow === 'quiet_ready'
        ? [quietAction('Edytuj dane →', SETUP_GUIDANCE_ROUTES.company)]
        : [actionRow('Uzupełnij dane →', SETUP_GUIDANCE_ROUTES.company)],
  }

  return {
    activationStage: stage,
    summary: buildSummary(stage),
    modules: [packages, templates, company],
  }
}
