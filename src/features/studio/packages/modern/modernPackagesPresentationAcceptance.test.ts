/**
 * Packages V1 — conservative Modern presentation lift.
 * Run: npm run test:packages-presentation
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PACKAGES_ADD_LABEL,
  PACKAGES_DELETE_CTA,
  PACKAGES_DELETE_PHRASE,
  PACKAGES_DELETE_TITLE,
  PACKAGES_EMPTY_COPY,
  PACKAGES_EMPTY_TITLE,
  PACKAGES_ERROR_RETRY,
  PACKAGES_ERROR_TITLE,
  PACKAGES_ITEM_DELETE_TITLE,
  PACKAGES_SUBTITLE,
  PACKAGES_TITLE,
} from './packagesCopy'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertIncludes(src: string, needle: string, message: string) {
  assert(src.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, message: string) {
  assert(!src.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
}

let failed = 0

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
  }
}

const page = read('src/pages/PackagesPage.tsx')
const workspace = read(
  'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
)
const css = read(
  'src/features/studio/packages/modern/ModernPackagesWorkspace.module.css',
)
const catalogCss = read('src/features/studio/StudioCatalog.module.css')
const commercial = read('src/lib/utils/commercial.ts')
const packageChange = read('src/lib/utils/packageChange.ts')
const pricing = read('src/lib/forms/weddingExtraPricing.ts')
const travel = read('src/lib/utils/travelFeeCommercial.ts')
const packageService = read('src/lib/api/packageService.ts')
const itemService = read('src/lib/api/packageItemService.ts')
const approve = read('src/lib/api/questionnaireService.ts')
const importPage = read('src/pages/WeddingImportPage.tsx')

run('1. Modern in-page H1 / AppLayout without title', () => {
  assertIncludes(page, '<AppLayout>', 'AppLayout without title prop')
  assertNotIncludes(page, 'title="Pakiety"', 'no headerSlot title')
  assertIncludes(page, 'width="wide"', 'wide PageContainer')
  assertIncludes(page, 'ModernPackagesWorkspace', 'modern workspace')
  assertIncludes(workspace, '<h1', 'in-page H1')
  assertIncludes(workspace, 'PACKAGES_TITLE', 'title from copy')
  assertIncludes(workspace, 'data-testid="packages-modern"', 'modern test id')
})

run('2. copy + CTA preserved', () => {
  assert(PACKAGES_TITLE === 'Pakiety', 'title')
  assert(PACKAGES_ADD_LABEL === 'Nowy pakiet', 'create CTA')
  assert(PACKAGES_EMPTY_TITLE === 'Brak pakietów', 'empty title')
  assert(
    PACKAGES_EMPTY_COPY.includes('ankiety i nowe śluby'),
    'empty copy remains truthful',
  )
  assert(PACKAGES_ERROR_TITLE.includes('załadować pakietów'), 'error title')
  assert(PACKAGES_ERROR_RETRY === 'Spróbuj ponownie', 'retry')
  assert(PACKAGES_SUBTITLE.includes('ceny'), 'subtitle')
  assertIncludes(workspace, 'PACKAGES_ADD_LABEL', 'renders CTA')
})

run('3. architecture preserved — not a ledger', () => {
  assertIncludes(workspace, 'PackageContractSection', 'contract on package')
  assertIncludes(workspace, 'emphasizeNextStep', 'Phase 3.1 template next-step')
  assertIncludes(workspace, 'Zawartość pakietu', 'items visible')
  assertIncludes(workspace, 'PackageItemsEditor', 'item editor on surface')
  assertIncludes(workspace, 'PackageForm', 'inline create/edit')
  assertIncludes(workspace, "from '@/components/ui/Modal'", 'delete confirmation Modal')
  assertNotIncludes(workspace, 'Drawer', 'no drawer')
  assertNotIncludes(workspace, 'navigate(`/studio/pakiety/', 'no detail route')
  assertIncludes(workspace, 'Duplikuj', 'duplicate action')
  assertIncludes(workspace, 'Archiwizuj', 'archive action')
  assertNotIncludes(workspace, 'window.confirm', 'native confirm removed')
  assertIncludes(workspace, 'PACKAGES_DELETE_TITLE', 'package delete modal')
  assertIncludes(workspace, 'PACKAGES_DELETE_PHRASE', 'typed USUŃ gate')
  assertIncludes(workspace, 'package-delete-confirm-input', 'typed confirm input')
  assertIncludes(workspace, 'PACKAGES_ITEM_DELETE_TITLE', 'item delete modal')
  assert(PACKAGES_DELETE_PHRASE === 'USUŃ', 'delete phrase')
  assert(PACKAGES_DELETE_TITLE === 'Usuń pakiet?', 'delete title copy')
  assert(PACKAGES_DELETE_CTA === 'Usuń na zawsze', 'delete CTA copy')
  assert(PACKAGES_ITEM_DELETE_TITLE === 'Usunąć pozycję pakietu?', 'item delete title')
})

run('4. price + deposit once; commercial meta anatomy', () => {
  assertIncludes(workspace, 'zadatek', 'header uses zadatek')
  assertNotIncludes(workspace, 'zaliczka', 'no zaliczka on packages surface')
  assert(!workspace.includes('<dt>Cena</dt>'), 'redundant Cena meta removed')
  assert(!workspace.includes('<dt>Zadatek</dt>'), 'no duplicate Zadatek meta')
  assert(!workspace.includes('<dt>Pozycje</dt>'), 'no Pozycje meta')
  assert(!workspace.includes('<dt>Aktualizacja</dt>'), 'no Aktualizacja meta')
  assertIncludes(workspace, 'formatCurrency(pkg.price)', 'price in identity')
  assertIncludes(workspace, 'formatCurrency(pkg.depositAmount)', 'deposit in identity')
  assertIncludes(workspace, '<dt>Reportaż</dt>', 'reportaż meta')
  assertIncludes(workspace, '<dt>Nadgodziny</dt>', 'nadgodziny meta')
  assertIncludes(workspace, '<dt>Oddanie</dt>', 'oddanie meta')
  assertIncludes(workspace, '<dt>Płatność końcowa</dt>', 'final payment meta')
  assertIncludes(workspace, '<dt>Status</dt>', 'status meta')
  assertIncludes(workspace, 'label="Cena bazowa"', 'form keeps Cena bazowa')
  assertIncludes(workspace, 'label="Zadatek"', 'form keeps Zadatek field')
  assertIncludes(workspace, 'Zawartość pakietu', 'package contents remain')
  assertIncludes(workspace, 'PackageContractSection', 'contract section remains')
})

run('5. query keys and services frozen', () => {
  assertIncludes(page, "queryKey: ['studio-packages', userId]", 'list key')
  assertIncludes(
    page,
    "invalidateQueries({ queryKey: ['studio-packages'] })",
    'invalidate packages',
  )
  assertIncludes(
    page,
    "invalidateQueries({ queryKey: ['public-form'] })",
    'invalidate public-form',
  )
  assertIncludes(
    page,
    "invalidateQueries({ queryKey: ['weddings'] })",
    'invalidate weddings',
  )
  assertIncludes(page, 'packageService.list()', 'list')
  assertIncludes(page, 'packageService.create', 'create')
  assertIncludes(page, 'packageService.update', 'update')
  assertIncludes(page, 'packageService.duplicate', 'duplicate')
  assertIncludes(page, 'packageService.archive', 'archive')
  assertIncludes(page, 'packageService.delete', 'delete')
  assertIncludes(page, 'packageService.reorder', 'reorder')
  assertIncludes(workspace, 'packageItemService', 'items service')
  assertNotIncludes(workspace, "queryKey: ['packages'", 'no leftover packages key')
  assertIncludes(importPage, "queryKey: ['packages', userId]", 'import key frozen')
})

run('6. no commercial helper fork', () => {
  assertNotIncludes(workspace, 'applyCommercialPackageSnapshot', 'no snapshot apply')
  assertNotIncludes(workspace, 'applyPackageChangeToWedding', 'no package change')
  assertNotIncludes(workspace, 'resolvePackageBasePrice', 'no base resolver')
  assertNotIncludes(workspace, 'computeWeddingContractValue', 'no CV recompute')
  assertNotIncludes(workspace, 'getEffectiveTravelFeeAmount', 'no travel helper')
  assertIncludes(commercial, 'applyCommercialPackageSnapshot', 'commercial remains')
  assertIncludes(packageChange, 'applyPackageChangeToWedding', 'packageChange remains')
  assertIncludes(pricing, 'resolvePackageBasePrice', 'pricing remains')
  assertIncludes(travel, 'getEffectiveTravelFeeAmount', 'travel remains')
  assertIncludes(approve, 'packageService.get(packageId)', 'approve still live catalog')
  assertIncludes(packageService, 'async archive', 'archive semantics')
  assertIncludes(itemService, 'async reorder', 'item reorder')
})

run('7. CSS isolation', () => {
  assertNotIncludes(workspace, 'StudioCatalog.module.css', 'workspace has own CSS')
  assertNotIncludes(page, 'StudioCatalog.module.css', 'page has own CSS')
  assertIncludes(css, 'justify-content: space-between', 'header axis')
  assertIncludes(css, 'width: 100%', 'catalog uses shell width')
  assertNotIncludes(css, 'margin-inline: auto', 'not a centered island')
  assertNotIncludes(css, 'max-width: 800px', 'not extras 800 catalog')
  assertNotIncludes(css, 'max-width: 920px', 'not 920 catalog')
  assertIncludes(css, 'repeat(5, minmax(0, 1fr))', 'five-fact meta grid')
  assertIncludes(catalogCss, '.navGroup', 'shared catalog CSS untouched for sidebar')
})

run('8. loading / empty / error Modernized', () => {
  assertIncludes(workspace, 'data-testid="packages-loading"', 'skeleton')
  assertIncludes(workspace, 'data-testid="packages-empty"', 'empty')
  assertIncludes(workspace, 'data-testid="packages-error"', 'error')
  assertNotIncludes(workspace, 'Ładowanie pakietów…', 'no plain loading copy')
  assertIncludes(workspace, 'getUserFacingErrorMessage', 'humanized error')
  assertIncludes(css, '.skeletonCard', 'package-shaped skeleton')
})

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('\npackages-presentation: all passed\n')
}
