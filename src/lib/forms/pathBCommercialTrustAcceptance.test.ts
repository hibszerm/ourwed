/**
 * Path B commercial trust — service + UI wiring acceptance.
 * Run: npx tsx src/lib/forms/pathBCommercialTrustAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const svc = read('src/lib/api/questionnaireService.ts')
const create = read('src/lib/api/weddingService.ts')
const snap = read('src/lib/forms/contractQuestionnaireSnapshot.ts')
const detail = read(
  'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.tsx',
)
const pending = read(
  'src/features/questionnaires/pending/modern/ModernPendingWorkspace.tsx',
)
const newWedding = read('src/pages/NewWeddingPage.tsx')

assertIncludes(svc, 'resolvePathBPackageCommercial', 'approve uses Path B commercial resolver')
assertIncludes(svc, 'instance.optionsSnapshot', 'passes options snapshot into summarize')
assertIncludes(svc, 'preserveImportedPrice: true', 'keeps snapshot price on create')
assertIncludes(svc, 'allowInactivePackage: true', 'allows inactive catalog package')
assertIncludes(svc, 'findApprovalDuplicates', 'exposes soft duplicate preview')
assertNotIncludes(
  svc,
  'Wybrany pakiet jest nieaktywny. Poproś parę o wybór innego pakietu.',
  'no inactive hard-fail on approve',
)
assertIncludes(create, 'allowInactivePackage', 'create respects allowInactivePackage')
assertIncludes(snap, 'depositAmount', 'new snapshots may freeze deposit')
assertIncludes(detail, 'invalidateAfterQuestionnaireApproval', 'detail invalidates notifications')
assertIncludes(detail, 'LikelyDuplicateWarningModal', 'detail soft duplicate warn')
assertIncludes(pending, 'LikelyDuplicateWarningModal', 'pending soft duplicate warn')
assertIncludes(newWedding, 'LikelyDuplicateWarningModal', 'manual create soft duplicate warn')
assertIncludes(newWedding, 'findLikelyWeddingDuplicates', 'manual create uses soft matcher')
assertIncludes(
  read('src/features/weddings/components/LikelyDuplicateWarningModal.tsx'),
  'Utwórz mimo to',
  'intentional override action',
)

console.log('pathBCommercialTrustAcceptance: ok')
