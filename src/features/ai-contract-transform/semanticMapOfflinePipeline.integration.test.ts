import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { parseSemanticMapResponse } from './semanticMapModelContract'
import { resolveSemanticMappings, type IndexedSourceParagraph } from './semanticMapping'
import { executeSemanticMappings } from './semanticMappingExecutor'
import { writeSemanticMappingDocx } from './docxTransformWriter'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

function assertThat(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

const paragraphXml = [
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Anna</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> Nowak</w:t></w:r><w:r><w:t xml:space="preserve"> (client) signs with Video Productions Marcin Hibszer; other terms remain in force.</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Wydarzenie: 12.07.2025</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Umowę zawarto: 03.06.2025</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Wartość umowy: 3500 zł</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Zaliczka: 800 zł</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Pozostało: 2700 zł (słownie: dwa tysiące siedemset złotych)</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Miejsce przyjęcia: Stara Sala, Warszawa</w:t></w:r></w:p>',
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>900 zł</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  '<w:p><w:r><w:rPr><w:u/></w:rPr><w:t>Pakiet fotograficzny i pozostałe postanowienia prawne pozostają bez zmian.</w:t></w:r></w:p>',
]
const originalDocumentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml.join('')}<w:sectPr/></w:body></w:document>`

const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Maria Kowalska i Ewa Nowak', personCount: 2 },
  dates: { weddingDate: '2026-08-14', contractExecutionDate: '2026-07-01' },
  finances: {
    contractValueFormatted: '4 800 zł', contractValueWords: '',
    depositFormatted: '1 200 zł', depositWords: '',
    remainingFormatted: '3 600 zł', remainingWords: '',
  },
  locations: { reception: { displayName: 'Nowa Sala', city: 'Gdańsk' } },
  package: {},
}

function extractXmlParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
}

async function readDocumentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file('word/document.xml')
  assertThat(file, 'DOCX has word/document.xml')
  return file.async('string')
}

async function makeSourceDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', originalDocumentXml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function sourceBlocks(): Promise<{ blocks: TransformDocumentBlock[]; paragraphs: IndexedSourceParagraph[] }> {
  const texts = extractXmlParagraphs(originalDocumentXml)
  const ids = ['party-mixed', 'wedding-date', 'execution-date', 'total', 'deposit', 'remaining', 'reception', 'table-total', 'unmapped-terms']
  const blocks = texts.map((xml, index): TransformDocumentBlock => ({
    blockId: ids[index]!, paragraphIndex: index,
    text: extractCanonicalParagraphText(xml),
    kind: index === 7 ? 'tableCell' : 'paragraph',
    ...(index === 7 ? { tableIndex: 0, rowIndex: 0, cellIndex: 0 } : {}),
  }))
  return { blocks, paragraphs: texts.map((xml, index) => ({ blockId: ids[index]!, paragraphXml: xml })) }
}

const mappings = [
  { sourceBlockId: 'party-mixed', concept: 'customer_1_name', anchor: 'Anna Nowak', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: 'BASE' },
  { sourceBlockId: 'wedding-date', concept: 'wedding_date', anchor: '12.07.2025', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'execution-date', concept: 'execution_date', anchor: '03.06.2025', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'total', concept: 'total', anchor: '3500 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'deposit', concept: 'deposit', anchor: '800 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'remaining', concept: 'remaining', anchor: '2700 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'remaining', concept: 'remaining_words', anchor: 'dwa tysiące siedemset złotych', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'reception', concept: 'reception_location', anchor: 'Stara Sala, Warszawa', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  { sourceBlockId: 'table-total', concept: 'total', anchor: '900 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
]

async function runPositiveReplay() {
  const providerShapedResponse = JSON.stringify({ semanticMappings: mappings })
  const parsed = parseSemanticMapResponse(providerShapedResponse)
  assertThat(parsed.ok, 'strict provider response parsed and null occurrence normalized')
  const source = await sourceBlocks()
  const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: source.paragraphs })
  assertThat(grounded.ok, 'all literal source anchors ground without legacy discovery')
  const executed = executeSemanticMappings({
    resolvedMappings: grounded.mappings,
    canonicalDataset: dataset,
    sourceParagraphs: source.paragraphs,
    sourceCustomerIdentities: ['Anna Nowak'],
  })
  assertThat(executed.ok, 'deterministic executor accepts grounded mappings')
  const outputBytes = await writeSemanticMappingDocx({ sourceBytes: await makeSourceDocx(), sourceBlocks: source.blocks, execution: executed })
  return { outputBytes, executed, outputXml: await readDocumentXml(outputBytes), source }
}

async function main() {
  const result = await runPositiveReplay()
  const before = extractXmlParagraphs(originalDocumentXml)
  const after = extractXmlParagraphs(result.outputXml)
  const text = after.map(extractCanonicalParagraphText)

  assertThat(!text[0]!.includes('Anna Nowak') && text[0]!.includes('Maria Kowalska'), 'customer surface contains canonical name')
  assertThat(text[0]!.includes('Video Productions Marcin Hibszer; other terms remain in force.'), 'provider and legal words remain unchanged')
  assertThat(result.outputXml.includes('<w:rPr><w:b/></w:rPr><w:t>Maria Kowalska</w:t>'), 'replacement keeps first overlapped run formatting')
  assertThat(/<w:rPr><w:i\/><\/w:rPr><w:t(?:\s[^>]*)?><\/w:t>/.test(result.outputXml), 'covered styled run remains intact')
  assertThat(after[0]!.includes('Video Productions Marcin Hibszer; other terms remain in force.'), 'mixed paragraph remainder is unchanged')

  assertThat(!text[1]!.includes('12.07.2025') && text[1]!.includes('14.08.2026'), 'wedding date uses wedding CRM value')
  assertThat(!text[2]!.includes('03.06.2025') && text[2]!.includes('01.07.2026'), 'execution date uses execution CRM value')
  assertThat(text[1]!.includes('14.08.2026') && !text[1]!.includes('1 lipca'), 'date roles are not swapped')
  assertThat(text[3]!.includes('4 800 zł') && !text[3]!.includes('3500 zł'), 'total replaced by canonical amount')
  assertThat(text[4]!.includes('1 200 zł') && !text[4]!.includes('800 zł'), 'deposit replaced by canonical amount')
  assertThat(text[5]!.includes('3 600 zł') && !text[5]!.includes('2700 zł'), 'remaining replaced by canonical amount')
  assertThat(text[5]!.includes(polishContractMoneyWords(3600)), 'amount words derive from the same canonical remaining amount')
  assertThat(!text[5]!.includes('dwa tysiące siedemset złotych'), 'stale mapped amount words are removed')
  assertThat(text[6]!.includes('Nowa Sala, Gdańsk') && !text[6]!.includes('Stara Sala'), 'reception location replaced')
  assertThat(result.outputXml.includes('<w:tbl>') && result.outputXml.includes('</w:tbl>'), 'table structure remains present')
  assertThat(text[7]!.includes('4 800 zł') && !text[7]!.includes('900 zł'), 'table-cell amount replaced')
  assertThat(after[7]!.startsWith('<w:p>') && result.outputXml.includes('<w:tc><w:p>'), 'table cell keeps its paragraph nesting')
  assertThat(after[8] === before[8], 'unmapped package/legal paragraph XML is byte-for-byte unchanged')
  assertThat(result.outputXml.includes('<w:rPr><w:u/></w:rPr>'), 'unmapped underline formatting remains')
  assertThat(after.length === before.length, 'no paragraph is flattened, inserted, or dropped')
  for (let index = 0; index < after.length; index++) {
    if (![0, 1, 2, 3, 4, 5, 6, 7].includes(index)) assert.equal(after[index], before[index])
  }
  for (const { blockId, paragraphXml } of result.executed.paragraphs) {
    const index = result.source.blocks.find((block) => block.blockId === blockId)!.paragraphIndex
    assert.equal(after[index], paragraphXml, `DOCX contains executor OOXML for ${blockId}`)
  }

  const negativePayload = { semanticMappings: [
    { sourceBlockId: 'wedding-date', concept: 'wedding_date', anchor: 'not in source', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  ] }
  const negativeParsed = parseSemanticMapResponse(negativePayload)
  assertThat(negativeParsed.ok, 'negative case still has strict provider shape')
  const negativeGrounded = resolveSemanticMappings({ mappings: negativeParsed.semanticMappings, sourceBlocks: result.source.paragraphs })
  assertThat(!negativeGrounded.ok && negativeGrounded.code === 'anchor_missing', 'invalid anchor fails at grounding')
  let approvedArtifact: ArrayBuffer | undefined
  if (negativeGrounded.ok) {
    const execution = executeSemanticMappings({ resolvedMappings: negativeGrounded.mappings, canonicalDataset: dataset, sourceParagraphs: result.source.paragraphs })
    if (execution.ok) approvedArtifact = await writeSemanticMappingDocx({ sourceBytes: await makeSourceDocx(), sourceBlocks: result.source.blocks, execution })
  }
  assert.equal(approvedArtifact, undefined, 'failed validation yields no approved transformed artifact')
  assert.equal(extractCanonicalParagraphText(before[1]!), 'Wydarzenie: 12.07.2025', 'no whole-paragraph rewrite or fallback occurs')
  console.log('PASS offline provider-shaped semantic-map DOCX pipeline and fail-closed replay')
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
