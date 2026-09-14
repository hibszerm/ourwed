/**
 * Client-side Assistant tool adapters.
 * Execute only through existing OurWed services + helpers.
 * Never accept userId/ownerId/tenantId.
 */

import { buildOperationalDayStops } from '@/features/wedding-day/operationalDayPlan'
import { PLAN_DNIA_STAGE_LABELS } from '@/features/prewedding/answerSummary'
import { matchesModernWeddingSearch } from '@/features/weddings/modern/modernWeddingsModel'
import { matchesModernSessionSearch } from '@/features/sessions/modern/modernSessionsModel'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { calendarLightService } from '@/lib/api/calendarLightService'
import { sessionListLightService } from '@/lib/api/sessionListLightService'
import { sessionService } from '@/lib/api/sessionService'
import { taskService } from '@/lib/api/taskService'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import { findLikelyWeddingDuplicates } from '@/lib/weddings/findLikelyWeddingDuplicates'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import {
  formatPolishLongDate,
  resolveAggregateDateRange,
  resolveRelativeScheduleDate,
  resolveWriteDateWithYearOptions,
} from '../dates'
import {
  ASSISTANT_SEARCH_LIMIT,
  type AssistantToolName,
} from '../types'
import { validateToolCall } from './allowlist'
import {
  filterSessionsInRange,
  filterWeddingsInRange,
  sumWeddingContractValues,
} from './aggregateRange'
import { notFoundToolResult, toSessionCard, toWeddingCard } from './dto'

export type ToolExecutionResult = {
  ok: boolean
  data: unknown
  error?: string
}

function readString(args: Record<string, unknown>, key: string): string | null {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function readLimit(args: Record<string, unknown>): number {
  const n = args.limit
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.min(Math.floor(n), ASSISTANT_SEARCH_LIMIT)
  }
  return ASSISTANT_SEARCH_LIMIT
}

async function searchWeddings(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = readString(args, 'query') ?? ''
  const limit = readLimit(args)
  const weddings = await weddingListLightService.listWeddingsForList()
  const matched = weddings
    .filter((w) => matchesModernWeddingSearch(w, query))
    .slice(0, limit)
    .map((w) => toWeddingCard(w))
  return {
    ok: true,
    data: {
      count: matched.length,
      weddings: matched,
    },
  }
}

async function resolveWedding(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (weddingId) {
    const wedding = await weddingService.getById(weddingId)
    if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
    return { ok: true, data: { count: 1, weddings: [toWeddingCard(wedding)] } }
  }
  return searchWeddings(args)
}

async function getWeddingSummary(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (!weddingId) return { ok: false, data: null, error: 'missing_wedding_id' }
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
  const places = await weddingPlaceService.listByWeddingId(weddingId)
  const next = resolveWeddingNextAction(wedding, { places })
  return {
    ok: true,
    data: toWeddingCard(wedding, {
      nextActionTitle: next?.title ?? null,
      nextActionDestination:
        next?.destination.kind === 'wedding_tab'
          ? `/sluby/${wedding.id}`
          : `/sluby/${wedding.id}`,
    }),
  }
}

async function getWeddingPlaces(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (!weddingId) return { ok: false, data: null, error: 'missing_wedding_id' }
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
  const places = await weddingPlaceService.listByWeddingId(weddingId)
  const times = await weddingOperationalTimesService.listByWeddingId(weddingId)
  const stops = buildOperationalDayStops({
    studio: null,
    places,
    operationalTimes: times,
    weddingCeremonyTime: wedding.ceremonyTime,
  })

  const roles = [
    'bride_preparation',
    'groom_preparation',
    'ceremony',
    'reception',
  ] as const

  const byRole = new Map<string, (typeof stops)[number]>()
  for (const stop of stops) {
    if (stop.kind !== 'wedding_place') continue
    const role =
      stop.role === 'preparation' ? 'bride_preparation' : stop.role
    if (!(roles as readonly string[]).includes(role)) continue
    if (!byRole.has(role)) byRole.set(role, stop)
  }

  return {
    ok: true,
    data: {
      wedding: toWeddingCard(wedding),
      places: roles.map((role) => {
        const stop = byRole.get(role)
        const participantKey =
          role === 'bride_preparation'
            ? 'p1'
            : role === 'groom_preparation'
              ? 'p2'
              : null
        return {
          role,
          label:
            PLAN_DNIA_STAGE_LABELS[role] ??
            (role === 'ceremony'
              ? 'Ceremonia'
              : role === 'reception'
                ? 'Przyjęcie'
                : 'Przygotowania'),
          name: stop?.placeName ?? null,
          address: stop?.address ?? null,
          time: stop?.time ?? null,
          participantKey,
        }
      }),
    },
  }
}

async function getWeddingDayPlan(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (!weddingId) return { ok: false, data: null, error: 'missing_wedding_id' }
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
  const places = await weddingPlaceService.listByWeddingId(weddingId)
  const times = await weddingOperationalTimesService.listByWeddingId(weddingId)
  const stops = buildOperationalDayStops({
    studio: null,
    places,
    operationalTimes: times,
    weddingCeremonyTime: wedding.ceremonyTime,
  })
  return {
    ok: true,
    data: {
      wedding: toWeddingCard(wedding),
      stops: stops
        .filter((s) => s.kind === 'wedding_place')
        .map((s) => ({
          key: s.key,
          title: s.title,
          time: s.time,
          placeName: s.placeName ?? null,
          address: s.address ?? null,
          role: s.role === 'preparation' ? 'bride_preparation' : s.role,
        })),
    },
  }
}

async function getWeddingFinances(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (!weddingId) return { ok: false, data: null, error: 'missing_wedding_id' }
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
  const summary = getWeddingCommercialSummary(wedding)
  return {
    ok: true,
    data: {
      weddingId: wedding.id,
      displayName: getWeddingDisplayName(wedding),
      date: wedding.date ?? null,
      contractValue: summary.contractValue,
      totalPaid: summary.totalPaid,
      remainingToPay: summary.remainingToPay,
      agreedDeposit: summary.agreedDeposit,
      currency: summary.currency,
    },
  }
}

async function getWeddingTasks(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const weddingId = readString(args, 'weddingId')
  if (!weddingId) return { ok: false, data: null, error: 'missing_wedding_id' }
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
  const tasks = await taskService.listByWeddingId(weddingId)
  return {
    ok: true,
    data: {
      wedding: toWeddingCard(wedding),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
        weddingId: wedding.id,
        weddingDisplayName: getWeddingDisplayName(wedding),
      })),
    },
  }
}

async function searchSessions(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = readString(args, 'query') ?? ''
  const limit = readLimit(args)
  const sessions = await sessionListLightService.listSessionsForList()
  const matched = sessions
    .filter((s) => matchesModernSessionSearch(s, query))
    .slice(0, limit)
    .map((s) => toSessionCard(s))
  return { ok: true, data: { count: matched.length, sessions: matched } }
}

async function resolveSession(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const sessionId = readString(args, 'sessionId')
  if (sessionId) {
    const session = await sessionService.getById(sessionId)
    if (!session) return { ok: true, data: notFoundToolResult('session') }
    return { ok: true, data: { count: 1, sessions: [toSessionCard(session)] } }
  }
  return searchSessions(args)
}

async function getScheduleForDate(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const raw = readString(args, 'date')
  if (!raw) return { ok: false, data: null, error: 'missing_date' }
  const date = resolveRelativeScheduleDate(raw) ?? (toLocalCalendarDateKey(raw) || null)
  if (!date) return { ok: false, data: null, error: 'invalid_date' }

  const [weddings, sessions] = await Promise.all([
    calendarLightService.listWeddingsForCalendar(),
    calendarLightService.listSessionsForCalendar(),
  ])

  const items = [
    ...weddings
      .filter((w) => toLocalCalendarDateKey(w.date) === date)
      .map((w) => ({
        kind: 'wedding' as const,
        id: w.id,
        displayName: getWeddingDisplayName(w),
        timeLine: w.ceremonyTime?.trim() || null,
        locationLine: toWeddingCard(w).locationLine,
      })),
    ...sessions
      .filter((s) => toLocalCalendarDateKey(s.date) === date)
      .map((s) => {
        const card = toSessionCard(s)
        return {
          kind: 'session' as const,
          id: s.id,
          displayName: card.displayName,
          timeLine: card.timeLine,
          locationLine: card.locationLine,
        }
      }),
  ]

  return {
    ok: true,
    data: {
      date,
      dateLabel: formatPolishLongDate(date),
      items,
    },
  }
}

async function prepareCreateWedding(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const partner1 = readString(args, 'partner1')
  const partner2 = readString(args, 'partner2')
  const dateRaw = readString(args, 'date')
  if (!partner1 || !partner2 || !dateRaw) {
    return { ok: false, data: null, error: 'missing_fields' }
  }

  const resolved = resolveWriteDateWithYearOptions(dateRaw)
  if (!resolved.ok && resolved.needsYearChoice) {
    return {
      ok: true,
      data: {
        needsYearChoice: true,
        partner1,
        partner2,
        yearOptions: resolved.yearOptions,
        displayLabel: `${partner1} i ${partner2}`,
      },
    }
  }
  if (!resolved.ok) {
    return { ok: false, data: null, error: 'invalid_date' }
  }

  const existing = await weddingListLightService.listWeddingsForList()
  const duplicates = findLikelyWeddingDuplicates({
    weddingDate: resolved.date,
    partner1,
    partner2,
    existingWeddings: existing,
  }).map((d) => ({
    weddingId: d.weddingId,
    displayName: d.displayName,
    weddingDate: d.weddingDate,
    reasons: d.reasons,
  }))

  return {
    ok: true,
    data: {
      prepared: true,
      partner1,
      partner2,
      date: resolved.date,
      displayLabel: `${partner1} i ${partner2}`,
      dateLabel: formatPolishLongDate(resolved.date),
      duplicates,
      packageLabel: 'Nie ustawiono',
      valueLabel: 'Nie ustawiono',
    },
  }
}

async function prepareCreateTask(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const title = readString(args, 'title')
  if (!title) return { ok: false, data: null, error: 'missing_title' }
  const dueRaw = readString(args, 'dueDate')
  const weddingId = readString(args, 'weddingId')
  const dueDate = dueRaw ? resolveRelativeScheduleDate(dueRaw) : null
  if (dueRaw && !dueDate) return { ok: false, data: null, error: 'invalid_due_date' }

  let weddingDisplayName: string | null = null
  if (weddingId) {
    const wedding = await weddingService.getById(weddingId)
    if (!wedding) return { ok: true, data: notFoundToolResult('wedding') }
    weddingDisplayName = getWeddingDisplayName(wedding)
  }

  return {
    ok: true,
    data: {
      prepared: true,
      title,
      dueDate,
      dueDateLabel: dueDate ? formatPolishLongDate(dueDate) : null,
      weddingId,
      weddingDisplayName,
    },
  }
}

function readRangeArgs(args: Record<string, unknown>): {
  from: string
  to: string
} | null {
  const from = readString(args, 'from')
  const to = readString(args, 'to')
  if (!from || !to) return null
  if (from > to) return null
  return { from, to }
}

async function loadCalendarLight() {
  const [weddings, sessions] = await Promise.all([
    calendarLightService.listWeddingsForCalendar(),
    calendarLightService.listSessionsForCalendar(),
  ])
  return { weddings, sessions }
}

async function getWeddingCountForRange(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const range = readRangeArgs(args)
  if (!range) return { ok: false, data: null, error: 'invalid_range' }
  const { weddings } = await loadCalendarLight()
  const matched = filterWeddingsInRange(weddings, range.from, range.to)
  return {
    ok: true,
    data: { count: matched.length, from: range.from, to: range.to },
  }
}

async function getSessionCountForRange(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const range = readRangeArgs(args)
  if (!range) return { ok: false, data: null, error: 'invalid_range' }
  const { sessions } = await loadCalendarLight()
  const matched = filterSessionsInRange(sessions, range.from, range.to)
  return {
    ok: true,
    data: { count: matched.length, from: range.from, to: range.to },
  }
}

async function getAssignmentCountForRange(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const range = readRangeArgs(args)
  if (!range) return { ok: false, data: null, error: 'invalid_range' }
  const { weddings, sessions } = await loadCalendarLight()
  const w = filterWeddingsInRange(weddings, range.from, range.to)
  const s = filterSessionsInRange(sessions, range.from, range.to)
  return {
    ok: true,
    data: {
      count: w.length + s.length,
      weddingCount: w.length,
      sessionCount: s.length,
      from: range.from,
      to: range.to,
    },
  }
}

async function getWeddingContractValueSumForRange(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const range = readRangeArgs(args)
  if (!range) return { ok: false, data: null, error: 'invalid_range' }
  const { weddings } = await loadCalendarLight()
  const matched = filterWeddingsInRange(weddings, range.from, range.to)
  const totalContractValue = sumWeddingContractValues(matched)
  return {
    ok: true,
    data: {
      count: matched.length,
      totalContractValue,
      currency: 'PLN',
      from: range.from,
      to: range.to,
    },
  }
}

/** Resolve datePhrase → concrete range for orchestrator (not a model tool). */
export function resolveAggregateRangeFromPhrase(datePhrase: string) {
  return resolveAggregateDateRange(datePhrase)
}

const EXECUTORS: Record<
  AssistantToolName,
  (args: Record<string, unknown>) => Promise<ToolExecutionResult>
> = {
  search_weddings: searchWeddings,
  get_wedding_summary: getWeddingSummary,
  get_wedding_places: getWeddingPlaces,
  get_wedding_day_plan: getWeddingDayPlan,
  get_wedding_finances: getWeddingFinances,
  get_wedding_tasks: getWeddingTasks,
  search_sessions: searchSessions,
  get_schedule_for_date: getScheduleForDate,
  resolve_wedding: resolveWedding,
  resolve_session: resolveSession,
  prepare_create_wedding: prepareCreateWedding,
  prepare_create_task: prepareCreateTask,
  get_wedding_count_for_range: getWeddingCountForRange,
  get_session_count_for_range: getSessionCountForRange,
  get_assignment_count_for_range: getAssignmentCountForRange,
  get_wedding_contract_value_sum_for_range: getWeddingContractValueSumForRange,
}

export async function executeAssistantTool(input: {
  name: string
  args: unknown
}): Promise<ToolExecutionResult & { name?: AssistantToolName }> {
  const validated = validateToolCall(input)
  if (!validated.ok) {
    return { ok: false, data: null, error: validated.reason }
  }
  try {
    const result = await EXECUTORS[validated.name](validated.args)
    return { ...result, name: validated.name }
  } catch {
    return { ok: false, data: null, error: 'tool_failed', name: validated.name }
  }
}

/** Prepare tools never mutate — documentation + test hook. */
export const ASSISTANT_MUTATING_TOOLS: AssistantToolName[] = []
