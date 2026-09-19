/**
 * Central Capability Registry — aggregation only, no product prose ownership.
 * K3: expanded LIVE_CURRENT coverage; canExecute forced false at runtime.
 */

import type { Capability, SealedCapabilityKnowledge } from './types'
import { weddingsCapabilities } from '@/features/weddings/capabilities/weddingsCapabilities'
import { paymentsCapabilities } from '@/features/finance/capabilities/paymentsCapabilities'
import { contractsCapabilities } from '@/features/documents/capabilities/contractsCapabilities'
import { documentsCapabilities } from '@/features/documents/capabilities/documentsCapabilities'
import { questionnairesCapabilities } from '@/features/questionnaires/capabilities/questionnairesCapabilities'
import { preweddingCapabilities } from '@/features/prewedding/capabilities/preweddingCapabilities'
import { packagesCapabilities } from '@/features/studio/capabilities/packagesCapabilities'
import { travelCapabilities } from '@/features/travel/capabilities/travelCapabilities'
import { dayCapabilities } from '@/features/wedding-day/capabilities/dayCapabilities'
import { briefCapabilities } from '@/features/wedding-brief/capabilities/briefCapabilities'
import { sessionsCapabilities } from '@/features/sessions/capabilities/sessionsCapabilities'
import { tasksCapabilities } from '@/features/tasks/capabilities/tasksCapabilities'
import { dashboardCapabilities } from '@/features/dashboard/capabilities/dashboardCapabilities'
import { calendarCapabilities } from '@/features/calendar/capabilities/calendarCapabilities'
import { calendarIntegrationsCapabilities } from '@/features/calendar-integrations/capabilities/calendarIntegrationsCapabilities'
import { notificationsCapabilities } from '@/features/notifications/capabilities/notificationsCapabilities'
import { companyCapabilities } from '@/features/company/capabilities/companyCapabilities'
import { accountCapabilities } from '@/features/account/capabilities/accountCapabilities'
import { appearanceCapabilities } from '@/features/appearance/capabilities/appearanceCapabilities'
import { billingCapabilities } from '@/features/billing/capabilities/billingCapabilities'
import { guideCapabilities } from '@/features/onboarding/guide/capabilities/guideCapabilities'

const FEATURE_OWNED_SOURCES: ReadonlyArray<readonly Capability[]> = [
  weddingsCapabilities,
  paymentsCapabilities,
  contractsCapabilities,
  documentsCapabilities,
  questionnairesCapabilities,
  preweddingCapabilities,
  packagesCapabilities,
  travelCapabilities,
  dayCapabilities,
  briefCapabilities,
  sessionsCapabilities,
  tasksCapabilities,
  dashboardCapabilities,
  calendarCapabilities,
  calendarIntegrationsCapabilities,
  notificationsCapabilities,
  companyCapabilities,
  accountCapabilities,
  appearanceCapabilities,
  billingCapabilities,
  guideCapabilities,
]

function aggregateAndValidate(): readonly Capability[] {
  const all = FEATURE_OWNED_SOURCES.flatMap((s) => [...s])
  const seen = new Set<string>()
  for (const cap of all) {
    if (seen.has(cap.id)) {
      throw new Error(`duplicate_capability_id:${cap.id}`)
    }
    seen.add(cap.id)
    if (!cap.provenance?.ownerFeature || !cap.provenance.lastVerified) {
      throw new Error(`missing_provenance:${cap.id}`)
    }
    if (!cap.provenance.verifiedAgainst?.length) {
      throw new Error(`empty_verifiedAgainst:${cap.id}`)
    }
    if (!cap.permissions.canExplain) {
      throw new Error(`capability_not_explainable:${cap.id}`)
    }
    if (cap.permissions.canExecute) {
      throw new Error(`k3_canExecute_must_be_false:${cap.id}`)
    }
    if (cap.knowledge.mode !== 'static' && cap.knowledge.mode !== 'contextual') {
      throw new Error(`invalid_knowledge_mode:${cap.id}`)
    }
  }
  return Object.freeze(all)
}

const REGISTRY: readonly Capability[] = aggregateAndValidate()

/** Original K2 P0 set — still present in K3. */
export const P0_CAPABILITY_IDS = [
  'weddings.create',
  'weddings.open',
  'weddings.tab.contract_finance',
  'weddings.tab.wedding_day',
  'payments.add',
  'contracts.generate',
  'questionnaires.contract.send',
  'questionnaires.contract.pending',
  'q.prewedding.send',
  'packages.manage',
  'travel.settings',
  'travel.resolve_fee',
  'day.places.edit',
  'sessions.create',
  'tasks.create',
  'guide.open',
] as const

export function listCapabilities(): readonly Capability[] {
  return REGISTRY
}

export function getCapability(id: string): Capability | undefined {
  return REGISTRY.find((c) => c.id === id)
}

export function listCapabilitiesByDomain(domain: string): readonly Capability[] {
  return REGISTRY.filter((c) => c.domain === domain)
}

export function sealCapability(cap: Capability): SealedCapabilityKnowledge {
  return {
    id: cap.id,
    domain: cap.domain,
    title: cap.title,
    summary: cap.summary,
    help: {
      ...(cap.help.steps ? { steps: [...cap.help.steps] } : {}),
      ...(cap.help.prerequisites
        ? { prerequisites: [...cap.help.prerequisites] }
        : {}),
      ...(cap.help.notes ? { notes: [...cap.help.notes] } : {}),
    },
    ...(cap.navigation
      ? {
          navigation: {
            routePattern: cap.navigation.routePattern,
            deepLinkQuality: cap.navigation.deepLinkQuality,
            ...(cap.navigation.contextKeys
              ? { contextKeys: [...cap.navigation.contextKeys] }
              : {}),
          },
        }
      : {}),
    knowledgeMode: cap.knowledge.mode,
  }
}

export function assertK2ExplainOnly(): void {
  for (const cap of REGISTRY) {
    if (cap.permissions.canExecute) {
      throw new Error(`k2_canExecute_must_be_false:${cap.id}`)
    }
  }
}

assertK2ExplainOnly()
