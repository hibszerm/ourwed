import assert from 'node:assert/strict'
import { extractDocxParagraphsFromXml } from '../documents/template/extractDocxParagraphs'
import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { groundSemanticMapResponse, parseSemanticMapResponse } from './semanticMapModelContract'
import { indexSemanticSourceTokens } from './semanticSourceTokens'
import type { TransformDocumentBlock } from './types'

function source(id: string, paragraphXml: string, breakOffsets: readonly number[] = [], protectedSource = false) {
  const text = extractCanonicalParagraphText(paragraphXml)
  const block: TransformDocumentBlock = {
    blockId: id, paragraphIndex: 0, kind: 'paragraph', text, breakOffsets,
    modelContext: { modelEditable: !protectedSource },
  }
  return { block, paragraph: { blockId: id, paragraphXml } }
}

function wire(block: TransformDocumentBlock, anchor: string, concept = 'preparation_location', from = 0) {
  const start = block.text.indexOf(anchor, from)
  assert(start >= 0, `source contains ${anchor}`)
  const end = start + anchor.length
  const tokens = indexSemanticSourceTokens(block)
  const first = tokens.find((token) => token.start === start)
  const last = tokens.find((token) => token.end === end)
  assert(first && last, `token boundaries cover ${anchor}`)
  return {
    sourceBlockId: block.blockId, startTokenId: first.id, endTokenId: last.id, concept,
    customerIndex: null, customerIndexes: null, nameForm: null,
    dateRole: null, baseDateConcept: null, relation: null,
  }
}

function ground(rows: Record<string, unknown>[], sources: ReturnType<typeof source>[]) {
  return groundSemanticMapResponse({ semanticMappings: rows }, sources.map((item) => item.paragraph), sources.map((item) => item.block))
}

const g01 = source('para-6', '<w:p><w:r><w:t>przygotowania w Domu Rodzinnym Przykład, ul. Lawendowa 3, 00-952 Miasto Próbne; ceremonia dalej.</w:t></w:r></w:p>')
const exactG01 = 'Domu Rodzinnym Przykład, ul. Lawendowa 3, 00-952 Miasto Próbne'
const g01Mapping = wire(g01.block, exactG01)
assert.deepEqual(indexSemanticSourceTokens(g01.block), indexSemanticSourceTokens(g01.block), 'identical source state produces identical token IDs')
assert.notDeepEqual(indexSemanticSourceTokens(g01.block).map((token) => token.id), indexSemanticSourceTokens({ ...g01.block, blockId: 'other-block' }).map((token) => token.id), 'token IDs are block scoped')
assert.equal(Object.hasOwn(g01Mapping, 'anchor'), false)
assert.equal(Object.hasOwn(g01Mapping, 'occurrence'), false)
const g01Resolved = ground([g01Mapping], [g01])
assert(g01Resolved.ok)
assert.equal(g01Resolved.mappings[0]?.anchor, exactG01)
assert.equal(g01Resolved.mappings[0]?.span.start, g01.block.text.indexOf(exactG01))

const prose = source('prose', '<w:p><w:r><w:t>Terminy 01.10.2027 i 02.10.2027 oraz Dom A; potem Dom B.</w:t></w:r></w:p>')
const dateA = wire(prose.block, '01.10.2027', 'wedding_date')
const dateB = wire(prose.block, '02.10.2027', 'execution_date')
assert.equal(ground([dateA, dateB], [prose]).ok, true)
assert.equal(ground([wire(prose.block, 'Dom A'), wire(prose.block, 'Dom B')], [prose]).ok, true)
const twoLocationsInCell = { ...prose, block: { ...prose.block, kind: 'tableCell' as const } }
assert.equal(ground([wire(twoLocationsInCell.block, 'Dom A'), wire(twoLocationsInCell.block, 'Dom B')], [twoLocationsInCell]).ok, true)
assert.equal(ground([dateA, { ...dateA, concept: 'execution_date' }], [prose]).ok, false)
const overlapping = ground([dateA, wire(prose.block, '01.10.2027 i 02.10.2027')], [prose])
assert(!overlapping.ok && overlapping.code === 'overlapping_spans')

const repeated = source('repeat', '<w:p><w:r><w:t>Ada Ada</w:t></w:r></w:p>')
const firstAda = wire(repeated.block, 'Ada', 'customer_1_name')
const secondAda = wire(repeated.block, 'Ada', 'customer_2_name', 1)
const repeatedGrounded = ground([{ ...firstAda, nameForm: 'BASE' }, { ...secondAda, nameForm: 'BASE' }], [repeated])
assert(repeatedGrounded.ok)
assert.notEqual(repeatedGrounded.mappings[0]?.span.start, repeatedGrounded.mappings[1]?.span.start)

const mixed = source('mixed', '<w:p><w:r><w:t>Klient Ada, usługodawca Jan.</w:t></w:r></w:p>')
assert.equal(ground([{ ...wire(mixed.block, 'Ada', 'customer_1_name'), nameForm: 'BASE' }], [mixed]).ok, true)
const twoNames = source('two-names', '<w:p><w:r><w:t>Leny Fikcyjnej i Oskara Umownego</w:t></w:r></w:p>')
const names = ground([
  { ...wire(twoNames.block, 'Leny Fikcyjnej', 'customer_1_name'), nameForm: 'GENITIVE' },
  { ...wire(twoNames.block, 'Oskara Umownego', 'customer_2_name'), nameForm: 'GENITIVE' },
], [twoNames])
assert(names.ok)
assert.equal(names.mappings[0]?.anchor, 'Leny Fikcyjnej')
assert.equal(names.mappings[1]?.anchor, 'Oskara Umownego')
const protectedMixed = source('protected', mixed.paragraph.paragraphXml, [], true)
const protectedResult = ground([{ ...wire(protectedMixed.block, 'Ada', 'customer_1_name'), nameForm: 'BASE' }], [protectedMixed])
assert(!protectedResult.ok && protectedResult.code === 'protected_source')

const crossRun = source('runs', '<w:p><w:r><w:t>Domu Rodzin</w:t></w:r><w:r><w:t>nym Przykład</w:t></w:r></w:p>')
const oneRun = source('runs', '<w:p><w:r><w:t>Domu Rodzinnym Przykład</w:t></w:r></w:p>')
assert.deepEqual(indexSemanticSourceTokens(crossRun.block), indexSemanticSourceTokens(oneRun.block))
assert.equal(ground([wire(crossRun.block, 'Domu Rodzinnym Przykład')], [crossRun]).ok, true)

const brokenXml = '<w:document><w:body><w:p><w:r><w:t>Villa Marina</w:t><w:br/><w:t>ul. Portowa 4</w:t></w:r></w:p></w:body></w:document>'
const extracted = extractDocxParagraphsFromXml(brokenXml).paragraphs[0]!
assert.deepEqual(extracted.breakOffsets, ['Villa Marina'.length])
const broken = source('break', '<w:p><w:r><w:t>Villa Marina</w:t><w:br/><w:t>ul. Portowa 4</w:t></w:r></w:p>', extracted.breakOffsets)
const crossBreak = ground([wire(broken.block, 'Villa Marinaul. Portowa 4')], [broken])
assert(crossBreak.ok)
assert.deepEqual(crossBreak.mappings[0]?.span.segments, [{ start: 0, end: 12 }, { start: 12, end: 25 }])

const tableA = { ...source('cell-a', '<w:p><w:r><w:t>Hotel A</w:t></w:r></w:p>'), block: { ...source('cell-a', '<w:p><w:r><w:t>Hotel A</w:t></w:r></w:p>').block, kind: 'tableCell' as const } }
const tableB = { ...source('cell-b', '<w:p><w:r><w:t>Hotel A</w:t></w:r></w:p>'), block: { ...source('cell-b', '<w:p><w:r><w:t>Hotel A</w:t></w:r></w:p>').block, kind: 'tableCell' as const } }
assert.equal(ground([wire(tableA.block, 'Hotel A'), wire(tableB.block, 'Hotel A')], [tableA, tableB]).ok, true)
const unicodeAddress = source('unicode-address', '<w:p><w:r><w:t>Adres: ul. Żółwia 7/2, 00-123 Łódź.</w:t></w:r></w:p>')
const address = ground([{ ...wire(unicodeAddress.block, 'ul. Żółwia 7/2, 00-123 Łódź', 'customer_address'), customerIndex: 0 }], [unicodeAddress])
assert(address.ok)
assert.equal(address.mappings[0]?.anchor, 'ul. Żółwia 7/2, 00-123 Łódź')

const invalid = { ...g01Mapping, startTokenId: 'unknown' }
const invalidResult = ground([invalid], [g01])
assert(!invalidResult.ok && invalidResult.code === 'invalid_token_range')
const unknownBlockResult = ground([{ ...g01Mapping, sourceBlockId: 'absent' }], [g01])
assert(!unknownBlockResult.ok && unknownBlockResult.code === 'unknown_source')
const reversed = { ...g01Mapping, startTokenId: g01Mapping.endTokenId, endTokenId: g01Mapping.startTokenId }
const reversedResult = ground([reversed], [g01])
assert(!reversedResult.ok && reversedResult.code === 'invalid_token_range')
const wrongBlock = { ...g01Mapping, startTokenId: wire(prose.block, 'Dom A').startTokenId }
const wrongBlockResult = ground([wrongBlock], [g01, prose])
assert(!wrongBlockResult.ok && wrongBlockResult.code === 'invalid_token_range')
const staleBlock = { ...g01.block, text: g01.block.text + ' changed' }
const staleResult = ground([g01Mapping], [{ ...g01, block: staleBlock }])
assert(!staleResult.ok && staleResult.code === 'stale_source')
const staleBreakResult = ground([wire(broken.block, 'Villa Marinaul. Portowa 4')], [{ ...broken, block: { ...broken.block, breakOffsets: [] } }])
assert(!staleBreakResult.ok && staleBreakResult.code === 'stale_source')
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...g01Mapping, anchor: exactG01 }] }).ok, false)
assert.equal(parseSemanticMapResponse({ semanticMappings: [{ ...g01Mapping, occurrence: 0 }] }).ok, false)

console.log('semantic source token tests: PASS')
