/**
 * Real document-template permanent-delete entry points + package detach.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/documentTemplateDeleteEntryPointsAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

const detail = source('src/pages/DocumentTemplateDetailPage.tsx')
const list = source('src/pages/DocumentTemplatesPage.tsx')
const modal = source(
  'src/features/documents/components/DeleteContractModal.tsx',
)
const packageSection = source(
  'src/features/studio/PackageContractSection.tsx',
)
const card = source('src/features/documents/components/ContractCard.tsx')
const hero = source('src/features/documents/components/TemplateDetailHero.tsx')
const service = source('src/lib/api/documents/templateService.ts')
const hook = source('src/features/documents/hooks/useDocumentTemplates.ts')

run('entry map: permanent delete surfaces', () => {
  assert(
    detail.includes('template-detail-delete-trigger'),
    'detail overflow opens delete',
  )
  assert(detail.includes('setDeleteOpen(true)'), 'detail opens modal state')
  assert(detail.includes('DeleteContractModal'), 'detail uses protected modal')
  assert(
    detail.includes('await mutations.remove.mutateAsync(doc.id)'),
    'detail mutation only in handleDelete',
  )
  assert(
    list.includes('setDeleteTarget(t)'),
    'list card delete only sets target',
  )
  assert(list.includes('DeleteContractModal'), 'list uses protected modal')
  assert(
    list.includes('await remove.mutateAsync(deleteTarget.id)'),
    'list mutation only after confirm',
  )
  assert(
    card.includes('onDelete()'),
    'ContractCard delegates delete to parent',
  )
  assert(
    !card.includes('documentTemplateService'),
    'ContractCard has no direct service delete',
  )
})

run('DeleteContractModal: typed USUŃ gate is real', () => {
  assert(modal.includes("TEMPLATE_DELETE_PHRASE = 'USUŃ'"), 'phrase')
  assert(
    modal.includes('confirmText !== TEMPLATE_DELETE_PHRASE'),
    'handler re-checks phrase',
  )
  assert(
    modal.includes('disabled={busy || !canConfirm}'),
    'CTA disabled until match',
  )
  assert(modal.includes('template-delete-confirm-input'), 'input testid')
  assert(modal.includes('template-delete-confirm'), 'confirm testid')
  assert(modal.includes('Usuń na zawsze'), 'strong CTA')
})

run('package path: Usuń szablon was detach — now confirmed Odepnij', () => {
  assert(
    !packageSection.includes('>Usuń szablon<'),
    'misleading Usuń szablon label removed',
  )
  assert(packageSection.includes('Odepnij szablon'), 'detach label')
  assert(
    packageSection.includes('package-template-detach-trigger'),
    'detach opens modal',
  )
  assert(
    packageSection.includes('setDetachOpen(true)'),
    'no immediate clear on click',
  )
  assert(
    packageSection.includes('clearPackageContractTemplate'),
    'detach service retained',
  )
  assert(
    packageSection.includes('await clearPackageContractTemplate'),
    'clear only after confirm handler',
  )
  const triggerIdx = packageSection.indexOf('package-template-detach-trigger')
  const triggerSnippet = packageSection.slice(triggerIdx, triggerIdx + 350)
  assert(
    !triggerSnippet.includes('clearPackageContractTemplate'),
    'trigger click does not call clear',
  )
  assert(
    !packageSection.includes('documentTemplateService.remove'),
    'package section never hard-deletes template',
  )
})

run('no bypass: TemplateDetailHero not mounted; remove only via hook/service', () => {
  assert(
    !detail.includes('TemplateDetailHero'),
    'legacy hero unused on live detail',
  )
  assert(
    !list.includes('TemplateDetailHero'),
    'legacy hero unused on list',
  )
  assert(
    hook.includes('documentTemplateService.remove'),
    'hook still owns remove',
  )
  assert(service.includes('async function removeTemplate'), 'service intact')
  // Hero still has untyped Usuń UI, but must not be wired.
  assert(hero.includes('onDelete'), 'hero API still exists as dead UI')
})

run('PO package→Podgląd→detail delete path is protected', () => {
  assert(
    packageSection.includes(
      '`/ustawienia/dokumenty/szablony/${card.templateId}`',
    ),
    'Podgląd navigates to detail',
  )
  assert(
    detail.includes('template-detail-v1'),
    'detail is slim V1 surface',
  )
  assert(
    detail.includes('Zamień źródłowy DOCX'),
    'detail has replace action',
  )
  assert(
    detail.includes('Wygenerowane umowy') ||
      detail.includes('GeneratedWeddingContractService'),
    'detail shows generated history',
  )
  assert(!detail.includes('Uruchom analizę'), 'no legacy analysis CTA')
  assert(!detail.includes('/analiza'), 'detail does not link to analiza')
})

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nOK document template delete entry points')
