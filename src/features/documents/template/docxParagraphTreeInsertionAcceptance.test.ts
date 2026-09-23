import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyDocxParagraphInsertions } from './docxParagraphEditor'
import { writeSemanticMappingDocx, writeTransformedDocx } from '@/features/ai-contract-transform/docxTransformWriter'
import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const table = (rows: string[][]) => `<w:tbl>${rows.map((row) => `<w:tr>${row.map((text) => `<w:tc>${p(text)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`

async function pack(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="urn:w"><w:body>${body}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function verify() {
  const input = await pack([
    p('body A'),
    table([['cell B', 'cell C']]),
    p('body D'),
    table([['signature E', 'signature F']]),
  ].join(''))
  const source = await indexDocxForTransform(input)
  const bodyAnchor = source.find((block) => block.text === 'body A')!
  const out = await applyDocxParagraphInsertions(input, [{
    afterIndex: bodyAnchor.paragraphIndex,
    paragraphs: ['extra one', 'extra two'],
  }])
  const indexed = await indexDocxForTransform(out)
  const get = (text: string) => indexed.find((block) => block.text === text)
  assert.equal(get('cell B')?.tableIndex, 0)
  assert.equal(get('cell B')?.rowIndex, 0)
  assert.equal(get('cell B')?.cellIndex, 0)
  assert.equal(get('cell C')?.tableIndex, 0)
  assert.equal(get('cell C')?.cellIndex, 1)
  assert.equal(get('body D')?.kind, 'paragraph')
  assert.equal(get('signature E')?.tableIndex, 1)
  assert.equal(get('signature E')?.cellIndex, 0)
  assert.equal(get('signature F')?.tableIndex, 1)
  assert.equal(get('signature F')?.cellIndex, 1)
  const texts = indexed.map((block) => block.text)
  assert.deepEqual(texts.slice(0, 3), ['body A', 'extra one', 'extra two'])

  // Low-level insertion within a cell remains supported and local to that cell.
  const cellAnchor = indexed.find((block) => block.text === 'cell B')!
  const cellOut = await applyDocxParagraphInsertions(out, [{
    afterIndex: cellAnchor.paragraphIndex,
    paragraphs: ['cell-local extra'],
  }])
  const cellIndexed = await indexDocxForTransform(cellOut)
  const local = cellIndexed.find((block) => block.text === 'cell-local extra')!
  assert.equal(local.tableIndex, 0)
  assert.equal(local.rowIndex, 0)
  assert.equal(local.cellIndex, 0)
  assert.equal(cellIndexed.find((block) => block.text === 'cell C')?.cellIndex, 1)
  assert.equal(cellIndexed.find((block) => block.text === 'signature F')?.tableIndex, 1)

  const semanticSource = await pack('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Alice</w:t></w:r><w:r><w:t>, legal suffix</w:t></w:r></w:p>')
  const semanticBytes = await writeSemanticMappingDocx({
    sourceBytes: semanticSource,
    sourceBlocks: [{ blockId: 'para-0', paragraphIndex: 0, text: 'Alice, legal suffix', kind: 'paragraph' }],
    execution: { ok: true, paragraphs: [], spanEdits: [{ blockId: 'para-0', span: { start: 0, end: 5 }, replacement: 'Helena' }] },
    paragraphInsertions: [{ afterParagraphIndex: 0, paragraphs: ['extra'], listNumbering: 'detach' }],
  })
  const semanticZip = await JSZip.loadAsync(semanticBytes)
  const semanticXml = await semanticZip.file('word/document.xml')!.async('string')
  assert.match(semanticXml, /<w:rPr><w:b\/><\/w:rPr><w:t>Helena<\/w:t>/)
  assert.match(semanticXml, /<w:t>, legal suffix<\/w:t>/)
  assert.match(semanticXml, /<w:t(?:\s[^>]*)?>extra<\/w:t>/)
  const finalBytes = await writeTransformedDocx({
    sourceBytes: semanticBytes,
    sourceBlocks: [{ blockId: 'para-0', paragraphIndex: 0, text: 'Alice, legal suffix', kind: 'paragraph' }],
    transformedBlocks: [{ blockId: 'para-0', text: 'Helena, legal suffix' }],
    sourceAlreadyContainsGroundedEdits: true,
    paragraphInsertions: [{ afterParagraphIndex: 1, paragraphs: ['later extra'], listNumbering: 'detach' }],
  })
  const finalZip = await JSZip.loadAsync(finalBytes)
  const finalXml = await finalZip.file('word/document.xml')!.async('string')
  assert.match(finalXml, /<w:rPr><w:b\/><\/w:rPr><w:t>Helena<\/w:t>/)
  assert.match(finalXml, /<w:t>, legal suffix<\/w:t>/)
  assert.match(finalXml, /<w:t(?:\s[^>]*)?>later extra<\/w:t>/)
  console.log('PASS semantic span OOXML remains authoritative through extras insertion')

  const goldenFixtures = [
    { name: 'G03', tables: [[['team roster']], [['package cell'], ['payment cell']]], required: ['team roster', 'package cell', 'payment cell'] },
    { name: 'G04', tables: [[['base package cell']], [['delivery schedule 2028-01-25']], [['payment cell']]], required: ['base package cell', 'delivery schedule 2028-01-25', 'payment cell'] },
    { name: 'G05', tables: [[['waiver cell']], [['signature cell']]], required: ['waiver cell', 'signature cell'] },
    { name: 'G06', tables: [[['budget cell']], [['payment schedule cell']], [['signature cell']]], required: ['budget cell', 'payment schedule cell', 'signature cell'] },
  ]
  for (const fixture of goldenFixtures) {
    const fixtureSource = await pack([
      p(`${fixture.name} safe body boundary`),
      ...fixture.tables.map((rows) => table(rows)),
      p('payment boundary'),
    ].join(''))
    const fixtureBlocks = await indexDocxForTransform(fixtureSource)
    const anchor = fixtureBlocks.find((block) => block.text === `${fixture.name} safe body boundary`)!
    const fixtureOut = await applyDocxParagraphInsertions(fixtureSource, [{
      afterIndex: anchor.paragraphIndex,
      paragraphs: ['approved extras sibling'],
    }])
    const after = await indexDocxForTransform(fixtureOut)
    for (const text of fixture.required) {
      const beforeBlock = fixtureBlocks.find((block) => block.text === text)!
      const afterBlock = after.find((block) => block.text === text)!
      assert.ok(afterBlock, `${fixture.name}: original table text remains`)
      assert.equal(afterBlock.kind, beforeBlock.kind, `${fixture.name}: kind retained for ${text}`)
      assert.equal(afterBlock.tableIndex, beforeBlock.tableIndex, `${fixture.name}: table retained for ${text}`)
      assert.equal(afterBlock.rowIndex, beforeBlock.rowIndex, `${fixture.name}: row retained for ${text}`)
      assert.equal(afterBlock.cellIndex, beforeBlock.cellIndex, `${fixture.name}: cell retained for ${text}`)
    }
    assert.equal(after.filter((block) => block.text.includes('2028-01-25')).length, fixture.name === 'G04' ? 1 : 0, `${fixture.name}: delivery date locality/count`)
    assert.equal(after.find((block) => block.text === 'approved extras sibling')?.kind, 'paragraph', `${fixture.name}: extras stay at body boundary`)
  }
  console.log('PASS G03-G06 representative table ancestry and G04 delivery locality')
  console.log('PASS tree-aware insertion preserves body/table/row/cell ancestry')
}

await verify()
