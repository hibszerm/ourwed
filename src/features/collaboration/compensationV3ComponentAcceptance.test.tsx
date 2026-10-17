import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { compensationV3QueryKeys } from './compensationV3Service'
import type { CompensationV3Model } from './compensationV3Service'
import type { Wedding } from '@/types/wedding'

const mockService = vi.hoisted(() => ({
  getShared: vi.fn(),
  getPrivate: vi.fn(),
  getOwnerRelationships: vi.fn(),
  updateFallback: vi.fn(),
  createPrivateReceipt: vi.fn(),
  updateOfficialTerms: vi.fn(),
  deletePrivateReceipt: vi.fn(),
  mutateOwnerTerms: vi.fn(),
}))

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'qa-recipient' } }),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/components/ui/ModalPortal', () => ({
  ModalPortal: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('./compensationV3Service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./compensationV3Service')>()
  return {
    ...actual,
    compensationV3Service: {
      ...actual.compensationV3Service,
      ...mockService,
    },
  }
})

import { CollaborativeCompensationCard } from './CollaborativeCompensationCard'
import { OwnerCompensationTermsPanel } from './OwnerCompensationTermsPanel'
import { AddPaymentModal } from '@/features/weddings/actions/AddPaymentModal'
import { paymentService } from '@/lib/api/paymentService'

let assertions = 0
function has(markup: string, fragment: string, message: string) {
  assertions += 1
  expect(markup, message).toContain(fragment)
}
function lacks(markup: string, fragment: string, message: string) {
  assertions += 1
  expect(markup, message).not.toContain(fragment)
}

function model(level: 0 | 1 | 2, overrides: Partial<CompensationV3Model> = {}): CompensationV3Model {
  return {
    relationshipId: 'relationship-recipient',
    weddingId: 'wedding-1',
    weddingLabel: 'QA Wedding',
    weddingDate: null,
    currency: 'PLN',
    compensationLevel: level,
    accessVersion: '4',
    personalValueKnown: true,
    personalValue: level === 0 ? '2000.00' : '5000.00',
    valueSource: level === 0 ? 'private_fallback' : 'official_compensation',
    dueDate: null,
    clientReceivedTotal: '1000.00',
    privateReceivedTotal: '250.00',
    receivedTotal: '1250.00',
    balanceKnown: true,
    balance: level === 0 ? '750.00' : '3750.00',
    fallbackAmount: level === 0 ? '2000.00' : null,
    fallbackDueDate: null,
    privateRevision: '2',
    termsRevision: level === 0 ? null : '3',
    activeMembership: true,
    privateReceipts: [{ id: 'private-receipt-secret', amount: '250.00', receivedOn: '2026-10-16', description: 'private note', revision: '1' }],
    clientReceipts: [{ paymentId: 'payment-client', amount: '1000.00', receivedOn: '2026-10-15', label: 'Rata', source: 'client_payment' }],
    ...overrides,
  }
}

function renderCard(level: 0 | 1 | 2, data: CompensationV3Model): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const shared = { relationship_id: data.relationshipId, access_version: '4', compensation_level: level }
  client.setQueryData(compensationV3QueryKeys.shared('qa-recipient', 'wedding-1', '4'), shared)
  client.setQueryData(compensationV3QueryKeys.private('qa-recipient', data.relationshipId, '4'), data)
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CollaborativeCompensationCard weddingId="wedding-1" userId="qa-recipient" accessVersion="4" compensationLevel={level} />
    </QueryClientProvider>,
  )
  client.clear()
  return markup
}

describe('V3 Compensation component authority acceptance', () => {
  it('renders Comp0 without official disclosure and with private settlement', () => {
    const html = renderCard(0, model(0))
    has(html, 'Moje rozliczenie', 'Comp0 card renders canonical compensation component')
    has(html, 'Moja prywatna wartość', 'Comp0 retains private fallback interaction')
    has(html, 'Dodaj prywatną wpłatę', 'Comp0 retains private receipt interaction')
    has(html, 'Wpłata od klienta', 'Comp0 sees own client-attributed receipts')
    has(html, 'Prywatna wpłata', 'Comp0 sees own private receipts')
    lacks(html, 'Ustalona wartość', 'Comp0 does not render official terms editor')
    lacks(html, '5000,00', 'Comp0 official value is absent')
    lacks(html, 'private-receipt-secret', 'Comp0 does not expose private receipt database identity in markup')
  })

  it('keeps unknown and known zero distinct in Comp0', () => {
    const unknown = renderCard(0, model(0, {
      personalValueKnown: false, personalValue: null, valueSource: 'unknown',
      balanceKnown: false, balance: null, fallbackAmount: null,
    }))
    has(unknown, 'Nie ustawiono', 'Comp0 unknown value remains explicitly unknown')
    lacks(unknown, 'Wartość dla mnie</dt><dd>0,00', 'Comp0 unknown is not normalized to zero')
    const zero = renderCard(0, model(0, {
      personalValueKnown: true, personalValue: '0.00', valueSource: 'private_fallback',
      balanceKnown: true, balance: '0.00', fallbackAmount: '0.00',
    }))
    has(zero, 'Rozliczone', 'Comp0 explicit zero is known and settled')
  })

  it('renders Comp1 terms read-only and preserves separate settlement interactions', () => {
    const html = renderCard(1, model(1))
    has(html, '5000,00', 'Comp1 sees official compensation amount')
    has(html, 'Wartość ustalona z właścicielem.', 'Comp1 sees read-only authority explanation')
    has(html, 'Dodaj prywatną wpłatę', 'Comp1 keeps private receipt interaction')
    has(html, 'Wpłata od klienta', 'Comp1 sees own client receipts')
    lacks(html, 'Ustalona wartość', 'Comp1 official editor is absent')
    lacks(html, 'Moja prywatna wartość', 'Comp1 cannot override official value with fallback UI')
  })

  it('renders Comp2 official editing separately from private settlement', () => {
    const html = renderCard(2, model(2))
    has(html, 'Ustalona wartość', 'Comp2 official edit controls are present')
    has(html, 'Zapisz ustalenie', 'Comp2 can submit official terms under existing authority')
    has(html, 'Dodaj prywatną wpłatę', 'Comp2 private settlement remains a separate interaction')
    lacks(html, 'Moja prywatna wartość', 'official-source Comp2 does not show competing fallback editor')
  })

  it('renders owner official terms while omitting private settlement fields', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = compensationV3QueryKeys.owner('qa-recipient', 'wedding-owner')
    client.setQueryData(key, [{
      relationshipId: 'relationship-owner', recipientUserId: 'recipient-id',
      recipientLabel: 'Współpracownik', activeMembership: true,
      amount: '5000.00', currency: 'PLN', dueDate: '2026-12-01',
      active: true, termsRevision: '2', amountRevision: '2',
    }])
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <OwnerCompensationTermsPanel weddingId="wedding-owner" currency="PLN" />
      </QueryClientProvider>,
    )
    client.clear()
    has(html, 'Ustalenia finansowe', 'owner sees official terms panel')
    has(html, '5000,00', 'owner sees the official amount')
    has(html, 'Zmień', 'owner can open official edit controls')
    lacks(html, 'Prywatna wpłata', 'owner receives no private receipt surface')
    lacks(html, 'fallback', 'owner receives no private fallback metadata')
  })

  it('renders the paid payment receiver picker with the owner default and only eligible RPC options', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const owner = { userId: 'owner-1', relationshipId: null, label: 'Ja / Studio', kind: 'owner' as const }
    const collaborator = { userId: 'recipient-1', relationshipId: 'relationship-1', label: 'Współpracownik A', kind: 'collaborator' as const }
    vi.spyOn(paymentService, 'listReceivers').mockResolvedValue([owner, collaborator])
    client.setQueryData(['wedding-payment-receivers-v3', 'qa-recipient', 'wedding-1'], [owner, collaborator])
    const wedding = {
      id: 'wedding-1', brideName: 'QA', groomName: 'Finance', weddingDate: '2027-06-01',
      status: 'active', price: 10000, currency: 'PLN', payments: [],
    } as unknown as Wedding
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AddPaymentModal open onClose={() => undefined} wedding={wedding} />
      </QueryClientProvider>,
    )
    client.clear()
    has(html, 'Otrzymał', 'paid Add Payment UI renders receiver label')
    has(html, 'value="owner:owner-1" selected=""', 'new paid payment defaults to the owner option')
    has(html, 'value="collaborator:relationship-1"', 'eligible accepted wedding collaborator appears')
    lacks(html, 'pending-relationship', 'pending invitee option is absent from rendered picker')
    lacks(html, 'foreign-relationship', 'foreign wedding option is absent from rendered picker')
  })

  it('reports exact component assertion count', () => {
    expect(assertions).toBe(31)
    console.log('Compensation component authority acceptance: PASS (31 rendered-component assertions)')
  })
})
