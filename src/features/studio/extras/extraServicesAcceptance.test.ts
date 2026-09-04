/**
 * Usługi dodatkowe V1 — Modern catalog + historical name snapshot.
 * Run: npm run test:extra-services
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWeddingExtraDisplayName } from '@/lib/forms/weddingExtraName'
import { EXTRA_SERVICE_IN_USE_MESSAGE } from '@/lib/api/extraServiceErrors'
import {
  EXTRA_SERVICES_CATALOG_MAX_PX,
  EXTRA_SERVICES_EMPTY_COPY,
  EXTRA_SERVICES_SUBTITLE,
  EXTRA_SERVICES_TITLE,
} from '@/features/studio/extras/extraServicesCopy'
import { projectContractAdditionalServices } from '@/features/ai-contract-transform/contractAdditionalServices'
import {
  computeWeddingContractValue,
  sumExtraPriceSnapshots,
} from '@/lib/forms/weddingExtraPricing'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import type { WeddingExtraService } from '@/types/package'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const page = read('src/pages/ExtraServicesPage.tsx')
const workspace = read(
  'src/features/studio/extras/ModernExtraServicesWorkspace.tsx',
)
const css = read(
  'src/features/studio/extras/ModernExtraServicesWorkspace.module.css',
)
const packageFields = read(
  'src/features/weddings/detail/editing/fields/PackageFields.tsx',
)
const extraService = read('src/lib/api/extraServiceService.ts')
const weddingExtra = read('src/lib/api/weddingExtraServiceService.ts')
const migration = read(
  'supabase/migrations/20260824120000_wedding_extra_name_snapshot.sql',
)
const pricing = read('src/lib/forms/weddingExtraPricing.ts')
const commercial = read('src/lib/utils/commercial.ts')

run('1. Modern extras page structure', () => {
  assert(page.includes('<AppLayout>'), 'H1 lives in workspace, not AppLayout title')
  assert(!page.includes('title="Usługi dodatkowe"'), 'no headerSlot title')
  assert(page.includes('ModernExtraServicesWorkspace'), 'modern workspace')
  assert(workspace.includes('data-testid="extras-modern"'), 'modern test id')
  assert(workspace.includes('<h1'), 'in-page H1')
  assert(!css.includes('.stage'), 'no custom page stage')
  assert(!css.includes('content-max-narrow'), 'page is not a 580 utility')
  assert(css.includes('.catalog'), 'catalog is a content object')
  assert(css.includes('max-width: 800px'), 'catalog width is 800, not the page')
  assert(css.includes('margin-inline: auto'), 'catalog centered in page content')
  assertEq(EXTRA_SERVICES_CATALOG_MAX_PX, 800, 'catalog object max')
  assert(css.includes('var(--surface-primary'), 'catalog paper is surface-primary')
  assert(!workspace.includes('v3MaterialSatinFlat'), 'not dashboard supporting mix')
  assert(css.includes('.surface'), 'one catalog surface')
  assert(workspace.includes('styles.rowActions'), 'overflow clustered with price')
  assert(!workspace.includes('StudioCatalog.module.css'), 'not Classic catalog CSS')
  assert(page.includes('PageContainer'), 'same Modern page inset as Śluby')
  assert(page.includes('width="wide"'), 'wide page axis')
  assert(css.includes('gap: var(--space-6)'), 'Śluby/Sesje page gap')
  assert(css.includes('justify-content: space-between'), 'Śluby/Sesje header')
})

run('2. truthful subtitle', () => {
  assertEq(EXTRA_SERVICES_TITLE, 'Usługi dodatkowe', 'title')
  assertEq(
    EXTRA_SERVICES_SUBTITLE,
    'Usługi, które możesz dodać do konkretnego zlecenia.',
    'subtitle',
  )
  assert(workspace.includes('EXTRA_SERVICES_SUBTITLE'), 'renders subtitle')
  assert(!workspace.includes('dodatki do pakietów'), 'no package-owned extras copy')
  assert(!page.includes('dodatki do pakietów'), 'page copy')
})

run('3. no redundant · PLN', () => {
  assert(!workspace.includes('· PLN'), 'no · PLN')
  assert(!workspace.includes('· {service.currency}'), 'no currency suffix')
  assert(workspace.includes('formatCurrency(service.price)'), 'shared PLN format')
})

run('4. 0 PLN service is valid', () => {
  assert(workspace.includes('value < 0'), 'negative rejected')
  assert(!workspace.includes('value <= 0'), 'zero allowed')
  assert(!workspace.includes('priceN <= 0'), 'zero allowed form')
})

run('5. duplicate names still allowed', () => {
  assert(extraService.includes('uniqueSlug'), 'slug uniquified')
  assert(!extraService.includes("eq('name'"), 'name is not unique-checked')
})

run('6. negative price rejected', () => {
  assert(workspace.includes("setError('Podaj poprawną cenę.')"), 'human error')
  assert(workspace.includes('parsePrice'), 'parser')
})

run('7. used service cannot disappear', () => {
  assert(extraService.includes('isAssignedToWedding'), 'usage check')
  assert(extraService.includes('EXTRA_SERVICE_IN_USE_MESSAGE'), 'blocks delete')
  assert(extraService.includes("from('extra_services').delete()"), 'hard delete unused')
  assert(
    migration.includes('ON DELETE RESTRICT') ||
      read('supabase/migrations/studio_catalog.sql').includes(
        'on delete restrict',
      ),
    'FK restrict remains',
  )
  assert(!extraService.includes('is_archived'), 'no archive infra')
})

run('8. delete failure is humanized', () => {
  assert(workspace.includes('Usunąć usługę na stałe?'), 'in-app confirm')
  assert(workspace.includes('Nie można usunąć usługi'), 'used title')
  assert(workspace.includes('EXTRA_SERVICE_IN_USE_MESSAGE'), 'used copy')
  assert(!workspace.includes('window.confirm'), 'no window.confirm')
  assert(!page.includes('window.confirm'), 'page has no native confirm')
  assert(
    EXTRA_SERVICE_IN_USE_MESSAGE.includes('przypisana do ślubu'),
    'human Polish',
  )
})

run('9. fake wedding-extra name editor removed', () => {
  assert(packageFields.includes('resolveWeddingExtraDisplayName'), 'read-only name')
  assert(packageFields.includes('extraNameLabel'), 'Usługa label')
  assert(!packageFields.includes('label="Nazwa"'), 'no editable extra name')
  assert(
    !packageFields.includes('name: ev.target.value'),
    'does not write discarded name',
  )
})

run('10. historical price remains frozen after catalog edit', () => {
  const updateStart = extraService.indexOf('async update(')
  const updateEnd = extraService.indexOf('async isAssignedToWedding(')
  const updateFn = extraService.slice(updateStart, updateEnd)
  assert(updateFn.includes('patch.price = input.price'), 'catalog price updates')
  assert(
    !updateFn.includes('wedding_extra_services'),
    'catalog update does not rewrite wedding extras',
  )
  assert(weddingExtra.includes('price_snapshot'), 'wedding stores snapshot')
  assert(
    !weddingExtra.includes('patch.name_snapshot'),
    'update path does not rewrite name snapshot',
  )
})

run('11. historical name prefers name_snapshot after catalog rename', () => {
  const frozen = resolveWeddingExtraDisplayName({
    nameSnapshot: 'Dodatkowy operator',
    name: 'Operator + dron',
  })
  assertEq(frozen, 'Dodatkowy operator', 'snapshot wins')
  const fallback = resolveWeddingExtraDisplayName({
    nameSnapshot: '',
    name: 'Operator + dron',
  })
  assertEq(fallback, 'Operator + dron', 'legacy fallback')
  assert(migration.includes('name_snapshot'), 'column added')
  assert(migration.includes('wedding_extra_fill_name_snapshot'), 'insert trigger')
  assert(weddingExtra.includes('name_snapshot: nameSnapshot'), 'add writes snapshot')
  assert(workspace.includes('resolveWeddingExtraDisplayName') === false, 'catalog uses live name')
  const projected = projectContractAdditionalServices([
    {
      id: 'e1',
      weddingId: 'w1',
      extraServiceId: 's1',
      priceSnapshot: 1000,
      quantity: 1,
      createdAt: '2026-01-01',
      name: 'Operator + dron',
      nameSnapshot: 'Dodatkowy operator',
    } satisfies WeddingExtraService,
  ])
  assertEq(projected[0]?.name, 'Dodatkowy operator', 'sparse contract uses snapshot')
})

run('12. extras + travel formula remains unchanged', () => {
  assert(
    pricing.includes('packageBasePrice') &&
      pricing.includes('sumExtraPriceSnapshots') &&
      pricing.includes('effectiveTravelFee'),
    'formula source',
  )
  const total = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [
      { priceSnapshot: 1000, quantity: 1 },
      { priceSnapshot: 400, quantity: 2 },
    ],
    effectiveTravelFee: 350,
  })
  assertEq(total, 5000 + 1000 + 800 + 350, 'package + extras + travel')
  assertEq(
    sumExtraPriceSnapshots([{ priceSnapshot: 1000, quantity: 1 }]),
    1000,
    'snapshot sum',
  )
  assertEq(
    getEffectiveTravelFeeAmount({
      travelFeeStatus: 'charged',
      travelFeeAmount: 350,
    }),
    350,
    'charged travel',
  )
  assert(!page.includes('computeWeddingContractValue'), 'page does not fork math')
  assert(!workspace.includes('commercial.ts'), 'workspace does not fork commercial')
  assert(commercial.includes('contractValue'), 'commercial model untouched')
})

run('13. mobile structure contains no desktop table', () => {
  assert(!workspace.includes('<table'), 'no table')
  assert(!css.includes('display: table'), 'no table layout')
  assert(css.includes('@media (max-width: 767px)'), 'mobile stack')
})

run('14. 44px mobile actions', () => {
  assert(css.includes('width: var(--touch-target)'), 'menu target')
  assert(css.includes('height: var(--touch-target)'), 'menu height')
  assert(css.includes('min-height: var(--touch-target)'), 'mobile add / check')
})

run('15. no horizontal overflow-prone legacy layout', () => {
  assert(css.includes('min-width: 0'), 'shrink axis')
  assert(css.includes('overflow-wrap: anywhere'), 'long names wrap')
  assert(!css.includes('white-space: nowrap') || css.includes('.price'), 'only price nowrap')
})

run('16. empty / loading / create copy', () => {
  assertEq(
    EXTRA_SERVICES_EMPTY_COPY,
    'Dodaj usługi, które możesz doliczyć do wartości umowy na konkretnym ślubie.',
    'empty copy',
  )
  assert(workspace.includes('data-testid="extras-loading"'), 'calm loading')
  assert(workspace.includes('extras-create-form'), 'inline create')
  assert(workspace.includes('extras-edit-form'), 'inline edit')
  assert(!workspace.includes('Zapisano'), 'no fake saved toast')
  assert(workspace.includes('Zapisywanie…'), 'busy state')
})

run('17. overflow menu portals outside catalog clip', () => {
  const menu = read('src/features/studio/extras/ExtraServiceOverflowMenu.tsx')
  assert(menu.includes('FloatingPortal'), 'reuses Modern FloatingPortal')
  assert(menu.includes("align: 'end'"), 'right-aligned to trigger')
  assert(menu.includes('forceAnchored: true'), 'anchored, not a dialog')
  assert(
    css.includes('.surface') && css.includes('overflow: hidden'),
    'catalog surface still clips row washes to radius',
  )
  const menuPanelIdx = css.indexOf('.menuPanel {')
  const menuPanelBlock = css.slice(menuPanelIdx, menuPanelIdx + 280)
  assert(menuPanelIdx >= 0, 'menu panel styles exist')
  assert(!menuPanelBlock.includes('position: absolute'), 'panel is not in-flow clipped')
  assert(!css.includes('.menuPanelAbove'), 'no in-catalog above variant')
})

run('18. Full Create and questionnaire pass name snapshots', () => {
  const fullCreate = read('src/features/weddings/createFullWedding.ts')
  const buildInput = read('src/features/weddings/buildFullWeddingCreateInput.ts')
  const persist = read('src/features/weddings/edit/persistWeddingEditDraft.ts')
  assert(fullCreate.includes('nameSnapshot: extra.nameSnapshot'), 'full create')
  assert(buildInput.includes('nameSnapshot: extra.name'), 'new wedding maps name')
  assert(persist.includes('nameSnapshot: extra.nameSnapshot ?? extra.name'), 'edit persist')
})

console.log('\nExtra services V1 acceptance finished.')
