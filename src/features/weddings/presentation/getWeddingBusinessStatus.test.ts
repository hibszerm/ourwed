/**
 * Run: npm run test:wedding-business-status
 */
import { getWeddingBusinessStatus } from '@/features/weddings/presentation/getWeddingBusinessStatus'
import type { Wedding } from '@/types/wedding'

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function wedding(status: Wedding['contract']['status']): Pick<Wedding, 'contract'> {
  return { contract: { status } }
}

assertEq(getWeddingBusinessStatus(wedding('none')).label, 'Nowe', 'none → Nowe')
assertEq(getWeddingBusinessStatus(wedding('generated')).label, 'Oczekuje', 'generated')
assertEq(getWeddingBusinessStatus(wedding('sent')).label, 'Oczekuje', 'sent')
assertEq(getWeddingBusinessStatus(wedding('signed')).label, 'Umowa', 'signed')
assertEq(
  getWeddingBusinessStatus({} as Pick<Wedding, 'contract'>).label,
  'Nowe',
  'missing',
)

console.log('PASS  wedding business status')
