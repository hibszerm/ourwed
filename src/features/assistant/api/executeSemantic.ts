/**
 * Common semantic orchestrator — local parser and Edge LLM both feed this.
 * Intent determines tools/UI; resource resolution is separate.
 */

import {
  ASSISTANT_NO_MATCH,
  ASSISTANT_NO_SESSION_MATCH,
  ASSISTANT_UNRECOGNIZED,
  ASSISTANT_UNSUPPORTED,
  ASSISTANT_MISSING_FINANCE,
  ASSISTANT_MISSING_PREPARATIONS,
  ASSISTANT_MISSING_CEREMONY,
  ASSISTANT_MISSING_CEREMONY_TIME,
  ASSISTANT_MISSING_DAY_PLAN,
  ASSISTANT_EMPTY_TASKS,
  ASSISTANT_PARTICIPANT_NOT_FOUND,
  ASSISTANT_PARTICIPANT_AMBIGUOUS,
} from '../copy'
import { formatPolishLongDate, resolveAggregateDateRange } from '../dates'
import { polishCountUnit } from '../tools/aggregateRange'
import { executeAssistantTool } from '../tools/executeTool'
import type {
  AssistantPlaceRoleDto,
  AssistantResponse,
  AssistantSemanticRequest,
  AssistantWeddingCardDto,
  PageContextHint,
  PlaceRoleFilter,
  WeddingResolver,
} from '../types'
import {
  polishPersonSearchQueries,
  weddingMatchesDateHint,
} from './intentParse'
import {
  participantsFromCouple,
  placeRoleForParticipant,
  resolveParticipantReference,
  matchParticipantByNameQuery,
  type AssistantParticipantKey,
} from './participants'
import { getWeddingResolver } from './semantic'

export type AssistantSessionContext = {
  /** Last resolved wedding in this open Assistant session (ephemeral). */
  weddingId?: string | null
}

type ResolveOutcome =
  | { status: 'one'; wedding: AssistantWeddingCardDto }
  | { status: 'many'; weddings: AssistantWeddingCardDto[] }
  | { status: 'none' }
  | { status: 'need_person' }

async function resolveWeddingTarget(input: {
  resolver: WeddingResolver
  pageContext?: PageContextHint | null
  sessionContext?: AssistantSessionContext | null
  /** Active wedding participants — prefer participant match over global search. */
  activeParticipants?: ReturnType<typeof participantsFromCouple> | null
}): Promise<ResolveOutcome> {
  if (input.resolver.weddingId) {
    const byId = await executeAssistantTool({
      name: 'resolve_wedding',
      args: { weddingId: input.resolver.weddingId },
    })
    const data = byId.data as {
      count?: number
      weddings?: AssistantWeddingCardDto[]
      found?: boolean
    } | null
    if (data && data.found === false) return { status: 'none' }
    if (data?.count === 1 && data.weddings?.[0]) {
      return { status: 'one', wedding: data.weddings[0] }
    }
    return { status: 'none' }
  }

  // V3 precedence: personQuery that matches active/session wedding participants
  // is a PARTICIPANT reference — do not escalate to global wedding search first.
  if (
    input.resolver.personQuery &&
    input.sessionContext?.weddingId
  ) {
    const sessionHit = await executeAssistantTool({
      name: 'resolve_wedding',
      args: { weddingId: input.sessionContext.weddingId },
    })
    const sessionData = sessionHit.data as {
      count?: number
      weddings?: AssistantWeddingCardDto[]
      found?: boolean
    } | null
    const sessionWedding = sessionData?.weddings?.[0]
    if (sessionWedding) {
      const candidates =
        input.activeParticipants && input.activeParticipants.length > 0
          ? input.activeParticipants
          : participantsFromCouple({
              partner1: sessionWedding.partner1,
              partner2: sessionWedding.partner2,
            })
      const matched = matchParticipantByNameQuery(
        candidates,
        input.resolver.personQuery,
      )
      if (matched && matched !== 'ambiguous') {
        return { status: 'one', wedding: sessionWedding }
      }
      // Leave unknown names to global search; caller may still bind session
      // for prep-scoped fail-closed participant checks.
    }
  }

  if (
    !input.resolver.personQuery &&
    input.sessionContext?.weddingId
  ) {
    return resolveWeddingTarget({
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: input.sessionContext.weddingId,
      },
      pageContext: null,
      sessionContext: null,
    })
  }

  if (
    !input.resolver.personQuery &&
    input.pageContext?.resourceType === 'wedding' &&
    input.pageContext.resourceId
  ) {
    return resolveWeddingTarget({
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: input.pageContext.resourceId,
      },
      pageContext: null,
      sessionContext: null,
    })
  }

  if (!input.resolver.personQuery) return { status: 'need_person' }

  const byId = new Map<string, AssistantWeddingCardDto>()
  for (const query of polishPersonSearchQueries(input.resolver.personQuery)) {
    const resolved = await executeAssistantTool({
      name: 'resolve_wedding',
      args: { query },
    })
    const data = resolved.data as {
      count?: number
      weddings?: AssistantWeddingCardDto[]
    } | null
    for (const w of data?.weddings ?? []) {
      byId.set(w.id, w)
    }
  }

  let list = [...byId.values()]
  if (list.length === 0) return { status: 'none' }

  if (input.resolver.dateHint) {
    const filtered = list.filter((w) =>
      weddingMatchesDateHint(w.date, input.resolver.dateHint!),
    )
    if (filtered.length === 1) {
      return { status: 'one', wedding: filtered[0]! }
    }
    if (filtered.length > 1) list = filtered
  }

  if (list.length === 1) return { status: 'one', wedding: list[0]! }
  return { status: 'many', weddings: list }
}

function choiceForPending(
  weddings: AssistantWeddingCardDto[],
  pendingSemantic: AssistantSemanticRequest,
): AssistantResponse {
  return {
    kind: 'choice',
    prompt: 'Które zlecenie masz na myśli?',
    items: weddings.map((w) => ({
      id: w.id,
      kind: 'wedding' as const,
      title: w.displayName,
      subtitle: w.date,
      meta: w.locationLine,
    })),
    pendingSemantic,
  }
}

function stripNextAction(
  wedding: AssistantWeddingCardDto,
): AssistantWeddingCardDto {
  const { nextActionTitle: _t, nextActionDestination: _d, ...rest } = wedding
  void _t
  void _d
  return rest
}

function filterPlaces(
  places: AssistantPlaceRoleDto[],
  role: PlaceRoleFilter,
  participantKey?: AssistantParticipantKey | null,
): AssistantPlaceRoleDto[] {
  if (role === 'all') return places

  if (role === 'bride_preparation' || role === 'groom_preparation') {
    return places.filter((p) => p.role === role)
  }

  if (role === 'ceremony' || role === 'reception') {
    return places.filter((p) => p.role === role)
  }

  // preparations
  if (participantKey) {
    const prepRole = placeRoleForParticipant(participantKey)
    return places.filter((p) => p.role === prepRole)
  }
  return places.filter(
    (p) =>
      p.role === 'bride_preparation' ||
      p.role === 'groom_preparation' ||
      p.role === 'preparations',
  )
}

function isPrepScope(role: PlaceRoleFilter): boolean {
  return (
    role === 'preparations' ||
    role === 'bride_preparation' ||
    role === 'groom_preparation'
  )
}

async function openSessionByPerson(
  person: string | null,
): Promise<AssistantResponse> {
  if (!person) return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  const byId = new Map<
    string,
    { id: string; displayName: string; date: string | null }
  >()
  for (const query of polishPersonSearchQueries(person)) {
    const resolved = await executeAssistantTool({
      name: 'resolve_session',
      args: { query },
    })
    const data = resolved.data as {
      count?: number
      sessions?: Array<{
        id: string
        displayName: string
        date: string | null
      }>
    } | null
    for (const s of data?.sessions ?? []) {
      byId.set(s.id, s)
    }
  }
  const list = [...byId.values()]
  if (list.length === 1) {
    const s = list[0]!
    return {
      kind: 'session',
      session: s as never,
      navigate: { path: `/sesje/${s.id}`, label: 'Otwórz sesję' },
    }
  }
  if (list.length > 1) {
    return {
      kind: 'choice',
      prompt: 'Którą sesję masz na myśli?',
      items: list.map((s) => ({
        id: s.id,
        kind: 'session' as const,
        title: s.displayName,
        subtitle: s.date,
      })),
    }
  }
  return { kind: 'error', message: ASSISTANT_NO_SESSION_MATCH }
}

async function executeOnWedding(
  request: AssistantSemanticRequest,
  weddingId: string,
): Promise<AssistantResponse> {
  switch (request.kind) {
    case 'wedding_finances': {
      const fin = await executeAssistantTool({
        name: 'get_wedding_finances',
        args: { weddingId },
      })
      if (fin.ok && fin.data && typeof fin.data === 'object') {
        const f = fin.data as {
          weddingId: string
          displayName: string
          date?: string | null
          contractValue: number
          totalPaid: number
          remainingToPay: number
          agreedDeposit: number
          currency: string
          found?: boolean
        }
        if (f.found === false) {
          return { kind: 'error', message: ASSISTANT_NO_MATCH }
        }
        // Enrich date from summary if tool omitted it
        let date = f.date ?? null
        if (!date) {
          const sum = await executeAssistantTool({
            name: 'get_wedding_summary',
            args: { weddingId },
          })
          if (sum.ok && sum.data && typeof sum.data === 'object') {
            date = (sum.data as AssistantWeddingCardDto).date
          }
        }
        return {
          kind: 'finance',
          finance: { ...f, date },
          financeAspect: request.financeAspect,
          navigate: {
            path: `/sluby/${f.weddingId}`,
            label: 'Otwórz finanse',
          },
        }
      }
      return { kind: 'error', message: ASSISTANT_MISSING_FINANCE }
    }

    case 'wedding_places': {
      const places = await executeAssistantTool({
        name: 'get_wedding_places',
        args: { weddingId },
      })
      if (places.ok && places.data && typeof places.data === 'object') {
        const d = places.data as {
          wedding: AssistantWeddingCardDto
          places: AssistantPlaceRoleDto[]
        }
        const candidates = participantsFromCouple({
          partner1: d.wedding.partner1,
          partner2: d.wedding.partner2,
        })

        let participantKey: AssistantParticipantKey | null =
          request.participantKey ?? null
        const wantsParticipant =
          isPrepScope(request.requestedRole) &&
          (Boolean(request.participantKey) ||
            Boolean(request.participantRole) ||
            // personQuery on prep asks is participant-scoped once wedding is known
            Boolean(request.resolver.personQuery))

        if (wantsParticipant || request.participantKey || request.participantRole) {
          const resolved = resolveParticipantReference({
            candidates,
            participantKey: request.participantKey,
            participantRole: request.participantRole,
            // Only use personQuery for participant match when prep-scoped
            personQuery: isPrepScope(request.requestedRole)
              ? request.resolver.personQuery
              : null,
          })
          if (resolved.status === 'ambiguous') {
            return {
              kind: 'clarification',
              question: ASSISTANT_PARTICIPANT_AMBIGUOUS,
              options: candidates.map((c) => ({
                id: c.key,
                label: c.canonicalName,
                semantic: {
                  ...request,
                  participantKey: c.key,
                  resolver: {
                    ...request.resolver,
                    personQuery: null,
                    weddingId,
                  },
                },
              })),
            }
          }
          if (resolved.status === 'not_found') {
            // Fail closed — never fall back to the other person's preparations
            return {
              kind: 'error',
              message: ASSISTANT_PARTICIPANT_NOT_FOUND,
            }
          }
          if (resolved.status === 'resolved') {
            participantKey = resolved.key
          }
        }

        let effectiveRole: PlaceRoleFilter = request.requestedRole
        if (participantKey && isPrepScope(request.requestedRole)) {
          // Explicit participant always wins over a stale bride_/groom_ role
          // left from the previous turn (e.g. "a Damian?" after Martyna).
          effectiveRole = placeRoleForParticipant(participantKey)
        }

        const filtered = filterPlaces(
          d.places ?? [],
          effectiveRole,
          participantKey,
        )

        // Never expand scoped answers back to all places
        const scopedPlaces =
          request.requestedRole === 'all'
            ? filtered
            : filtered

        if (
          request.requestedRole !== 'all' &&
          scopedPlaces.length > 0 &&
          scopedPlaces.every((p) => !p.name && !p.address)
        ) {
          const msg =
            isPrepScope(request.requestedRole)
              ? ASSISTANT_MISSING_PREPARATIONS
              : request.requestedRole === 'ceremony'
                ? ASSISTANT_MISSING_CEREMONY
                : ASSISTANT_NO_MATCH
          return {
            kind: 'places',
            wedding: stripNextAction(d.wedding),
            places: scopedPlaces,
            focusRole: effectiveRole,
            emptyMessage: msg,
            navigate: {
              path: `/sluby/${weddingId}`,
              label: 'Otwórz zlecenie',
            },
          }
        }

        if (
          request.requestedRole !== 'all' &&
          scopedPlaces.length === 0
        ) {
          return {
            kind: 'places',
            wedding: stripNextAction(d.wedding),
            places: [],
            focusRole: effectiveRole,
            emptyMessage: isPrepScope(request.requestedRole)
              ? ASSISTANT_MISSING_PREPARATIONS
              : request.requestedRole === 'ceremony'
                ? ASSISTANT_MISSING_CEREMONY
                : ASSISTANT_NO_MATCH,
            navigate: {
              path: `/sluby/${weddingId}`,
              label: 'Otwórz zlecenie',
            },
          }
        }

        return {
          kind: 'places',
          wedding: stripNextAction(d.wedding),
          places: scopedPlaces,
          focusRole: request.requestedRole === 'all' ? 'all' : effectiveRole,
          navigate: {
            path: `/sluby/${weddingId}`,
            label: 'Otwórz zlecenie',
          },
        }
      }
      return { kind: 'error', message: ASSISTANT_NO_MATCH }
    }

    case 'wedding_day_plan': {
      const plan = await executeAssistantTool({
        name: 'get_wedding_day_plan',
        args: { weddingId },
      })
      if (plan.ok && plan.data && typeof plan.data === 'object') {
        const d = plan.data as {
          wedding: AssistantWeddingCardDto
          stops: Array<{
            key: string
            title: string
            time: string | null
            placeName: string | null
            address: string | null
            role?: string | null
          }>
        }
        const stops = d.stops ?? []
        if (stops.length === 0) {
          return {
            kind: 'day_plan',
            wedding: stripNextAction(d.wedding),
            stops: [],
            emptyMessage: ASSISTANT_MISSING_DAY_PLAN,
            navigate: {
              path: `/sluby/${weddingId}/dzien-slubu`,
              label: 'Otwórz plan dnia',
            },
          }
        }
        if (
          request.focus === 'ceremony' ||
          request.focus === 'preparations' ||
          request.focus === 'earliest'
        ) {
          const candidates = participantsFromCouple({
            partner1: d.wedding.partner1,
            partner2: d.wedding.partner2,
          })
          let participantKey: AssistantParticipantKey | null =
            request.participantKey ?? null
          if (
            request.focus === 'preparations' &&
            (request.participantKey ||
              request.participantRole ||
              request.resolver.personQuery)
          ) {
            const resolved = resolveParticipantReference({
              candidates,
              participantKey: request.participantKey,
              participantRole: request.participantRole,
              personQuery: request.resolver.personQuery,
            })
            if (resolved.status === 'not_found') {
              return {
                kind: 'error',
                message: ASSISTANT_PARTICIPANT_NOT_FOUND,
              }
            }
            if (resolved.status === 'ambiguous') {
              return {
                kind: 'clarification',
                question: ASSISTANT_PARTICIPANT_AMBIGUOUS,
                options: candidates.map((c) => ({
                  id: c.key,
                  label: c.canonicalName,
                  semantic: {
                    ...request,
                    participantKey: c.key,
                    resolver: {
                      ...request.resolver,
                      personQuery: null,
                      weddingId,
                    },
                  },
                })),
              }
            }
            if (resolved.status === 'resolved') {
              participantKey = resolved.key
            }
          }

          const roleKey =
            request.focus === 'preparations'
              ? participantKey
                ? placeRoleForParticipant(participantKey)
                : 'przygotow'
              : request.focus === 'ceremony'
                ? 'ceremon'
                : null
          let focused =
            roleKey
              ? stops.find((s) => {
                  const role = s.role ?? ''
                  if (
                    roleKey === 'bride_preparation' ||
                    roleKey === 'groom_preparation'
                  ) {
                    return role === roleKey
                  }
                  return (
                    new RegExp(roleKey, 'i').test(s.key) ||
                    new RegExp(roleKey, 'i').test(s.title) ||
                    new RegExp(roleKey, 'i').test(role)
                  )
                }) ?? null
              : null
          if (request.focus === 'earliest') {
            const withTime = stops.filter((s) => s.time)
            focused =
              withTime.length > 0
                ? withTime.reduce((a, b) =>
                    (a.time ?? '') <= (b.time ?? '') ? a : b,
                  )
                : stops[0] ?? null
          }
          if (focused?.time || (focused && request.focus === 'earliest')) {
            return {
              kind: 'day_plan',
              wedding: stripNextAction(d.wedding),
              stops: [focused],
              focus: request.focus === 'earliest' ? 'earliest' : request.focus,
              navigate: {
                path: `/sluby/${weddingId}/dzien-slubu`,
                label: 'Otwórz plan dnia',
              },
            }
          }
          if (request.focus === 'ceremony' || request.focus === 'preparations') {
            const placesTool = await executeAssistantTool({
              name: 'get_wedding_places',
              args: { weddingId },
            })
            const pdata = placesTool.data as {
              places?: AssistantPlaceRoleDto[]
            } | null
            const placeRole: PlaceRoleFilter =
              request.focus === 'ceremony'
                ? 'ceremony'
                : participantKey
                  ? placeRoleForParticipant(participantKey)
                  : 'preparations'
            const matched = filterPlaces(
              pdata?.places ?? [],
              placeRole,
              participantKey,
            )
            const c = matched[0]
            if (c) {
              return {
                kind: 'day_plan',
                wedding: stripNextAction(d.wedding),
                stops: [
                  {
                    key: c.role,
                    title: c.label,
                    time: c.time,
                    placeName: c.name,
                    address: c.address,
                    role: c.role,
                  },
                ],
                focus: request.focus,
                navigate: {
                  path: `/sluby/${weddingId}/dzien-slubu`,
                  label: 'Otwórz plan dnia',
                },
              }
            }
            // Focused answer with no matching stop — do not leak unrelated stops
            return {
              kind: 'day_plan',
              wedding: stripNextAction(d.wedding),
              stops: [],
              focus: request.focus,
              emptyMessage:
                request.focus === 'ceremony'
                  ? ASSISTANT_MISSING_CEREMONY_TIME
                  : ASSISTANT_MISSING_PREPARATIONS,
              navigate: {
                path: `/sluby/${weddingId}/dzien-slubu`,
                label: 'Otwórz plan dnia',
              },
            }
          }
        }
        return {
          kind: 'day_plan',
          wedding: stripNextAction(d.wedding),
          stops,
          focus: 'full',
          navigate: {
            path: `/sluby/${weddingId}/dzien-slubu`,
            label: 'Otwórz plan dnia',
          },
        }
      }
      return { kind: 'error', message: ASSISTANT_MISSING_DAY_PLAN }
    }

    case 'wedding_tasks': {
      const tasks = await executeAssistantTool({
        name: 'get_wedding_tasks',
        args: { weddingId },
      })
      if (tasks.ok && tasks.data && typeof tasks.data === 'object') {
        const d = tasks.data as {
          wedding: AssistantWeddingCardDto
          tasks: never[]
        }
        return {
          kind: 'tasks',
          wedding: stripNextAction(d.wedding),
          tasks: d.tasks ?? [],
          emptyMessage:
            (d.tasks ?? []).length === 0 ? ASSISTANT_EMPTY_TASKS : undefined,
        }
      }
      return { kind: 'error', message: ASSISTANT_NO_MATCH }
    }

    case 'wedding_next_action': {
      const summary = await executeAssistantTool({
        name: 'get_wedding_summary',
        args: { weddingId },
      })
      if (
        summary.ok &&
        summary.data &&
        typeof summary.data === 'object' &&
        !('found' in summary.data && (summary.data as { found?: boolean }).found === false)
      ) {
        const wedding = summary.data as AssistantWeddingCardDto
        return {
          kind: 'next_action',
          wedding: stripNextAction(wedding),
          title: wedding.nextActionTitle?.trim() || 'Brak zdefiniowanego następnego kroku',
          description: null,
        }
      }
      return { kind: 'error', message: ASSISTANT_NO_MATCH }
    }

    case 'open_wedding':
    case 'open_resource': {
      const summary = await executeAssistantTool({
        name: 'get_wedding_summary',
        args: { weddingId },
      })
      const wedding =
        summary.ok && summary.data && typeof summary.data === 'object'
          ? (summary.data as AssistantWeddingCardDto)
          : null
      if (
        !wedding ||
        ('found' in wedding && (wedding as { found?: boolean }).found === false)
      ) {
        return { kind: 'error', message: ASSISTANT_NO_MATCH }
      }
      // Navigation / open — never surface Next Action here
      return {
        kind: 'wedding',
        wedding: stripNextAction(wedding),
        navigate: {
          path: `/sluby/${wedding.id}`,
          label: 'Otwórz zlecenie',
        },
      }
    }

    case 'prepare_create_task': {
      const prepared = await executeAssistantTool({
        name: 'prepare_create_task',
        args: {
          title: request.title,
          dueDate: request.duePhrase ?? undefined,
          weddingId,
        },
      })
      if (prepared.ok && prepared.data && typeof prepared.data === 'object') {
        const d = prepared.data as Record<string, unknown>
        if (d.prepared) {
          return {
            kind: 'confirmation',
            action: 'create_task',
            prepared: {
              title: String(d.title),
              dueDate: (d.dueDate as string) ?? null,
              dueDateLabel: (d.dueDateLabel as string) ?? null,
              weddingId: (d.weddingId as string) ?? null,
              weddingDisplayName: (d.weddingDisplayName as string) ?? null,
            },
          }
        }
      }
      return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
    }

    default:
      return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }
}

/**
 * Execute a fully-formed semantic request (after parse or after choice).
 */
export async function executeAssistantSemanticRequest(input: {
  request: AssistantSemanticRequest
  pageContext?: PageContextHint | null
  sessionContext?: AssistantSessionContext | null
  /** Optional active wedding when sessionContext.weddingId is unset. */
  activeWeddingId?: string | null
  /** Original user text — only for year-choice pendingQuery rebuild */
  sourceText?: string | null
}): Promise<AssistantResponse> {
  const request = input.request
  const sessionContext: AssistantSessionContext | null | undefined = {
    weddingId:
      input.sessionContext?.weddingId ?? input.activeWeddingId ?? null,
  }

  if (request.kind === 'unsupported') {
    return { kind: 'unsupported', message: ASSISTANT_UNSUPPORTED }
  }
  if (request.kind === 'unrecognized') {
    return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }

  if (request.kind === 'prepare_create_wedding') {
    const prepared = await executeAssistantTool({
      name: 'prepare_create_wedding',
      args: {
        date: request.date,
        partner1: request.partner1,
        partner2: request.partner2,
      },
    })
    if (prepared.ok && prepared.data && typeof prepared.data === 'object') {
      const d = prepared.data as Record<string, unknown>
      if (d.needsYearChoice) {
        return {
          kind: 'choice',
          prompt: 'Który rok wybrać dla nowego zlecenia?',
          items: ((d.yearOptions as string[]) ?? []).map((date) => ({
            id: date,
            kind: 'wedding' as const,
            title: String(d.displayLabel),
            subtitle: formatPolishLongDate(date),
          })),
          pendingQuery: input.sourceText ?? null,
          pendingSemantic: request,
        }
      }
      if (d.prepared) {
        return {
          kind: 'confirmation',
          action: 'create_wedding',
          prepared: {
            partner1: String(d.partner1),
            partner2: String(d.partner2),
            date: String(d.date),
            displayLabel: String(d.displayLabel),
            dateLabel: String(d.dateLabel),
            duplicates: Array.isArray(d.duplicates)
              ? (d.duplicates as never)
              : [],
          },
        }
      }
    }
    return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }

  if (request.kind === 'schedule') {
    const result = await executeAssistantTool({
      name: 'get_schedule_for_date',
      args: { date: request.datePhrase },
    })
    if (result.ok && result.data && typeof result.data === 'object') {
      const d = result.data as {
        date: string
        dateLabel: string
        items: never[]
      }
      return {
        kind: 'schedule',
        date: d.date,
        dateLabel: d.dateLabel,
        items: d.items ?? [],
      }
    }
    return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }

  if (request.kind === 'aggregate') {
    const range = resolveAggregateDateRange(request.datePhrase)
    if (!range) {
      return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
    }

    const nav = {
      path: '/kalendarz',
      label: 'Otwórz kalendarz',
    } as const

    if (request.metric === 'count') {
      const toolName =
        request.scope === 'weddings'
          ? 'get_wedding_count_for_range'
          : request.scope === 'sessions'
            ? 'get_session_count_for_range'
            : 'get_assignment_count_for_range'
      const result = await executeAssistantTool({
        name: toolName,
        args: { from: range.from, to: range.to },
      })
      if (!result.ok || !result.data || typeof result.data !== 'object') {
        return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
      }
      const count = Number((result.data as { count?: number }).count ?? 0)
      return {
        kind: 'aggregate',
        metric: 'count',
        scope: request.scope,
        titleLabel: range.titleLabel,
        rangeLabel: range.rangeLabel,
        from: range.from,
        to: range.to,
        count: Number.isFinite(count) ? count : 0,
        unitLabel: polishCountUnit(request.scope, count),
        navigate: nav,
      }
    }

    // contract_value / count_and_value — weddings only (validated upstream)
    const result = await executeAssistantTool({
      name: 'get_wedding_contract_value_sum_for_range',
      args: { from: range.from, to: range.to },
    })
    if (!result.ok || !result.data || typeof result.data !== 'object') {
      return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
    }
    const d = result.data as {
      count?: number
      totalContractValue?: number
      currency?: string
    }
    const count = Number(d.count ?? 0)
    const total = Number(d.totalContractValue ?? 0)
    return {
      kind: 'aggregate',
      metric: request.metric,
      scope: 'weddings',
      titleLabel: range.titleLabel,
      rangeLabel: range.rangeLabel,
      from: range.from,
      to: range.to,
      count: Number.isFinite(count) ? count : 0,
      totalContractValue: Number.isFinite(total) ? total : 0,
      currency: d.currency ?? 'PLN',
      unitLabel: polishCountUnit('weddings', count),
      navigate: { path: '/finanse', label: 'Otwórz finanse' },
    }
  }

  if (request.kind === 'open_session') {
    return openSessionByPerson(request.resolver.personQuery)
  }

  if (request.kind === 'prepare_create_task') {
    const needsWedding =
      Boolean(request.weddingQuery) ||
      Boolean(request.weddingId) ||
      Boolean(sessionContext?.weddingId) ||
      input.pageContext?.resourceType === 'wedding'

    if (needsWedding) {
      const resolved = await resolveWeddingTarget({
        resolver: {
          personQuery: request.weddingQuery,
          dateHint: null,
          weddingId: request.weddingId,
        },
        pageContext: input.pageContext,
        sessionContext,
      })
      if (resolved.status === 'none') {
        return { kind: 'error', message: ASSISTANT_NO_MATCH }
      }
      if (resolved.status === 'many') {
        return choiceForPending(resolved.weddings, request)
      }
      if (resolved.status === 'one') {
        return executeOnWedding(request, resolved.wedding.id)
      }
      // need_person without weddingQuery — fall through to loose create
    }
    return executePrepareCreateTaskLoose(request)
  }

  // Wedding-scoped intents
  const resolver = getWeddingResolver(request)
  if (!resolver) {
    return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }

  const resolved = await resolveWeddingTarget({
    resolver,
    pageContext: input.pageContext,
    sessionContext,
  })

  if (resolved.status === 'need_person') {
    return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
  }
  if (resolved.status === 'none') {
    if (request.kind === 'open_resource') {
      return openSessionByPerson(resolver.personQuery)
    }
    // Participant-scoped intents with active session wedding: bind wedding and
    // let participant resolution fail closed (avoid false "no wedding found").
    if (
      sessionContext?.weddingId &&
      resolver.personQuery &&
      (request.kind === 'wedding_places' ||
        request.kind === 'wedding_day_plan' ||
        request.kind === 'wedding_finances' ||
        request.kind === 'wedding_tasks' ||
        request.kind === 'wedding_next_action')
    ) {
      return executeOnWedding(request, sessionContext.weddingId)
    }
    return { kind: 'error', message: ASSISTANT_NO_MATCH }
  }
  if (resolved.status === 'many') {
    return choiceForPending(resolved.weddings, request)
  }

  return executeOnWedding(request, resolved.wedding.id)
}

async function executePrepareCreateTaskLoose(
  request: Extract<AssistantSemanticRequest, { kind: 'prepare_create_task' }>,
): Promise<AssistantResponse> {
  const prepared = await executeAssistantTool({
    name: 'prepare_create_task',
    args: {
      title: request.title,
      dueDate: request.duePhrase ?? undefined,
      weddingId: request.weddingId ?? undefined,
    },
  })
  if (prepared.ok && prepared.data && typeof prepared.data === 'object') {
    const d = prepared.data as Record<string, unknown>
    if (d.prepared) {
      return {
        kind: 'confirmation',
        action: 'create_task',
        prepared: {
          title: String(d.title),
          dueDate: (d.dueDate as string) ?? null,
          dueDateLabel: (d.dueDateLabel as string) ?? null,
          weddingId: (d.weddingId as string) ?? null,
          weddingDisplayName: (d.weddingDisplayName as string) ?? null,
        },
      }
    }
  }
  return { kind: 'error', message: ASSISTANT_UNRECOGNIZED }
}

/** Wedding id from a successful intent-specific response (for session follow-up). */
export function weddingIdFromResponse(
  response: AssistantResponse,
): string | null {
  switch (response.kind) {
    case 'finance':
      return response.finance.weddingId
    case 'places':
    case 'day_plan':
    case 'next_action':
    case 'wedding':
      return response.wedding.id
    case 'tasks':
      return response.wedding?.id ?? response.tasks[0]?.weddingId ?? null
    case 'confirmation':
      if (response.action === 'create_task') {
        return response.prepared.weddingId
      }
      return null
    default:
      return null
  }
}
