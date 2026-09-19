/**
 * Studio Attention V1 — performance architecture acceptance.
 * Run: npm run test:studio-attention-perf
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

{
  const service = read(
    'src/features/dashboard/attention/studioAttentionService.ts',
  )
  assert(service.includes('listByWeddingIds'), 'batch listByWeddingIds')
  assert(
    service.includes('paymentService.listByWeddingIds'),
    'batch payments',
  )
  assert(
    service.includes('contractService.listByWeddingIds'),
    'batch contracts',
  )
  assert(
    service.includes('weddingPlaceService.listByWeddingIds'),
    'batch places',
  )
  assert(
    service.includes('listStatusByWeddingIds'),
    'batch prewedding statuses',
  )
  assert(
    service.includes('listContractQuestionnaireStatusByWeddingIds'),
    'batch contract Q statuses',
  )
  assert(
    !/\bgetWeddingDetail\s*\(/.test(service),
    'no full detail hydrate call',
  )
  assert(
    !/\bfinalizeWedding\s*\(/.test(service),
    'no finalize hydrate call',
  )
  assert(!service.includes('for (const id of'), 'no per-id loop fetch')
  assert(
    !/weddingIds\.map\s*\(\s*async/.test(service),
    'no Promise map per wedding',
  )
  assert(
    !service.includes('getApplyCount') && !service.includes('applyCount'),
    'Apply count not in V1 path',
  )
  assert(
    service.includes("perWeddingServiceCalls: 0"),
    'topology asserts zero per-wedding calls',
  )
  assert(
    service.includes("status', 'active'") ||
      service.includes('.eq(\'status\', \'active\')'),
    'semantic active scope',
  )
  console.log('PASS  bounded batch topology — no N+1 / Apply')
}

{
  const page = read('src/pages/DashboardV3Page.tsx')
  const hook = read(
    'src/features/dashboard/attention/useStudioAttention.ts',
  )
  assert(
    hook.includes("['dashboard', 'attention', userId]"),
    'independent attention query key',
  )
  assert(
    page.includes('useDashboardAssignments'),
    'assignments remain independent',
  )
  // Attention must not be awaited before other sections in page composition
  assert(
    !page.includes('await useStudioAttention'),
    'no await on attention hook',
  )
  assert(
    !/const\s*\{[^}]*attention[^}]*\}\s*=\s*useDashboardAssignments/.test(
      page,
    ),
    'attention not merged into assignments gate',
  )
  console.log('PASS  Dashboard independent loading boundary')
}

{
  const types = read(
    'src/features/dashboard/attention/studioAttentionTypes.ts',
  )
  const service = read(
    'src/features/dashboard/attention/studioAttentionService.ts',
  )
  assert(!types.includes('attention_status'), 'no attention_status')
  assert(!service.includes('from(\'attention'), 'no attention table')
  assert(!service.includes('needs_attention'), 'no needs_attention column')
  assert(service.includes('Derived') || service.includes('derived'), 'derived')
  console.log('PASS  no Attention persistence')
}

{
  const invalidate = read(
    'src/features/weddings/hooks/useInvalidateWedding.ts',
  )
  assert(
    invalidate.includes("queryKey: ['dashboard']"),
    'wedding invalidation covers dashboard prefix (attention key)',
  )
  console.log('PASS  mutation refresh via dashboard invalidation prefix')
}

console.log('\nStudio Attention V1 performance architecture: OK')
