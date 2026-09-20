/**
 * V7 fixture CRM — isolated, no live DB. Finance fields mirror canonical semantics.
 */

import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import type { Wedding, WeddingContact, Payment } from '@/types/wedding'
import type { Session } from '@/types/session'
import {
  getContractValue,
  getRemainingToPay,
  getTotalPaid,
  hasPaidDepositPayment,
  getEffectiveTravelFeeAmount,
} from '../../shared/adapters/financeAuthority'
import type { WeddingReadContextOverrides } from '../../shared/adapters/WeddingReadContext'
import type { SessionReadContextOverrides } from '../../shared/adapters/SessionReadContext'
import { sessionToCollectionRow } from '../../shared/execution/sessionUniverse'
import type { V7ToolDeps } from '../tools/execute'
import { buildLogisticsSnapshot } from './v7LogisticsFixture'

export const V7_FIXTURE_TODAY = '2026-09-15'

type FixtureWedding = {
  id: string
  label: string
  date: string
  brideName: string
  groomName: string
  bridePhone: string | null
  groomPhone: string | null
  place: string
  contractValue: number
  paidAmount: number
  depositPaid: boolean
  signed: boolean
  packageName: string
  travelFee: number | null
}

/**
 * Realistic studio snapshot for falsification + deterministic tests.
 * remaining = contract - paid (canonical getRemainingToPay shape).
 */
export const V7_FIXTURE_WEDDINGS: FixtureWedding[] = [
  {
    id: 'w-julia-adam',
    label: 'Julia & Adam',
    date: '2026-10-12',
    brideName: 'Julia Nowak',
    groomName: 'Adam Kowalski',
    bridePhone: '+48 500 111 222',
    groomPhone: '+48 500 333 444',
    place: 'Villa Love',
    contractValue: 12000,
    paidAmount: 3600,
    depositPaid: true,
    signed: true,
    packageName: 'Gold',
    travelFee: 800,
  },
  {
    id: 'w-anna-piotr',
    label: 'Anna & Piotr',
    date: '2026-11-08',
    brideName: 'Anna Wiśniewska',
    groomName: 'Piotr Zieliński',
    bridePhone: '+48 501 222 333',
    groomPhone: null,
    place: 'Pałac Majątek',
    contractValue: 15000,
    paidAmount: 0,
    depositPaid: false,
    signed: false,
    packageName: 'Silver',
    travelFee: null,
  },
  {
    id: 'w-ola-marek',
    label: 'Ola & Marek',
    date: '2026-12-20',
    brideName: 'Aleksandra Lis',
    groomName: 'Marek Wójcik',
    bridePhone: '+48 502 444 555',
    groomPhone: '+48 502 666 777',
    place: 'Villa Love',
    contractValue: 9800,
    paidAmount: 4900,
    depositPaid: true,
    signed: true,
    packageName: 'Gold',
    travelFee: 400,
  },
  {
    id: 'w-kasia-tomek',
    label: 'Kasia & Tomek',
    date: '2026-09-28',
    brideName: 'Katarzyna Dąb',
    groomName: 'Tomasz Król',
    bridePhone: null,
    groomPhone: '+48 503 777 888',
    place: 'Dwór Leśny',
    contractValue: 11000,
    paidAmount: 2000,
    depositPaid: true,
    signed: true,
    packageName: 'Platinum',
    travelFee: 0,
  },
  {
    id: 'w-ewa-bartek',
    label: 'Ewa & Bartek',
    date: '2027-03-14',
    brideName: 'Ewa Kamińska',
    groomName: 'Bartosz Nowicki',
    bridePhone: '+48 504 999 000',
    groomPhone: '+48 504 111 000',
    place: 'Villa Love',
    contractValue: 14000,
    paidAmount: 7000,
    depositPaid: true,
    signed: true,
    packageName: 'Gold',
    travelFee: 1200,
  },
  {
    id: 'w-magda-igor',
    label: 'Magda & Igor',
    date: '2028-06-01',
    brideName: 'Magdalena Biała',
    groomName: 'Igor Czarny',
    bridePhone: '+48 505 222 111',
    groomPhone: '+48 505 333 222',
    place: 'Villa Love',
    contractValue: 16000,
    paidAmount: 16000,
    depositPaid: true,
    signed: true,
    packageName: 'Platinum',
    travelFee: 500,
  },
  {
    id: 'w-past-done',
    label: 'Past & Done',
    date: '2026-05-01',
    brideName: 'Past Bride',
    groomName: 'Past Groom',
    bridePhone: '+48 506 000 000',
    groomPhone: '+48 506 000 001',
    place: 'Stary Dwór',
    contractValue: 9000,
    paidAmount: 9000,
    depositPaid: true,
    signed: true,
    packageName: 'Silver',
    travelFee: 0,
  },
]

type FixtureSession = {
  id: string
  customName: string
  date: string
  sessionType: Session['sessionType']
  startTime?: string
  endTime?: string
  locationName: string
  totalPrice: number
  depositAmount: number
  paidAmount: number
  linkedWeddingId?: string
}

/**
 * Session fixture — date required; times optional (availability is date-level).
 * s-conflict-wedding shares 2026-10-12 with w-julia-adam (dual occupancy).
 * s-free-day sits on 2026-09-20 with no wedding that day.
 */
export const V7_FIXTURE_SESSIONS: FixtureSession[] = [
  {
    id: 's-engagement-oct',
    customName: 'Sesja narzeczeńska Julia',
    date: '2026-10-05',
    sessionType: 'engagement',
    startTime: '16:00',
    endTime: '18:00',
    locationName: 'Park Łazienki',
    totalPrice: 1500,
    depositAmount: 500,
    paidAmount: 500,
    linkedWeddingId: 'w-julia-adam',
  },
  {
    id: 's-conflict-wedding',
    customName: 'Sesja rodzinna konflikt',
    date: '2026-10-12',
    sessionType: 'family',
    locationName: 'Studio Centrum',
    totalPrice: 800,
    depositAmount: 200,
    paidAmount: 0,
  },
  {
    id: 's-sept-twenty',
    customName: 'Sesja 20 września',
    date: '2026-09-20',
    sessionType: 'other',
    locationName: 'Plaża Sopot',
    totalPrice: 1200,
    depositAmount: 300,
    paidAmount: 300,
    linkedWeddingId: 'w-kasia-tomek',
  },
  {
    id: 's-nov-post',
    customName: 'Sesja poplubna Anna',
    date: '2026-11-15',
    sessionType: 'postWedding',
    startTime: '11:00',
    locationName: 'Las Kabacki',
    totalPrice: 2000,
    depositAmount: 600,
    paidAmount: 600,
    linkedWeddingId: 'w-anna-piotr',
  },
]

export function toFixtureSession(f: FixtureSession): Session {
  const payments =
    f.paidAmount > 0
      ? [
          {
            id: `sp-${f.id}`,
            sessionId: f.id,
            amount: f.paidAmount,
            label: 'Wpłata',
            paid: true,
            paidAt: '2026-01-01',
            type: 'deposit' as const,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]
      : []
  return {
    id: f.id,
    customName: f.customName,
    primaryPerson: { firstName: 'Klient', lastName: 'Sesji' },
    sessionType: f.sessionType,
    date: f.date,
    startTime: f.startTime,
    endTime: f.endTime,
    location: { name: f.locationName },
    totalPrice: f.totalPrice,
    depositAmount: f.depositAmount,
    payments: payments as Session['payments'],
    linkedWeddingId: f.linkedWeddingId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

export function buildV7FixtureSessionUniverse() {
  return V7_FIXTURE_SESSIONS.map((f) => sessionToCollectionRow(toFixtureSession(f)))
}

export function buildV7FixtureUniverse(): CollectionMoneyRow[] {
  return V7_FIXTURE_WEDDINGS.map((w) => ({
    id: w.id,
    // Match production getWeddingDisplayName shape (full couple names), not short UI chips.
    displayLabel: `${w.brideName} i ${w.groomName}`,
    date: w.date,
    contractValue: w.contractValue,
    paidAmount: w.paidAmount,
    remainingAmount: w.contractValue - w.paidAmount,
    locationHaystack: [w.place],
    locationByRole: { reception: [w.place] },
  }))
}

function toWedding(f: FixtureWedding): Wedding {
  return {
    id: f.id,
    couple: {
      partner1: f.brideName,
      partner2: f.groomName,
      partner1Phone: f.bridePhone ?? '',
      partner2Phone: f.groomPhone ?? '',
      email: '',
      phone: '',
      venue: f.place,
      city: '',
    },
    date: f.date,
    status: 'active',
    workflowStage: 'deposit',
    packageName: f.packageName,
    price: f.contractValue,
    depositAmount: Math.round(f.contractValue * 0.3),
    currency: 'PLN',
    packageItems: [],
    primaryLocation: { displayText: f.place },
    receptionLocation: f.place,
    travelFeeStatus: f.travelFee == null ? 'pending' : 'charged',
    travelFeeAmount: f.travelFee ?? undefined,
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'sent' },
    },
    contract: { status: f.signed ? 'signed' : 'draft' },
    notes: [],
    deliverables: [],
  } as unknown as Wedding
}

function toContacts(_f: FixtureWedding): WeddingContact[] {
  return []
}

function toPayments(f: FixtureWedding): Payment[] {
  if (f.paidAmount <= 0) return []
  const payments: Payment[] = []
  if (f.depositPaid) {
    const deposit = Math.min(f.paidAmount, Math.round(f.contractValue * 0.3))
    payments.push({
      id: `p-dep-${f.id}`,
      label: 'Zadatek',
      amount: deposit,
      type: 'deposit',
      paid: true,
      paidAt: '2026-01-01',
    } as Payment)
    const rest = f.paidAmount - deposit
    if (rest > 0) {
      payments.push({
        id: `p-inst-${f.id}`,
        label: 'Rata',
        amount: rest,
        type: 'installment',
        paid: true,
        paidAt: '2026-03-01',
      } as Payment)
    }
  } else {
    payments.push({
      id: `p-${f.id}`,
      label: 'Płatność',
      amount: f.paidAmount,
      type: 'installment',
      paid: true,
      paidAt: '2026-01-01',
    } as Payment)
  }
  return payments
}

export function buildV7FixtureDeps(): V7ToolDeps {
  const byId = new Map(V7_FIXTURE_WEDDINGS.map((w) => [w.id, w]))
  const sessionsById = new Map(
    V7_FIXTURE_SESSIONS.map((s) => [s.id, toFixtureSession(s)]),
  )
  const universe = buildV7FixtureUniverse()
  const sessionUniverse = buildV7FixtureSessionUniverse()

  const contextOptions: WeddingReadContextOverrides = {
    loadWedding: async (id) => {
      const f = byId.get(id)
      return f ? toWedding(f) : null
    },
    loadContacts: async (id) => {
      const f = byId.get(id)
      return f ? toContacts(f) : []
    },
    loadPayments: async (id) => {
      const f = byId.get(id)
      return f ? toPayments(f) : []
    },
    loadContract: async (id) => {
      const f = byId.get(id)
      if (!f) return null
      return {
        id: `contract-${id}`,
        weddingId: id,
        status: f.signed ? 'signed' : 'draft',
        signedAt: f.signed ? '2026-01-01' : null,
      } as never
    },
    loadTasks: async () => [],
    loadSessions: async (weddingId) =>
      V7_FIXTURE_SESSIONS.filter((s) => s.linkedWeddingId === weddingId).map(
        toFixtureSession,
      ),
    loadExtras: async () => [],
    loadPrewedding: async () => null,
    loadLogistics: async (weddingId) => {
      // Logistics fixture is authored for Julia & Adam; others empty cache.
      if (weddingId !== 'w-julia-adam') {
        return buildLogisticsSnapshot({ segments: [], places: [] })
      }
      return buildLogisticsSnapshot()
    },
  }

  const sessionContextOptions: SessionReadContextOverrides = {
    loadSession: async (id) => sessionsById.get(id) ?? null,
    loadLinkedWedding: async (weddingId) => {
      const f = byId.get(weddingId)
      return f ? toWedding(f) : null
    },
  }

  return {
    loadUniverseRows: async () => universe,
    loadSessionUniverseRows: async () => sessionUniverse,
    listPaymentsByWeddingIds: async (ids: string[]) => {
      const map = new Map<string, Payment[]>()
      for (const id of ids) {
        const f = byId.get(id)
        map.set(id, f ? toPayments(f) : [])
      }
      return map
    },
    listContractsByWeddingIds: async (ids: string[]) => {
      const map = new Map<string, import('@/types/wedding').WeddingContract | null>()
      for (const id of ids) {
        const f = byId.get(id)
        map.set(
          id,
          f
            ? ({
                id: `contract-${id}`,
                weddingId: id,
                status: f.signed ? 'signed' : 'draft',
                signedAt: f.signed ? '2026-01-01' : null,
              } as never)
            : null,
        )
      }
      return map
    },
    loadWedding: async (id: string) => {
      const f = byId.get(id)
      return f ? toWedding(f) : null
    },
    contextOptions,
    sessionContextOptions,
    todayKey: V7_FIXTURE_TODAY,
  }
}

/** Gold: remaining weddings from today through year-end 2026. */
export function fixtureRemainingYearEndIds(): string[] {
  return V7_FIXTURE_WEDDINGS.filter(
    (w) => w.date >= V7_FIXTURE_TODAY && w.date <= '2026-12-31',
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => w.id)
}

export function fixtureRemainingYearEndSum(): number {
  return fixtureRemainingYearEndIds()
    .map((id) => V7_FIXTURE_WEDDINGS.find((w) => w.id === id)!)
    .reduce((s, w) => s + (w.contractValue - w.paidAmount), 0)
}

export function fixtureLargestRemainingInYearEnd(): FixtureWedding {
  const ids = new Set(fixtureRemainingYearEndIds())
  return [...V7_FIXTURE_WEDDINGS]
    .filter((w) => ids.has(w.id))
    .sort(
      (a, b) =>
        b.contractValue -
        b.paidAmount -
        (a.contractValue - a.paidAmount),
    )[0]!
}

/** Sanity: fixture remaining matches light-row math used by tools. */
export function assertFixtureFinanceAuthorityAligned(): void {
  for (const f of V7_FIXTURE_WEDDINGS) {
    const wedding = toWedding(f)
    const payments = toPayments(f)
    const contract = getContractValue(wedding)
    const paid = getTotalPaid(payments)
    const remaining = getRemainingToPay(contract, payments)
    if (remaining !== f.contractValue - f.paidAmount) {
      throw new Error(`fixture_finance_mismatch:${f.id}`)
    }
    void paid
    void hasPaidDepositPayment(payments)
    void getEffectiveTravelFeeAmount(wedding)
  }
}
