/**
 * CG7 — extras list numbering integrity (no OpenAI).
 * Ensures inserted extras do not inherit outer legal-clause Word numbering.
 */

import JSZip from 'jszip'
import {
  applyDocxParagraphInsertions,
  stripParagraphListNumbering,
} from '@/features/documents/template/docxParagraphEditor'
import { insertAdditionalServicesIntoBlocks } from './insertAdditionalServices'
import { writeTransformedDocx } from './docxTransformWriter'
import { indexDocxForTransform } from './indexDocxForTransform'
import { reopenParses } from './cg1/docxInspect'
import type {
  ContractTransformationDataset,
  TransformedBlock,
} from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function numberedPara(text: string, numId = '1', ilvl = '0'): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function plainPara(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

async function pack(body: string): Promise<ArrayBuffer> {
  const numbering = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
  )
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  zip.folder('word')!.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`,
  )
  zip.folder('word')!.file('numbering.xml', numbering)
  zip.folder('word')!.folder('_rels')!.file(
    'document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`,
  )
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

function datasetWithExtras(names: string[]): ContractTransformationDataset {
  return {
    clients: { personCount: 2, displayNames: 'Anna Testowa i Jan Próbny' },
    dates: { weddingDate: '19.06.2027 r.' },
    package: { name: 'Pakiet QA' },
    finances: {
      contractValueFormatted: '13 500 zł',
      contractValueWords: 'trzynaście tysięcy pięćset złotych',
      depositFormatted: '3 780 zł',
      remainingFormatted: '9 720 zł',
    },
    locations: {},
    additionalServices: names.map((name, i) => ({ id: `e${i}`, name })),
  }
}

function countNumPr(xml: string): number {
  return (xml.match(/<w:numPr\b/g) || []).length
}

async function docXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return (await zip.file('word/document.xml')!.async('string')) as string
}

// Unit: strip helper
{
  const withNum =
    '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="120"/></w:pPr>'
  const stripped = stripParagraphListNumbering(withNum)
  assert(!stripped.includes('numPr'), 'strip removes numPr')
  assert(stripped.includes('spacing'), 'strip keeps other pPr')
  console.log('PASS  stripParagraphListNumbering helper')
}

// A + B: outer numbered legal list + new extras → no continued numbers; following clause keeps numPr
{
  const body = [
    plainPara('Umowa'),
    plainPara('Pakiet Video obejmuje:'),
    numberedPara('teledysk ślubny ok. 3 min;'),
    numberedPara('film ślubny ok. 15 min;'),
    numberedPara('pendrive z materiałem;'),
    numberedPara('Fotografowie wykonują przedmiot Umowy we dwoje.'),
    plainPara('§ Wynagrodzenie'),
    plainPara('Podpisy'),
  ].join('')
  const sourceBytes = await pack(body)
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const transformed: TransformedBlock[] = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const inserted = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset: datasetWithExtras([
      'dodatkowy operator',
      'film w wersji rozszerzonej',
    ]),
  })
  assert(
    inserted.paragraphInsertions[0]?.listNumbering === 'detach',
    'A: detach requested',
  )
  const out = await writeTransformedDocx({
    sourceBytes,
    sourceBlocks,
    transformedBlocks: inserted.blocks,
    paragraphInsertions: inserted.paragraphInsertions,
  })
  const xml = await docXml(out)
  // Extract paragraphs containing extras vs following legal clause
  const paras = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => m[0]!)
  const extrasParas = paras.filter(
    (p) =>
      p.includes('usługi dodatkowe') ||
      p.includes('dodatkowy operator') ||
      p.includes('film w wersji rozszerzonej'),
  )
  assert(extrasParas.length >= 2, 'A: extras paragraphs present')
  for (const p of extrasParas) {
    assert(!p.includes('<w:numPr'), 'A: extras must not carry outer numPr')
  }
  const duo = paras.find((p) => p.includes('wykonują przedmiot Umowy we dwoje'))
  assert(!!duo && duo.includes('<w:numPr'), 'B: following numbered clause keeps numPr')
  assert(await reopenParses(out), 'G-part: reopen after A')
  console.log('PASS  A/B: outer numbered list — extras detached; following clause preserved')
}

// C: existing bullet extras list remains SOURCE-authored; selected extras are separate.
{
  const body = [
    plainPara('Umowa'),
    plainPara('Usługi dodatkowe:'),
    plainPara('– sesja narzeczeńska'),
    plainPara('§ Płatności'),
  ].join('')
  const sourceBytes = await pack(body)
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const inserted = insertAdditionalServicesIntoBlocks({
    blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    sourceBlocks,
    dataset: datasetWithExtras(['ujęcie z drona']),
    placement: { sourceBlockId: sourceBlocks[2]!.blockId, side: 'after' },
  })
  const blob = inserted.blocks.map((b) => b.text).join('\n')
  assert(!blob.includes('ujęcie z drona'), `C: SOURCE untouched got=${JSON.stringify(blob)}`)
  assert(inserted.paragraphInsertions[0]?.paragraphs.some((p) => p.includes('– ujęcie z drona')), 'C: separate bullet')
  assert(inserted.paragraphInsertions.length === 1, 'C: new paragraphs')
  console.log('PASS  C: existing bullet extras list')
}

// D: existing numbered extras list remains SOURCE-authored.
{
  const body = [
    plainPara('Usługi dodatkowe wybrane przez Zamawiającego:'),
    numberedPara('1. sesja o wschodzie słońca', '1'),
    plainPara('Podpisy'),
  ].join('')
  const sourceBytes = await pack(body)
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const inserted = insertAdditionalServicesIntoBlocks({
    blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    sourceBlocks,
    dataset: datasetWithExtras(['ekspresowy montaż']),
    placement: { sourceBlockId: sourceBlocks[1]!.blockId, side: 'after' },
  })
  const blob = inserted.blocks.map((b) => b.text).join('\n')
  assert(!blob.includes('ekspresowy montaż'), 'D: SOURCE untouched')
  assert(inserted.paragraphInsertions[0]?.paragraphs.some((p) => p.includes('ekspresowy montaż')), 'D: selected extra separate')
  console.log('PASS  D: existing numbered extras section local semantics')
}

// E: table destination — insertion avoided for protected package table; no numbering corruption
{
  const table = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Materiał</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>W cenie</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
  const body = [
    plainPara('Pakiet Photo Standard'),
    table,
    numberedPara('Operator pracuje samodzielnie.'),
    plainPara('Podpisy'),
  ].join('')
  const sourceBytes = await pack(body)
  const before = countNumPr(await docXml(sourceBytes))
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  // Force before_payment style insertion after a numbered para
  const anchor = sourceBlocks.find((b) => /Operator pracuje/i.test(b.text))!
  const out = await writeTransformedDocx({
    sourceBytes,
    sourceBlocks,
    transformedBlocks: sourceBlocks.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    })),
    paragraphInsertions: [
      {
        afterParagraphIndex: anchor.paragraphIndex,
        paragraphs: [
          'Ponadto zakres umowy obejmuje następujące usługi dodatkowe:',
          '– VHS;',
        ],
        listNumbering: 'detach',
      },
    ],
  })
  const xml = await docXml(out)
  const vhs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((m) => m[0]!)
    .find((p) => p.includes('VHS'))
  assert(!!vhs && !vhs.includes('<w:numPr'), 'E: table-adjacent insert without numPr')
  assert(countNumPr(xml) === before, 'E: original numPr count unchanged for source paras')
  console.log('PASS  E: table-adjacent insert — no numbering corruption')
}

// F: nested list — extras get detached plain/bullet treatment
{
  const body = [
    plainPara('Zakres:'),
    numberedPara('Pakiet obejmuje:', '1', '0'),
    numberedPara('zdjęcia reportażowe;', '1', '1'),
    numberedPara('galeria online;', '1', '1'),
    numberedPara('Podpisanie protokołu odbioru.', '1', '0'),
  ].join('')
  const sourceBytes = await pack(body)
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const lastDeliverable = sourceBlocks.find((b) => /galeria online/i.test(b.text))!
  const out = await applyDocxParagraphInsertions(sourceBytes, [
    {
      afterIndex: lastDeliverable.paragraphIndex,
      paragraphs: ['– ujęcie z drona;'],
      listNumbering: 'detach',
    },
  ])
  const xml = await docXml(out)
  const drone = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((m) => m[0]!)
    .find((p) => p.includes('drona'))
  assert(!!drone && !drone.includes('<w:numPr'), 'F: nested — extras detached')
  console.log('PASS  F: nested list — safe plain treatment')
}

// G: DOCX reopen preserves numbering after detach insert
{
  const body = [
    numberedPara('a'),
    numberedPara('b'),
    numberedPara('c — następna klauzula'),
  ].join('')
  const sourceBytes = await pack(body)
  const out = await applyDocxParagraphInsertions(sourceBytes, [
    {
      afterIndex: 1,
      paragraphs: ['– extra;'],
      listNumbering: 'detach',
    },
  ])
  assert(await reopenParses(out), 'G: reopen')
  const xml = await docXml(out)
  assert(
    (xml.match(/<w:numPr\b/g) || []).length === 3,
    'G: three original numbered paras retain numPr',
  )
  console.log('PASS  G: DOCX reopen preserves numbering')
}

console.log('\nAll CG7 extras-numbering integrity regressions passed.')
