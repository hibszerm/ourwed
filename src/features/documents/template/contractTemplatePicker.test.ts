/**
 * Picker classification acceptance cases.
 * Run with: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/contractTemplatePicker.test.ts
 */

import {
  classifyTemplatesForGeneration,
  splitRecommended,
} from './contractTemplatePicker'
import type { DocumentTemplateSummary } from '@/types/documents'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function base(
  patch: Partial<DocumentTemplateSummary> &
    Pick<DocumentTemplateSummary, 'id' | 'name' | 'status'>,
): DocumentTemplateSummary {
  return {
    userId: 'user-1',
    description: null,
    docType: 'contract',
    category: null,
    isDefault: false,
    currentVersionId: 'ver-1',
    aiAnalyzedAt: new Date().toISOString(),
    questionnaireFormId: null,
    meta: { version: 1, slotBindingsReady: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersionNumber: 1,
    componentCount: 0,
    blockCount: 0,
    variableCount: 3,
    usageCount: 0,
    sourceFileName: 'umowa.docx',
    sourceDocxPath: 'templates/u1/source.docx',
    ...patch,
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

run('Test 1 — ready template is selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({ id: '1', name: 'Umowa Video 2026', status: 'ready' }),
  ])
  assert(c.selectable.length === 1, 'expected selectable')
  assert(c.incomplete.length === 0, 'not incomplete')
})

run('Test 2 — incomplete appears under incomplete, not selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '2',
      name: 'Umowa Video',
      status: 'incomplete',
      meta: {
        version: 1,
        slotBindingsReady: false,
        unresolvedSlotKeys: ['a', 'b', 'c'],
      },
      variableCount: 5,
    }),
  ])
  assert(c.selectable.length === 0, 'must not be selectable')
  assert(c.incomplete.length === 1, 'must be incomplete')
  assert(c.incomplete[0]!.unresolvedSlotCount === 3, 'unresolved count')
})

run('Test 3 — missing package metadata still selectable', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '3',
      name: 'Umowa',
      status: 'ready',
      category: null,
    }),
  ])
  const split = splitRecommended(c.selectable, null)
  assert(split.other.length === 1, 'still visible without package')
  assert(split.recommended.length === 0, 'no fake recommended')
})

run('Test 4 — package mismatch goes to Other, not hidden', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '4',
      name: 'Umowa Foto',
      status: 'ready',
      category: 'Foto',
    }),
    base({
      id: '5',
      name: 'Umowa Video Mini',
      status: 'ready',
      category: 'Video',
    }),
  ])
  const split = splitRecommended(c.selectable, 'Video Premium')
  assert(
    split.recommended.some((r) => r.template.id === '5'),
    'video recommended',
  )
  assert(
    split.other.some((r) => r.template.id === '4'),
    'photo still in other',
  )
})

run('Test 5 — PDF source still selectable when generation path exists', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '6',
      name: 'PDF Contract',
      status: 'ready',
      sourceFileName: 'umowa.pdf',
      sourceDocxPath: 'templates/u1/source.pdf',
    }),
  ])
  assert(c.selectable.length === 1, 'pdf with path selectable')
})

run('Test 7 — never silently empty: query would surface separately; draft analyzed is incomplete', () => {
  const c = classifyTemplatesForGeneration([
    base({
      id: '7',
      name: 'Draft after analysis',
      status: 'draft',
      meta: { version: 1, slotBindingsReady: false, unresolvedSlotKeys: ['x'] },
    }),
  ])
  assert(c.incomplete.length === 1, 'draft analyzed → incomplete bucket')
  assert(c.selectable.length === 0, 'not selectable')
})

if (!process.exitCode) {
  console.log('\nAll picker classification tests passed.')
}
