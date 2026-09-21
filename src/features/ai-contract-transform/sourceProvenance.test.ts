import { applySparseBlockChanges } from './applySparseBlockChanges'
import type { TransformDocumentBlock } from './types'

const assert = (v: boolean, m: string) => { if (!v) throw new Error(m) }
const source: TransformDocumentBlock[] = [
  { blockId: 'para-a', kind: 'paragraph', paragraphIndex: 0, text: 'A' },
  { blockId: 'table-1-row-2-cell-3-p-0', kind: 'tableCell', paragraphIndex: 1, text: 'B', tableContext: { tableIndex: 1, rowIndex: 2, cellIndex: 3, ownershipFamily: 'unknown' } },
]

const unchanged = applySparseBlockChanges(source, [])
assert(unchanged.ok && unchanged.blocks[0]!.originSourceBlockId === 'para-a', 'unchanged origin')
const replaced = applySparseBlockChanges(source, [{ blockId: 'para-a', text: 'unrelated replacement' }])
assert(replaced.ok && replaced.blocks[0]!.originSourceBlockId === 'para-a', 'replacement origin')
assert(replaced.ok && replaced.blocks[1]!.originSourceBlockId === 'table-1-row-2-cell-3-p-0', 'table origin')
assert(!applySparseBlockChanges(source, [{ blockId: 'new-id', text: 'x' }]).ok, 'unknown id rejected')
const origins = replaced.ok ? replaced.blocks.map((b) => b.originSourceBlockId) : []
assert(origins[0] !== origins[1], 'distinct origins')
const g03 = applySparseBlockChanges(
  [{ blockId: 'table-5-row-2-cell-2-p-0', kind: 'tableCell', paragraphIndex: 0, text: '3 500,00 zł' }],
  [{ blockId: 'table-5-row-2-cell-2-p-0', text: '3 500,00 zł' }],
)
assert(g03.ok && g03.blocks[0]!.originSourceBlockId === 'table-5-row-2-cell-2-p-0', 'G03 provenance')
// System-created blocks are not produced by sparse reconstruction and therefore
// carry no fabricated origin metadata.
assert(!('originSourceBlockId' in { blockId: 'system-new', text: 'x' }), 'new block unknown')
console.log('PASS source provenance reconstruction')
