import type { ComponentType, SVGProps } from 'react'
import {
  IconCalendar,
  IconClipboard,
  IconClock,
  IconDocuments,
  IconFinances,
  IconMapPin,
  IconSessions,
  IconSettings,
  IconTasks,
} from '@/components/icons'

export type WorkflowFeatureKey =
  | 'contract'
  | 'payments'
  | 'questionnaires'
  | 'day-plan'
  | 'tasks'
  | 'calendar'
  | 'logistics'
  | 'execution'
  | 'studio'

export type WorkflowIcon = ComponentType<SVGProps<SVGSVGElement>>

export type WorkflowFeatureDefinition = {
  key: WorkflowFeatureKey
  label: string
  icon: WorkflowIcon
  eyebrow: string
  headline: string
  description: string
  benefits: readonly [string, string, string]
}

export const WORKFLOW_FEATURE_ORDER: readonly WorkflowFeatureKey[] = [
  'contract',
  'payments',
  'questionnaires',
  'day-plan',
  'tasks',
  'calendar',
  'logistics',
  'execution',
  'studio',
] as const

export const WORKFLOW_FEATURES: readonly WorkflowFeatureDefinition[] = [
  {
    key: 'contract',
    label: 'Umowa',
    icon: IconDocuments,
    eyebrow: 'Umowa',
    headline: 'Umowa gotowa w kilka sekund.',
    description:
      'Dane przekazane przez parę są już w zleceniu. Wybierasz szablon i przygotowujesz gotowy dokument bez ponownego przepisywania informacji.',
    benefits: [
      'Dane pary bez ponownego przepisywania',
      'Własne szablony dokumentów',
      'Status umowy zawsze przy zleceniu',
    ],
  },
  {
    key: 'payments',
    label: 'Płatności',
    icon: IconFinances,
    eyebrow: 'Płatności',
    headline: 'Wiesz dokładnie, co zostało zapłacone.',
    description:
      'Zaliczka, kolejne wpłaty i pozostała kwota są przypisane do konkretnego zlecenia.',
    benefits: [
      'Historia wpłat przy zleceniu',
      'Pozostała kwota liczona w jednym miejscu',
      'Terminy kolejnych płatności',
    ],
  },
  {
    key: 'questionnaires',
    label: 'Ankiety',
    icon: IconClipboard,
    eyebrow: 'Ankiety',
    headline: 'Para podaje informacje. Ty nie musisz ich przepisywać.',
    description:
      'Dane do umowy i szczegóły dnia ślubu trafiają bezpośrednio do właściwego zlecenia.',
    benefits: [
      'Ankieta do umowy',
      'Ankieta przedślubna',
      'Odpowiedzi wykorzystujesz dalej w procesie',
    ],
  },
  {
    key: 'day-plan',
    label: 'Plan dnia',
    icon: IconClock,
    eyebrow: 'Plan dnia',
    headline: 'Cały dzień ułożony chronologicznie.',
    description:
      'Godziny, miejsca i najważniejsze punkty dnia układają się w jeden czytelny harmonogram.',
    benefits: [
      'Godziny i lokalizacje razem',
      'Informacje z ankiety przy właściwym punkcie',
      'Gotowe do wykorzystania podczas realizacji',
    ],
  },
  {
    key: 'tasks',
    label: 'Zadania',
    icon: IconTasks,
    eyebrow: 'Zadania',
    headline: 'Wiesz, co trzeba zrobić dalej.',
    description:
      'Terminy i zadania są powiązane ze zleceniem, więc następny krok nie ginie między wiadomościami i notatkami.',
    benefits: [
      'Zadania przy konkretnym zleceniu',
      'Terminy i priorytety',
      'Jasny następny krok',
    ],
  },
  {
    key: 'calendar',
    label: 'Kalendarz',
    icon: IconCalendar,
    eyebrow: 'Kalendarz',
    headline: 'Nie tylko termin. Cały kontekst zlecenia.',
    description:
      'Śluby, sesje i ważne terminy są widoczne w kalendarzu razem z informacją, czego dotyczą.',
    benefits: [
      'Śluby i sesje',
      'Terminy związane ze zleceniami',
      'Szybki dostęp do kontekstu',
    ],
  },
  {
    key: 'logistics',
    label: 'Logistyka',
    icon: IconMapPin,
    eyebrow: 'Logistyka',
    headline: 'Miejsca, trasy i dojazd w jednym planie.',
    description:
      'Adresy zlecenia tworzą czytelną logistykę dnia — od przygotowań po przyjęcie.',
    benefits: [
      'Wszystkie miejsca przy zleceniu',
      'Trasa między punktami',
      'Koszt dojazdu przy rozliczeniu',
    ],
  },
  {
    key: 'execution',
    label: 'Realizacja',
    icon: IconSessions,
    eyebrow: 'Realizacja',
    headline: 'W dniu ślubu najważniejsze rzeczy masz pod ręką.',
    description:
      'Plan dnia, kontakty, logistyka i Brief są przygotowane do pracy w terenie.',
    benefits: [
      'Wedding Day',
      'Brief dostępny podczas realizacji',
      'Kontakty i najważniejsze informacje',
    ],
  },
  {
    key: 'studio',
    label: 'Studio',
    icon: IconSettings,
    eyebrow: 'Studio',
    headline: 'Ustawiasz raz. Korzystasz przy kolejnych zleceniach.',
    description:
      'Dane firmy, pakiety, usługi i ustawienia tworzą bazę, z której korzysta cały system.',
    benefits: [
      'Dane Twojego studia',
      'Pakiety i usługi',
      'Szablony i ustawienia',
    ],
  },
] as const

export const DEFAULT_WORKFLOW_FEATURE: WorkflowFeatureKey = 'contract'

export function workflowFeatureByKey(
  key: WorkflowFeatureKey,
): WorkflowFeatureDefinition {
  const found = WORKFLOW_FEATURES.find((f) => f.key === key)
  return found ?? WORKFLOW_FEATURES[0]!
}
