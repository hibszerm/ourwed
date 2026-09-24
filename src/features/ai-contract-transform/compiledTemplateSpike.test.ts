import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { indexDocxForTransform } from './indexDocxForTransform'
import {
  createCompiledTemplateSpikeManifest,
  executeCompiledTemplateSpike,
  type CompiledTemplateSpikeBinding,
} from './compiledTemplateSpike'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

function paragraph(text: string, style = 'BodyText', runStyle = '<w:b/>'): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:rPr>${runStyle}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function splitNameParagraph(): string {
  return '<w:p><w:pPr><w:pStyle w:val="ClientName"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Klient: Alicja </w:t></w:r><w:r><w:t>Przykładowa</w:t></w:r></w:p>'
}

async function makeSourceDocx(): Promise<ArrayBuffer> {
  const paragraphs = [
    splitNameParagraph(),
    paragraph('Dla Alicja Przykładowa.', 'LegalBody'),
    paragraph('Z Alicja Przykładowa.', 'LegalBody'),
    paragraph('Miejsce: Kościół pw. św. Józefa', 'LegalBody'),
    paragraph('Data wesela: 18 września 2027 r.', 'LegalBody'),
    paragraph('Zawarcie: 01.01.2020', 'LegalBody'),
    paragraph('Kwota: 7 000 zł', 'LegalBody'),
    paragraph('Słownie: siedem tysięcy złotych 00/100', 'LegalBody'),
    paragraph('Warunki prawne pozostają niezmienione.', 'LegalBody'),
    paragraph('Wzór listy', 'ExtraStyle', '<w:i/>'),
    paragraph('Podpisy stron', 'Signature'),
  ].join('')
  const table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Stały tekst tabeli</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}${table}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const dataset: ContractTransformationDataset = {
  clients: {
    displayNames: 'Julia Kanicka',
    personCount: 1,
    customers: [{ displayName: 'Julia Kanicka', address: 'ul. Testowa 1', phone: '+48 500 000 001', email: 'julia@example.test' }],
  },
  dates: { contractExecutionDate: '2026-09-24', weddingDate: '2027-09-18' },
  finances: { contractValueFormatted: '8 500 zł', contractValueWords: 'osiem tysięcy pięćset złotych' },
  package: { name: 'Pakiet testowy' },
  locations: { ceremony: { displayName: 'Kościół pw. św. Józefa' } },
  additionalServices: [{ id: 'extra-1', name: 'sesja narzeczeńska' }],
}

function fixtureBinding(
  blocks: readonly TransformDocumentBlock[],
  input: { paragraphIndex: number; text: string; concept: CompiledTemplateSpikeBinding['concept']; nameForm?: CompiledTemplateSpikeBinding['nameForm']; grammaticalIntent?: string; localContext?: string },
): CompiledTemplateSpikeBinding {
  const block = blocks.find((candidate) => candidate.paragraphIndex === input.paragraphIndex)
  assert.ok(block, `fixture paragraph ${input.paragraphIndex} indexed`)
  const start = block.text.indexOf(input.text)
  assert.notEqual(start, -1, `fixture binding text exists in paragraph ${input.paragraphIndex}`)
  return {
    id: `binding-${input.paragraphIndex}-${input.concept}-${start}`,
    concept: input.concept,
    sourceBlockId: block.blockId,
    span: { start, end: start + input.text.length },
    sourceSampleText: input.text,
    required: true,
    ...(input.nameForm ? { nameForm: input.nameForm } : {}),
    ...(input.grammaticalIntent ? { grammaticalIntent: input.grammaticalIntent } : {}),
    ...(input.localContext ? { localContext: input.localContext } : {}),
  }
}

async function buildManifest(sourceBytes: ArrayBuffer) {
  const blocks = await indexDocxForTransform(sourceBytes)
  const bindings: CompiledTemplateSpikeBinding[] = [
    fixtureBinding(blocks, { paragraphIndex: 0, text: 'Alicja Przykładowa', concept: 'customer_1_name', nameForm: 'BASE' }),
    fixtureBinding(blocks, { paragraphIndex: 1, text: 'Alicja Przykładowa', concept: 'customer_1_name', nameForm: 'GENITIVE', localContext: 'Dla [VALUE].' }),
    fixtureBinding(blocks, { paragraphIndex: 2, text: 'Alicja Przykładowa', concept: 'customer_1_name', nameForm: 'INSTRUMENTAL', localContext: 'Z [VALUE].' }),
    fixtureBinding(blocks, { paragraphIndex: 3, text: 'Kościół pw. św. Józefa', concept: 'ceremony_location', grammaticalIntent: 'LOCATIVE', localContext: 'Miejsce: [VALUE]' }),
    fixtureBinding(blocks, { paragraphIndex: 4, text: '18 września 2027 r.', concept: 'wedding_date' }),
    fixtureBinding(blocks, { paragraphIndex: 5, text: '01.01.2020', concept: 'execution_date' }),
    fixtureBinding(blocks, { paragraphIndex: 6, text: '7 000 zł', concept: 'total' }),
    fixtureBinding(blocks, { paragraphIndex: 7, text: 'siedem tysięcy złotych 00/100', concept: 'total_words' }),
  ]
  const blockId = (index: number) => blocks.find((block) => block.paragraphIndex === index)!.blockId
  const manifest = await createCompiledTemplateSpikeManifest({
    sourceBytes,
    templateVersionId: 'synthetic-template-v1',
    bindings,
    extras: {
      anchorBlockId: blockId(8),
      side: 'after',
      styleExemplarBlockId: blockId(9),
      signatureBoundaryBlockId: blockId(10),
    },
  })
  return { blocks, manifest }
}

async function documentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file('word/document.xml')
  assert.ok(file, 'output DOCX reopens and contains document.xml')
  return file.async('string')
}

async function outputParagraphs(bytes: ArrayBuffer): Promise<{ text: string; xml: string }[]> {
  const xml = await documentXml(bytes)
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => ({
    text: extractCanonicalParagraphText(match[0]!),
    xml: match[0]!,
  }))
}

async function run() {
  const sourceBytes = await makeSourceDocx()
  const { manifest } = await buildManifest(sourceBytes)
  assert.equal(manifest.bindings.filter((binding) => binding.concept === 'customer_1_name').length, 3, 'manifest stores all three customer-name occurrences')

  const unresolved = await executeCompiledTemplateSpike({
    sourceBytes,
    expectedTemplateVersionId: 'synthetic-template-v1',
    manifest,
    canonicalDataset: dataset,
  })
  assert.equal(unresolved.status, 'UNRESOLVED', 'unsupported production name/place forms are explicit')
  if (unresolved.status === 'UNRESOLVED') {
    assert.deepEqual(unresolved.bindingIds, [
      manifest.bindings[1]!.id,
      manifest.bindings[2]!.id,
      manifest.bindings[3]!.id,
    ])
  }

  const renderedResult = await executeCompiledTemplateSpike({
    sourceBytes,
    expectedTemplateVersionId: 'synthetic-template-v1',
    manifest,
    canonicalDataset: dataset,
    renderers: {
      personName: ({ canonicalValue, grammaticalForm }) => {
        if (canonicalValue !== 'Julia Kanicka') return { status: 'UNSUPPORTED' }
        return { status: 'RESOLVED', value: grammaticalForm === 'GENITIVE' ? 'Julii Kanickiej' : 'Julią Kanicką' }
      },
      placeName: ({ canonicalValue, grammaticalIntent }) => canonicalValue === 'Kościół pw. św. Józefa' && grammaticalIntent === 'LOCATIVE'
        ? { status: 'RENDERED', value: 'Kościele pw. św. Józefa' }
        : { status: 'UNRESOLVED' },
    },
  })
  assert.equal(renderedResult.status, 'COMPLETED', 'adjudicated fixture renderings execute through the same DOCX engine')
  if (renderedResult.status !== 'COMPLETED') return
  assert.equal(renderedResult.bindingReceipts.length, manifest.bindings.length, 'every stored binding executes exactly once')
  assert.deepEqual(renderedResult.bindingReceipts.slice(0, 4).map((receipt) => receipt.replacement), [
    'Julia Kanicka', 'Julii Kanickiej', 'Julią Kanicką', 'Kościele pw. św. Józefa',
  ], 'each occurrence uses its own stored form or isolated place renderer')
  assert.equal(renderedResult.bindingReceipts[6]?.replacement, '8 500 zł', 'numeric amount is deterministic')
  assert.equal(renderedResult.bindingReceipts[7]?.replacement, 'osiem tysięcy pięćset złotych', 'amount words derive from the same authoritative amount')
  assert.equal(renderedResult.bindingReceipts[4]?.replacement, '18 września 2027 r.', 'compiled wedding-date role keeps Polish date style')
  assert.equal(renderedResult.bindingReceipts[5]?.replacement, '24.09.2026', 'compiled execution-date role keeps a different source style')

  const paragraphs = await outputParagraphs(renderedResult.docxBytes)
  const visible = paragraphs.map((item) => item.text)
  assert.deepEqual(visible.slice(8, 12), [
    'Warunki prawne pozostają niezmienione.',
    'sesja narzeczeńska',
    'Wzór listy',
    'Podpisy stron',
  ], 'extra appears exactly after the stored anchor and before signatures')
  assert.ok(paragraphs[9]?.xml.includes('<w:pStyle w:val="ExtraStyle"/>'), 'extra inherits the stored exemplar paragraph style')
  assert.ok(paragraphs[9]?.xml.includes('<w:i/>'), 'extra inherits the stored exemplar run formatting')
  assert.equal(visible[9], 'sesja narzeczeńska', 'extra contains only its authoritative CRM name, with no invented price')
  assert.ok(visible.includes('Stały tekst tabeli'), 'non-bound table text remains')
  assert.ok(!visible.some((text) => text.includes('Alicja Przykładowa')), 'bound stale sample names are removed at every stored occurrence')
  assert.ok(visible[7]?.endsWith('osiem tysięcy pięćset złotych 00/100'), 'source-owned 00/100 presentation remains intact')

  const second = await executeCompiledTemplateSpike({
    sourceBytes,
    expectedTemplateVersionId: 'synthetic-template-v1',
    manifest,
    canonicalDataset: dataset,
    renderers: {
      personName: ({ canonicalValue, grammaticalForm }) => ({ status: 'RESOLVED', value: grammaticalForm === 'GENITIVE' ? 'Julii Kanickiej' : 'Julią Kanicką' }),
      placeName: ({ canonicalValue, grammaticalIntent }) => canonicalValue === 'Kościół pw. św. Józefa' && grammaticalIntent === 'LOCATIVE'
        ? { status: 'RENDERED', value: 'Kościele pw. św. Józefa' }
        : { status: 'UNRESOLVED' },
    },
  })
  assert.equal(second.status, 'COMPLETED')
  if (second.status === 'COMPLETED') {
    assert.equal(await documentXml(renderedResult.docxBytes), await documentXml(second.docxBytes), 'normalized document XML is deterministic across repeated runs')
  }

  const wrongFingerprint = await executeCompiledTemplateSpike({
    sourceBytes,
    expectedTemplateVersionId: 'synthetic-template-v1',
    manifest: { ...manifest, sourceSha256: '0'.repeat(64) },
    canonicalDataset: dataset,
  })
  assert.deepEqual(wrongFingerprint, { status: 'FAILED', reason: 'template_fingerprint_mismatch' }, 'fingerprint mismatch fails closed before execution')

  const wrongVersion = await executeCompiledTemplateSpike({
    sourceBytes,
    expectedTemplateVersionId: 'different-template-v2',
    manifest,
    canonicalDataset: dataset,
  })
  assert.deepEqual(wrongVersion, { status: 'FAILED', reason: 'template_version_mismatch' }, 'template version mismatch fails closed')

  console.log('compiled-template-spike: all passed (synthetic DOCX fixture)')
}

void run()
