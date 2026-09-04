/**
 * Modern Session Detail — Phase 2 acceptance.
 * Run: npm run test:modern-session-detail
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScreenPresentation } from '@/features/interface-style/types'
import {
  composeSessionHeaderMetaLine,
  composeSessionHeroCountdown,
  composeSessionHeroMeta,
} from '@/features/sessions/modern-detail/sessionDetailPresentation'
import type { Session } from '@/types/session'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

function session(partial: Partial<Session> = {}): Session {
  return {
    id: 's1',
    customName: 'Park Śląski',
    primaryPerson: { firstName: 'Anna', lastName: 'Kowalska' },
    secondaryPerson: { firstName: 'Michał', lastName: 'Nowak' },
    sessionType: 'engagement',
    date: '2026-09-12',
    startTime: '16:30',
    endTime: '18:00',
    location: {
      name: 'Park Śląski',
      formattedAddress: 'Chorzów',
    },
    totalPrice: 2500,
    depositAmount: 500,
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

{
  assertEq(
    resolveScreenPresentation('session', 'classic'),
    'classic',
    'classic style keeps classic session detail',
  )
  assertEq(
    resolveScreenPresentation('session', 'modern'),
    'modern',
    'modern style selects modern session detail',
  )
  assertEq(
    resolveScreenPresentation('sessions', 'modern'),
    'modern',
    'sessions list remains separately registered',
  )
  console.log('PASS  interface-style session detail registry')
}

{
  const router = read('src/routes/router.tsx')
  const route = read('src/pages/SessionDetailRoutePage.tsx')
  const classic = read('src/pages/SessionDetailPage.tsx')
  const modern = read('src/pages/SessionDetailModernPage.tsx')
  assertIncludes(router, 'SessionDetailRoutePage', 'router uses route wrapper')
  assertNotIncludes(router, 'SessionDetailPage', 'router does not mount classic directly')
  assertIncludes(route, "resolveScreenPresentation('session'", 'route resolves session screen')
  assertIncludes(route, '<SessionDetailPage />', 'classic fallback')
  assertIncludes(route, '<SessionDetailModernPage />', 'modern branch')
  assertNotIncludes(classic, 'useInterfaceStyle', 'classic page has no style branching')
  assertIncludes(modern, 'PageContainer width="full"', 'modern shell width family')
  assertIncludes(modern, 'ModernSessionDetailWorkspace', 'modern workspace')
  assertNotIncludes(modern, 'title=', 'no duplicate AppLayout title on modern page')
  console.log('PASS  route architecture')
}

{
  const workspace = read(
    'src/features/sessions/modern-detail/ModernSessionDetailWorkspace.tsx',
  )
  const overview = read(
    'src/features/sessions/modern-detail/ModernSessionOverview.tsx',
  )
  const header = read(
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx',
  )
  assertNotIncludes(workspace, 'WeddingWorkspaceTab', 'no wedding tabs')
  assertNotIncludes(workspace, 'setTab', 'no tab state')
  assertNotIncludes(overview, 'Ankieta', 'no questionnaire')
  assertNotIncludes(overview, 'Logistyka', 'no logistics')
  assertNotIncludes(overview, 'Historia', 'no historia')
  assertNotIncludes(overview, 'deliveryDueDate', 'no delivery deadlines')
  assertNotIncludes(overview, 'TravelFee', 'no travel fee')
  assertNotIncludes(header, 'Archiwizuj', 'no archive action')
  assertNotIncludes(header, 'do ślubu', 'no wedding countdown copy')
  assertNotIncludes(header, 'po ślubie', 'no wedding past copy')
  assertNotIncludes(header, 'ślubie', 'no wedding past unit')
  console.log('PASS  no tabs / no wedding-only features')
}

{
  const header = read(
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx',
  )
  const headerCss = read(
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.module.css',
  )
  assertIncludes(header, 'composeSessionHeroMeta', 'session hero meta')
  assertIncludes(header, 'getSessionDisplayName', 'session title')
  assertIncludes(header, 'modern-session-header-date', 'date rail test id')
  assertIncludes(header, 'modern-session-header-countdown', 'countdown test id')
  assertIncludes(header, 'Edytuj sesję', 'edit action')
  assertIncludes(header, 'Usuń', 'delete action')
  assertIncludes(header, '/sesje/${sessionId}/edytuj', 'edit route')
  assertIncludes(header, 'window.confirm', 'delete confirm preserved')
  assertIncludes(header, 'requirePro', 'PRO gate on delete')
  assertIncludes(headerCss, 'max-width: 767px', 'mobile breakpoint ≤767')
  assertNotIncludes(headerCss, 'max-width: 700px', 'no legacy 700px hero breakpoint')
  assertIncludes(headerCss, 'width: 44px', 'overflow ≥44px on mobile')
  console.log('PASS  hero anatomy + actions')
}

{
  const today = '2026-09-12'
  const future = composeSessionHeroCountdown('2026-09-20', today)
  assertEq(future?.kind, 'future', 'future countdown')
  assertEq(future?.value, '8', 'days value')
  assertEq(future?.unit, 'dni', 'days unit')
  assertEq(future?.caption, 'do sesji', 'session caption')
  const todayCd = composeSessionHeroCountdown('2026-09-12', today)
  assertEq(todayCd?.value, 'DZIŚ', 'today')
  const past = composeSessionHeroCountdown('2026-09-01', today)
  assertEq(past?.value, 'PO', 'past value')
  assertEq(past?.unit, 'sesji', 'past session unit')
  assert(past?.unit !== 'ślubie', 'not wedding past')
  const one = composeSessionHeroCountdown('2026-09-13', today)
  assertEq(one?.value, '1', 'one day')
  assertEq(one?.unit, 'dzień', 'singular day')
  assertEq(one?.caption, 'do sesji', 'session caption singular')

  const meta = composeSessionHeaderMetaLine(session())
  assertIncludes(meta ?? '', 'Park Śląski', 'location in meta')
  assertIncludes(meta ?? '', 'Narzeczeńska', 'type in meta')
  assertIncludes(meta ?? '', '16:30–18:00', 'time in meta')
  assertEq(
    composeSessionHeaderMetaLine(
      session({
        location: undefined,
        startTime: undefined,
        endTime: undefined,
      }),
    ),
    'Narzeczeńska',
    'omits empty meta segments',
  )
  const hero = composeSessionHeroMeta(session(), today)
  assert(hero.dateParts != null, 'date parts')
  assert(hero.countdown != null, 'countdown')
  console.log('PASS  session countdown + meta composers')
}

{
  const overview = read(
    'src/features/sessions/modern-detail/ModernSessionOverview.tsx',
  )
  const workspace = read(
    'src/features/sessions/modern-detail/ModernSessionDetailWorkspace.tsx',
  )
  const overviewCss = read(
    'src/features/sessions/modern-detail/ModernSessionOverview.module.css',
  )
  assertIncludes(overview, 'modern-session-finance', 'finance card')
  assertIncludes(overview, 'Wartość', 'value label')
  assertIncludes(overview, 'Ustalona zaliczka', 'agreed deposit')
  assertIncludes(overview, 'Wpłacono', 'paid')
  assertIncludes(overview, 'Pozostało', 'remaining')
  assertIncludes(overview, 'Dodaj zaliczkę', 'deposit CTA')
  assertIncludes(overview, 'Dodaj wpłatę', 'payment CTA')
  assertIncludes(overview, 'EntityCalendarStatus', 'calendar status')
  assertIncludes(overview, 'Otwórz ślub', 'open wedding')
  assertIncludes(overview, 'Dodaj powiązanie', 'add link')
  assertIncludes(overview, 'Brak notatek', 'notes empty')
  assertIncludes(workspace, 'buildSessionCommercialSummary', 'finance helper')
  assertIncludes(workspace, 'SessionPaymentModal', 'payment modal')
  assertIncludes(workspace, 'hasPaidDepositPayment', 'deposit sequencing')
  assertIncludes(workspace, 'suggestedAmount', 'deposit suggestion')
  assertIncludes(workspace, 'sessionPaymentService.delete', 'payment delete')
  assertIncludes(workspace, 'useDeleteSession', 'session delete')
  assertIncludes(workspace, "navigate('/sesje')", 'redirect after delete')
  // Single finance surface — no second KPI band
  assertNotIncludes(overview, 'overviewBand', 'no classic overview band')
  assertEq(
    (overview.match(/Ustalona zaliczka/g) ?? []).length,
    1,
    'agreed deposit shown once',
  )
  assertIncludes(overviewCss, 'max-width: 767px', 'overview mobile ≤767')
  assertNotIncludes(overviewCss, 'max-width: 700px', 'no legacy 700px overview')
  assert(!/(?<![-\w])width:\s*390px/.test(overviewCss), 'no fixed 390px width')
  assert(!/(?<![-\w])min-width:\s*320px/.test(overviewCss), 'no fixed min-width trap')
  console.log('PASS  overview + finance + payments wiring')
}

{
  const weddingHeader = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx',
  )
  const weddingHero = read(
    'src/features/weddings/modern-detail/ModernWeddingIdentityHero.tsx',
  )
  assertIncludes(weddingHeader, 'ModernWeddingIdentityHero', 'wedding header intact')
  assertIncludes(weddingHero, 'composeModernWeddingHeaderMeta', 'wedding meta intact')
  assertNotIncludes(
    read('src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx'),
    'ModernWeddingIdentityHero',
    'session does not import wedding hero',
  )
  console.log('PASS  wedding detail freeze (session-specific hero)')
}

{
  const listWorkspace = read(
    'src/features/sessions/modern/ModernSessionsWorkspace.tsx',
  )
  assertIncludes(listWorkspace, 'ModernSessionsWorkspace', 'list workspace present')
  assertNotIncludes(
    read('src/features/sessions/modern-detail/ModernSessionDetailWorkspace.tsx'),
    'ModernSessionsWorkspace',
    'detail does not import list workspace',
  )
  console.log('PASS  sessions list isolation')
}

{
  const cssBundle = [
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.module.css',
    'src/features/sessions/modern-detail/ModernSessionOverview.module.css',
    'src/features/sessions/modern-detail/ModernSessionDetailWorkspace.module.css',
    'src/pages/SessionDetailModernPage.module.css',
  ]
    .map(read)
    .join('\n')
  assert(!/#[0-9a-fA-F]{3,8}\b/.test(cssBundle), 'no hardcoded hex colors')
  assertIncludes(cssBundle, 'var(--color-text-primary)', 'semantic text token')
  assertIncludes(
    read('src/features/sessions/modern-detail/ModernSessionDetailHeader.module.css'),
    '--v3-surface-hero',
    'v3 hero surface',
  )
  console.log('PASS  semantic tokens / dark-ready')
}

console.log('\nAll modern session detail acceptance guards passed.')
