/**
 * Run: npm run test:dashboard-location-label
 */
import {
  toCalendarEvent,
  toCalendarSessionEvent,
} from '@/features/calendar/utils/calendarEvents'
import {
  DASHBOARD_LOCATION_MISSING,
  getDashboardLocationLabel,
  getDashboardSessionLocationLabel,
  getDashboardWeddingLocationLabel,
} from '@/features/dashboard/presentation/getDashboardLocationLabel'
import type { Session } from '@/types/session'
import type { Couple, Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(
      `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
    )
  }
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'A',
    partner2: 'B',
    email: '',
    phone: '',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2026-08-01',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Pakiet',
    price: 0,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function place(
  role: WeddingPlace['role'],
  partial: Partial<WeddingPlace> = {},
): WeddingPlace {
  return {
    id: `${role}-1`,
    weddingId: 'w1',
    role,
    label: null,
    formattedAddress: '',
    placeId: null,
    latitude: null,
    longitude: null,
    sortOrder: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...partial,
  }
}

{
  const places = [
    place('reception', {
      label: 'Willa Słoneczna w Dębowcu',
      formattedAddress: 'ul. Przykładowa 1, 38-220 Dębowiec',
    }),
  ]
  const label = getDashboardWeddingLocationLabel(wedding(), places)
  assertEq(
    label.primary,
    'Willa Słoneczna w Dębowcu, Dębowiec',
    'GeoPlace name + locality',
  )
  assert(!label.primary.includes('ul.'), 'no street when venue exists')
}

{
  const label = getDashboardWeddingLocationLabel(
    wedding({
      couple: couple({ venue: 'Pałac Brunów', city: 'Brunów' }),
    }),
  )
  assertEq(label.primary, 'Pałac Brunów, Brunów', 'manual venue + town')
  assert(!label.missing, 'not missing')
}

{
  const label = getDashboardWeddingLocationLabel(
    wedding({
      receptionLocation: 'ul. Kwiatowa 12, 30-001 Kraków',
    }),
  )
  assert(Boolean(label.primary), 'formatted-address fallback present')
  assert(!label.primary.includes('ul. Kwiatowa 12, 30-001'), 'not full street dump')
}

{
  const places = [
    place('ceremony', {
      label: 'Kościół św. Anny',
      formattedAddress: 'ul. św. Anny 1, 31-008 Kraków',
    }),
  ]
  const label = getDashboardWeddingLocationLabel(wedding(), places)
  assertEq(
    label.primary,
    'Kościół św. Anny, Kraków',
    'ceremony fallback',
  )
}

{
  const label = getDashboardWeddingLocationLabel(wedding())
  assertEq(label.primary, DASHBOARD_LOCATION_MISSING, 'missing location')
  assert(label.missing, 'missing flag')
}

{
  const s: Session = {
    id: 's1',
    date: '2026-08-01',
    primaryPerson: { firstName: 'Kasia' },
    sessionType: 'engagement',
    totalPrice: 0,
    depositAmount: 0,
    payments: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    location: {
      name: 'Park Jordana',
      formattedAddress: 'ul. Fredry 1, 30-605 Kraków',
    },
  }
  const label = getDashboardSessionLocationLabel(s)
  assertEq(label.primary, 'Park Jordana, Kraków', 'session location')
  assert(!label.missing, 'session not missing')
}

{
  const w = wedding()
  const places = [
    place('reception', {
      label: 'Dom Weselny Magnolia',
      formattedAddress: 'Izdebnik 12, 34-100 Izdebnik',
    }),
  ]
  const nearest = getDashboardLocationLabel(toCalendarEvent(w), { places })
  const upcoming = getDashboardWeddingLocationLabel(w, places)
  assertEq(nearest.primary, upcoming.primary, 'nearest/upcoming same formatter')
  assertEq(
    nearest.primary,
    'Dom Weselny Magnolia, Izdebnik',
    'venue + town shared',
  )
}

{
  const job = toCalendarSessionEvent({
    id: 's2',
    date: '2026-08-01',
    primaryPerson: { firstName: 'Marta' },
    sessionType: 'engagement',
    totalPrice: 0,
    depositAmount: 0,
    payments: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  })
  assertEq(
    getDashboardLocationLabel(job).primary,
    DASHBOARD_LOCATION_MISSING,
    'session missing',
  )
}

console.log('PASS  dashboard location label')
