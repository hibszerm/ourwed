/**
 * Destructive Actions Trust Closure — package / package-item / document-template.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/studio/destructiveActionsTrustClosureAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PACKAGES_DELETE_BODY,
  PACKAGES_DELETE_CTA,
  PACKAGES_DELETE_INPUT_LABEL,
  PACKAGES_DELETE_PHRASE,
  PACKAGES_DELETE_TITLE,
  PACKAGES_ITEM_DELETE_BODY,
  PACKAGES_ITEM_DELETE_CTA,
  PACKAGES_ITEM_DELETE_TITLE,
} from './packages/modern/packagesCopy'

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

const workspace = source(
  'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
)
const packagesPage = source('src/pages/PackagesPage.tsx')
const deleteModal = source(
  'src/features/documents/components/DeleteContractModal.tsx',
)
const templatesPage = source('src/pages/DocumentTemplatesPage.tsx')
const templateDetail = source('src/pages/DocumentTemplateDetailPage.tsx')
const templateService = source(
  'src/lib/api/documents/templateService.ts',
)
const packageService = source('src/lib/api/packageService.ts')
const packageItemService = source('src/lib/api/packageItemService.ts')
const weddingHeader = source(
  'src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx',
)
const sessionHeader = source(
  'src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx',
)

run('package delete: typed USUŃ modal, no immediate mutation', () => {
  assert(!workspace.includes('window.confirm'), 'native confirm gone')
  assert(workspace.includes('openPackageDelete'), 'opens modal first')
  assert(workspace.includes('confirmPackageDelete'), 'confirm path')
  assert(workspace.includes("deleteConfirmText !== PACKAGES_DELETE_PHRASE"), 'CTA gated')
  assert(workspace.includes('package-delete-confirm-input'), 'confirm input')
  assert(workspace.includes('package-delete-confirm'), 'confirm CTA')
  assert(workspace.includes('PACKAGES_DELETE_TITLE'), 'title wired')
  assert(PACKAGES_DELETE_PHRASE === 'USUŃ', 'exact phrase')
  assert(PACKAGES_DELETE_TITLE === 'Usuń pakiet?', 'title copy')
  assert(PACKAGES_DELETE_CTA === 'Usuń na zawsze', 'CTA copy')
  assert(PACKAGES_DELETE_INPUT_LABEL.includes('USUŃ'), 'input helper')
  assert(
    PACKAGES_DELETE_BODY.includes('Istniejące zlecenia zachowają'),
    'snapshot consequence truthful',
  )
  assert(
    packagesPage.includes('packageService.delete'),
    'mutation path unchanged on page',
  )
  assert(
    packageService.includes('async delete(id: string)'),
    'service delete unchanged',
  )
  assert(
    workspace.includes('await onDelete(deleteTarget.id)'),
    'confirm invokes existing onDelete',
  )
  assert(
    workspace.includes('if (deleteBusy) return'),
    'busy blocks close during delete',
  )
})

run('package item delete: confirmation before service.delete', () => {
  assert(workspace.includes('requestItemDelete'), 'opens item modal')
  assert(workspace.includes('confirmItemDelete'), 'confirm path')
  assert(workspace.includes('itemDeleteTarget'), 'pending target state')
  assert(workspace.includes('package-item-delete-confirm'), 'confirm CTA')
  assert(workspace.includes('PACKAGES_ITEM_DELETE_TITLE'), 'title wired')
  assert(PACKAGES_ITEM_DELETE_TITLE === 'Usunąć pozycję pakietu?', 'item title')
  assert(PACKAGES_ITEM_DELETE_CTA === 'Usuń', 'item CTA')
  assert(
    PACKAGES_ITEM_DELETE_BODY.includes('trwale usunięta'),
    'immediate persist semantics',
  )
  assert(
    workspace.includes('await packageItemService.delete(itemDeleteTarget.id)'),
    'confirm uses existing delete',
  )
  assert(
    !workspace.includes('packageItemService\n                          .delete(item.id)'),
    'no immediate desktop delete',
  )
  const desktopDeleteSnippet = workspace.slice(
    workspace.indexOf('package-item-delete-trigger'),
    workspace.indexOf('PackageItemOverflowMenu'),
  )
  assert(
    !desktopDeleteSnippet.includes('packageItemService'),
    'desktop Usuń only opens modal',
  )
  assert(
    packageItemService.includes('async delete'),
    'item service delete unchanged',
  )
})

run('document template delete: typed USUŃ strengthens existing modal', () => {
  assert(deleteModal.includes("TEMPLATE_DELETE_PHRASE = 'USUŃ'"), 'phrase constant')
  assert(
    deleteModal.includes('confirmText !== TEMPLATE_DELETE_PHRASE'),
    'exact match re-checked in handler',
  )
  assert(
    deleteModal.includes('disabled={busy || !canConfirm}'),
    'CTA disabled until match',
  )
  assert(
    deleteModal.includes('Usuń szablon dokumentu?'),
    'template title',
  )
  assert(deleteModal.includes('Usuń na zawsze'), 'strong CTA')
  assert(
    deleteModal.includes('Aby potwierdzić trwałe usunięcie, wpisz USUŃ.'),
    'typed helper',
  )
  assert(
    deleteModal.includes('Powiązana ankieta i jej dane zostaną usunięte'),
    'questionnaire cascade copy',
  )
  assert(
    deleteModal.includes('istniejące szkice umów'),
    'RESTRICT dependency copy',
  )
  assert(
    deleteModal.includes('template-delete-confirm-input'),
    'accessible confirm input',
  )
  assert(
    templatesPage.includes('DeleteContractModal'),
    'list page keeps modal',
  )
  assert(
    templateDetail.includes('DeleteContractModal'),
    'detail page keeps modal',
  )
  assert(
    templateDetail.includes('template-detail-delete-trigger'),
    'detail overflow is the PO Podgląd delete path',
  )
  assert(
    templatesPage.includes('await remove.mutateAsync(deleteTarget.id)'),
    'list mutation unchanged',
  )
  assert(
    templateDetail.includes('await mutations.remove.mutateAsync(doc.id)'),
    'detail mutation unchanged',
  )
  assert(
    templateService.includes('async function removeTemplate'),
    'removeTemplate retained',
  )
  assert(!deleteModal.includes('Usuń umowę'), 'old contract title removed')
})

run('wedding + session typed delete unchanged', () => {
  assert(
    weddingHeader.includes("confirmText !== 'USUŃ'"),
    'wedding USUŃ gate intact',
  )
  assert(
    weddingHeader.includes('Usuń na zawsze'),
    'wedding CTA intact',
  )
  assert(
    sessionHeader.includes("confirmText !== 'USUŃ'"),
    'session USUŃ gate intact',
  )
  assert(
    sessionHeader.includes('Usuń na zawsze'),
    'session CTA intact',
  )
})

if (failed > 0) {
  console.error(`\n${failed} acceptance check(s) failed`)
  process.exit(1)
}

console.log('\nOK destructive actions trust closure')
