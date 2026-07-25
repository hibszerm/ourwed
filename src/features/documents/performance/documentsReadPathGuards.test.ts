/**
 * Architectural guards: list/picker must not pull fat version JSON or run analysis.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/performance/documentsReadPathGuards.test.ts
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const templateServiceSrc = readFileSync(
  join(root, 'lib/api/documents/templateService.ts'),
  'utf8',
)
const modalSrc = readFileSync(
  join(root, 'features/weddings/actions/GenerateContractModal.tsx'),
  'utf8',
)
const hooksSrc = readFileSync(
  join(root, 'features/documents/hooks/useDocumentTemplates.ts'),
  'utf8',
)

run('1 — listSummaries uses join projection, not per-template listVersions loop', () => {
  assert(
    templateServiceSrc.includes('listDocumentTemplateSummaries'),
    'listDocumentTemplateSummaries exists',
  )
  assert(
    templateServiceSrc.includes(
      'current_version:document_template_versions!current_version_id',
    ),
    'join current version lite fields',
  )
  assert(
    templateServiceSrc.includes('listSummaries: listDocumentTemplateSummaries'),
    'wired to listSummaries',
  )
  // Old N+1 pattern must not remain as the listSummaries body
  const listFn = templateServiceSrc.slice(
    templateServiceSrc.indexOf('async function listDocumentTemplateSummaries'),
    templateServiceSrc.indexOf('async function listGenerationReadyTemplateSummaries'),
  )
  assert(!listFn.includes('listVersions('), 'list must not call listVersions')
  assert(!listFn.includes('slot_map'), 'list must not select slot_map')
  assert(
    !listFn.includes('detectContractCandidates'),
    'no candidate detection',
  )
  assert(!listFn.includes('buildSlotsFromAnalysis'), 'no slot rebuild')
  assert(!listFn.includes('extractDocx'), 'no docx extract')
})

run('2 — Generate picker does not invalidate+refetch on open', () => {
  assert(
    !modalSrc.includes('invalidateQueries({ queryKey: documentTemplateKeys.all })'),
    'no blanket invalidate on open',
  )
  assert(!/refetchTemplates\(\)/.test(modalSrc), 'no forced refetch on open')
  assert(
    modalSrc.includes('useDocumentTemplates()'),
    'uses shared summaries hook',
  )
})

run('3 — hooks share document-template-summaries key and cache settings', () => {
  assert(
    hooksSrc.includes("['document-template-summaries', userId]"),
    'stable summaries key',
  )
  assert(hooksSrc.includes('refetchOnMount: false'), 'no remount refetch')
  assert(hooksSrc.includes('refetchOnWindowFocus: false'), 'no focus refetch')
  const listHook = hooksSrc.slice(
    hooksSrc.indexOf('export function useDocumentTemplates'),
    hooksSrc.indexOf('export function useGenerationReadyTemplates'),
  )
  assert(
    listHook.includes('listSummaries()'),
    'list queryFn is listSummaries only',
  )
  assert(
    !listHook.includes('getAnalysis'),
    'list hook must not call getAnalysis',
  )
})

run('4 — split accessors exist for detail / analysis / source', () => {
  assert(templateServiceSrc.includes('getDocumentTemplateAnalysis'), 'analysis')
  assert(templateServiceSrc.includes('getDocumentTemplateSource'), 'source')
  assert(
    templateServiceSrc.includes('listGenerationReadyTemplateSummaries'),
    'ready filter',
  )
})

if (!process.exitCode) {
  console.log('\nAll documents read-path guard tests passed.')
}
