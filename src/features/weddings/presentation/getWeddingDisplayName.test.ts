/**
 * UI-only wedding display name regression tests.
 * Run: npm run test:wedding-display-name
 */

import {
  getWeddingDisplayName,
  isAbsentPartnerName,
  WEDDING_DISPLAY_NAME_FALLBACK,
} from '@/features/weddings/presentation/getWeddingDisplayName'
import type { Couple, Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function couple(partial: Partial<Couple>): Couple {
  return {
    partner1: '',
    partner2: '',
    email: '',
    phone: '',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> & { couple: Couple }): Wedding {
  return {
    id: 'w1',
    date: '2026-08-01',
    status: 'active',
    workflowStage: 'reservation',
    packageName: '',
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
    createdAt: '2026-01-01',
    ...partial,
  }
}

assertEq(
  getWeddingDisplayName(
    wedding({
      couple: couple({ partner1: 'Anna Kowalska', partner2: 'Piotr Nowak' }),
    }),
  ),
  'Anna Kowalska i Piotr Nowak',
  'both partners',
)

assertEq(
  getWeddingDisplayName(
    wedding({
      couple: couple({ partner1: 'Jakub Wiecha', partner2: '' }),
    }),
  ),
  'Jakub Wiecha',
  'single partner empty',
)

assertEq(
  getWeddingDisplayName(
    wedding({
      couple: couple({ partner1: 'Jakub Wiecha', partner2: '—' }),
    }),
  ),
  'Jakub Wiecha',
  'single partner placeholder',
)

assertEq(
  getWeddingDisplayName(
    wedding({
      displayName: 'Państwo Kowalscy',
      couple: couple({ partner1: 'Anna', partner2: 'Piotr' }),
    }),
  ),
  'Państwo Kowalscy',
  'manual displayName wins',
)

assertEq(
  getWeddingDisplayName(
    wedding({
      displayName: 'Studio XYZ',
      couple: couple({ partner1: 'Studio XYZ', partner2: '—' }),
    }),
  ),
  'Studio XYZ',
  'imported title',
)

assertEq(
  getWeddingDisplayName(wedding({ couple: couple({}) })),
  WEDDING_DISPLAY_NAME_FALLBACK,
  'fallback',
)

assert(
  !getWeddingDisplayName(
    wedding({ couple: couple({ partner1: 'Jakub Wiecha', partner2: '—' }) }),
  ).includes('&'),
  'no ampersand for single client',
)

assert(isAbsentPartnerName('—'), 'em dash absent')
assert(!isAbsentPartnerName('Piotr'), 'real name present')

console.log('PASS  wedding display name tests')
