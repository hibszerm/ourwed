/**
 * Calendar first-paint performance architecture.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/performance/calendarFirstPaintAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const page = read('src/pages/CalendarPage.tsx')
const hooks = read('src/features/calendar/hooks/useCalendarLightQueries.ts')
const light = read('src/lib/api/calendarLightService.ts')
const calEvents = read('src/lib/api/calendarEventService.ts')
const perf = read('src/lib/performance/devPerf.ts')
const invalidateWedding = read(
  'src/features/weddings/hooks/useInvalidateWedding.ts',
)

{
  assertNotIncludes(page, 'useWeddings', 'CalendarPage does not use full useWeddings')
  assertNotIncludes(page, 'useSessions()', 'CalendarPage does not use full useSessions')
  assertNotIncludes(
    page,
    'weddingService.getAll',
    'CalendarPage does not call getAll',
  )
  assertNotIncludes(
    page,
    'finalizeWeddingView',
    'no finalize on Calendar page',
  )
  assertIncludes(page, 'useCalendarWeddings', 'light weddings hook')
  assertIncludes(page, 'useCalendarSessions', 'light sessions hook')
  assertIncludes(page, 'useCalendarEvents', 'events list hook')
  assertNotIncludes(
    page,
    'queryFn: () => calendarEventService.syncWeddingDayEvents',
    'queryFn must not be syncWeddingDayEvents',
  )
  assertNotIncludes(
    page,
    "queryKey: ['calendar', user?.id, weddings.map",
    'no wedding-id-joined calendar query key on critical path',
  )
  assertIncludes(
    page,
    'calendarEventService.syncWeddingDayEvents',
    'repair still exists deferred',
  )
  assertIncludes(page, "withDevPerf('calendar.repair'", 'repair is DEV-timed')
  assertIncludes(
    page,
    'queryClient.setQueryData(calendarEventsQueryKey',
    'repair updates cache without blanking',
  )
  console.log('PASS  CalendarPage first-paint wiring')
}

{
  assertIncludes(hooks, "['calendar', 'weddings'", 'weddings key under calendar prefix')
  assertIncludes(hooks, "['calendar', 'sessions'", 'sessions key under calendar prefix')
  assertIncludes(hooks, "['calendar', 'events'", 'events key under calendar prefix')
  assertIncludes(hooks, 'calendarLightService.listWeddingsForCalendar', 'light weddings fn')
  assertIncludes(hooks, 'calendarLightService.listSessionsForCalendar', 'light sessions fn')
  assertIncludes(hooks, 'calendarEventService.listAll', 'events listAll only')
  assertNotIncludes(hooks, 'syncWeddingDayEvents', 'hooks do not sync')
  assertNotIncludes(hooks, 'finalizeWedding', 'hooks no finalize')
  console.log('PASS  calendar light query hooks')
}

{
  assertIncludes(light, 'CALENDAR_LIGHT_WEDDING_SELECT', 'pinned wedding select')
  assertIncludes(light, 'CALENDAR_LIGHT_SESSION_SELECT', 'pinned session select')
  assertIncludes(light, 'mapWeddingRowToModel', 'scalar wedding map')
  assertIncludes(light, 'mapSessionRowToModel', 'scalar session map')
  assertNotIncludes(light, 'finalizeWeddingViews(', 'no finalize call in light service')
  assertNotIncludes(light, 'finalizeWeddingView(', 'no finalize call in light service')
  assertNotIncludes(light, 'weddingService.getAll(', 'no getAll call in light service')
  assertNotIncludes(light, 'sessionPaymentService', 'no session payments')
  assertNotIncludes(light, 'withPayments', 'no payment hydrate')
  assertNotIncludes(light, 'paymentService', 'no wedding payments')
  assertNotIncludes(light, 'noteService', 'no notes')
  assertNotIncludes(light, 'contractService', 'no contracts')
  assertNotIncludes(light, 'galleryService', 'no galleries')
  assertNotIncludes(light, 'form_answers', 'no questionnaire answers')
  assertIncludes(light, "withDevPerf('calendar.light-weddings'", 'wedding phase')
  assertIncludes(light, "withDevPerf('calendar.light-sessions'", 'session phase')
  console.log('PASS  calendar light service')
}

{
  assertIncludes(calEvents, 'ensureWeddingDayInFlight', 'ensure single-flight')
  assertIncludes(calEvents, 'syncWeddingDayInFlight', 'sync single-flight')
  assertIncludes(calEvents, 'needsEnsure', 'smart sync preserved')
  assertNotIncludes(calEvents, 'weddingService.getAll', 'events svc still no getAll')
  console.log('PASS  duplicate-safe deferred sync')
}

{
  assertIncludes(invalidateWedding, "queryKey: ['calendar']", 'wedding invalidate hits calendar')
  console.log('PASS  calendar invalidation from wedding mutations')
}

{
  assertIncludes(perf, "'calendar.light-weddings'", 'perf label weddings')
  assertIncludes(perf, "'calendar.light-sessions'", 'perf label sessions')
  assertIncludes(perf, "'calendar.events'", 'perf label events')
  assertIncludes(perf, "'calendar.repair'", 'perf label repair')
  console.log('PASS  DEV instrumentation labels')
}

console.log('\nAll calendar first-paint acceptance checks passed.')
