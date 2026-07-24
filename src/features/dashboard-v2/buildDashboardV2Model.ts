/**
 * Dashboard V2 — view model derived from existing wedding/task data.
 * Experimental; does not replace Dashboard V1.
 */

import type { Notification, Task, Wedding } from '@/types/wedding'
import { coupleName, getDaysUntil } from '@/lib/utils/dates'
import {
  getWorkflowProgress,
  WORKFLOW_STAGE_LABELS,
} from '@/lib/utils/workflow'

export interface DashboardV2FocusAction {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  timeLabel: string
  weddingId: string
  weddingLabel: string
  href: string
}

export interface DashboardV2TimelineItem {
  id: string
  title: string
  detail: string
  at: string
  kind:
    | 'contract'
    | 'questionnaire'
    | 'payment'
    | 'wedding'
    | 'document'
    | 'task'
    | 'other'
}

export interface DashboardV2UpcomingCard {
  id: string
  names: string
  date: string
  daysRemaining: number
  packageName: string
  progress: number
  stageLabel: string
  href: string
}

export interface DashboardV2Kpi {
  id: string
  label: string
  value: string
  hint?: string
}

export interface DashboardV2HeroStats {
  tasksToday: number
  unreadNotifications: number
  paymentsWaiting: number
  documentsPending: number
}

export interface DashboardV2Model {
  hero: {
    wedding: Wedding | null
    names: string
    dateLabel: string
    daysRemaining: number
    stageLabel: string
    href: string
    stats: DashboardV2HeroStats
  }
  focus: DashboardV2FocusAction[]
  timeline: DashboardV2TimelineItem[]
  upcoming: DashboardV2UpcomingCard[]
  kpis: DashboardV2Kpi[]
}

function money(n: number, currency = 'PLN'): string {
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${Math.round(n)} ${currency}`
  }
}

function weddingLabel(w: Wedding): string {
  return coupleName(w.couple.partner1, w.couple.partner2)
}

function unpaidRemaining(w: Wedding): number {
  const paid = (w.payments ?? [])
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0)
  return Math.max(0, (w.price ?? 0) - paid)
}

function hasUnpaid(w: Wedding): boolean {
  return unpaidRemaining(w) > 0
}

function formatRelativeDay(dateStr: string): string {
  const days = getDaysUntil(dateStr)
  if (days < 0) return 'Po terminie'
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

export function buildDashboardV2Model(input: {
  nextWedding: Wedding | null
  weddings: Wedding[]
  todayTasks: Task[]
  notifications: Notification[]
}): DashboardV2Model {
  const { nextWedding, weddings, todayTasks, notifications } = input
  const today = new Date().toISOString().slice(0, 10)

  const byId = new Map(weddings.map((w) => [w.id, w]))

  const active = weddings.filter((w) => w.status === 'active')
  const completed = weddings.filter(
    (w) => w.workflowStage === 'completed' || w.status === 'archived',
  )

  const paymentsWaiting = active.filter(hasUnpaid).length
  const documentsPending = active.filter(
    (w) =>
      w.workflowStage === 'reservation' ||
      w.workflowStage === 'contract' ||
      w.contract.status === 'none' ||
      w.contract.status === 'generated',
  ).length

  const unread = notifications.filter((n) => !n.read).length

  const focusCandidates: DashboardV2FocusAction[] = []

  for (const task of todayTasks.filter((t) => !t.completed)) {
    const w = byId.get(task.weddingId)
    focusCandidates.push({
      id: task.id,
      title: task.title,
      priority: task.priority ?? 'medium',
      timeLabel: task.dueDate === today ? 'Dziś' : formatRelativeDay(task.dueDate),
      weddingId: task.weddingId,
      weddingLabel: w ? weddingLabel(w) : 'Ślub',
      href: `/sluby/${task.weddingId}`,
    })
  }

  for (const w of active.filter(hasUnpaid).slice(0, 4)) {
    focusCandidates.push({
      id: `pay-${w.id}`,
      title: 'Rozlicz zaległą płatność',
      priority: 'high',
      timeLabel: formatRelativeDay(w.date),
      weddingId: w.id,
      weddingLabel: weddingLabel(w),
      href: `/sluby/${w.id}`,
    })
  }

  for (const w of active
    .filter(
      (x) => x.workflowStage === 'contract' || x.contract.status === 'none',
    )
    .slice(0, 3)) {
    focusCandidates.push({
      id: `doc-${w.id}`,
      title: 'Wygeneruj lub domknij umowę',
      priority: 'medium',
      timeLabel: formatRelativeDay(w.date),
      weddingId: w.id,
      weddingLabel: weddingLabel(w),
      href: `/sluby/${w.id}`,
    })
  }

  const priorityRank = { high: 0, medium: 1, low: 2 } as const
  const focus = [...focusCandidates]
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 3)

  const timeline: DashboardV2TimelineItem[] = []

  for (const n of notifications.slice(0, 8)) {
    const blob = `${n.title} ${n.message}`
    const kind =
      /umow|contract|dokument/i.test(blob)
        ? ('contract' as const)
        : /ankiet|questionnaire/i.test(blob)
          ? ('questionnaire' as const)
          : /płat|plat|payment|zalicz/i.test(blob)
            ? ('payment' as const)
            : /podpis|sign/i.test(blob)
              ? ('document' as const)
              : ('other' as const)
    timeline.push({
      id: n.id,
      title: n.title,
      detail: n.message,
      at: n.createdAt,
      kind,
    })
  }

  for (const w of [...weddings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)) {
    timeline.push({
      id: `wedding-${w.id}`,
      title: 'Dodano ślub',
      detail: weddingLabel(w),
      at: w.createdAt,
      kind: 'wedding',
    })
  }

  timeline.sort((a, b) => b.at.localeCompare(a.at))
  const timelineTrimmed = timeline.slice(0, 8)

  const upcoming = [...active]
    .filter((w) => getDaysUntil(w.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map((w) => ({
      id: w.id,
      names: weddingLabel(w),
      date: w.date,
      daysRemaining: getDaysUntil(w.date),
      packageName: w.packageName?.trim() || 'Pakiet',
      progress: getWorkflowProgress(w.workflowStage),
      stageLabel: WORKFLOW_STAGE_LABELS[w.workflowStage],
      href: `/sluby/${w.id}`,
    }))

  const revenue = active.reduce((s, w) => s + (w.price ?? 0), 0)
  const remaining = active.reduce((s, w) => s + unpaidRemaining(w), 0)
  const upcomingPay = active
    .flatMap((w) =>
      (w.payments ?? []).filter((p) => !p.paid && p.dueDate && p.dueDate >= today),
    )
    .reduce((s, p) => s + p.amount, 0)

  const currency = nextWedding?.currency || active[0]?.currency || 'PLN'

  const kpis: DashboardV2Kpi[] = [
    {
      id: 'revenue',
      label: 'Wartość aktywnych umów',
      value: money(revenue, currency),
      hint: `${active.length} aktywnych`,
    },
    {
      id: 'remaining',
      label: 'Do spłaty',
      value: money(remaining, currency),
      hint: `${paymentsWaiting} ślubów`,
    },
    {
      id: 'upcoming-pay',
      label: 'Nadchodzące płatności',
      value: money(upcomingPay, currency),
    },
    {
      id: 'completed',
      label: 'Ukończone śluby',
      value: String(completed.length),
    },
    {
      id: 'turnaround',
      label: 'Średni postęp workflow',
      value:
        active.length === 0
          ? '—'
          : `${Math.round(
              active.reduce(
                (s, w) => s + getWorkflowProgress(w.workflowStage),
                0,
              ) / active.length,
            )}%`,
      hint: 'Aktywne projekty',
    },
  ]

  return {
    hero: {
      wedding: nextWedding,
      names: nextWedding ? weddingLabel(nextWedding) : 'Brak nadchodzącego ślubu',
      dateLabel: nextWedding
        ? new Date(nextWedding.date).toLocaleDateString('pl-PL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '—',
      daysRemaining: nextWedding ? getDaysUntil(nextWedding.date) : 0,
      stageLabel: nextWedding
        ? WORKFLOW_STAGE_LABELS[nextWedding.workflowStage]
        : '—',
      href: nextWedding ? `/sluby/${nextWedding.id}` : '/sluby/nowy',
      stats: {
        tasksToday: todayTasks.filter((t) => !t.completed).length,
        unreadNotifications: unread,
        paymentsWaiting,
        documentsPending,
      },
    },
    focus,
    timeline: timelineTrimmed,
    upcoming,
    kpis,
  }
}
