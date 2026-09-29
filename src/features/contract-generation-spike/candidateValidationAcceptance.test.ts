import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import {
  hasMoneyAmount,
  hasPolishNameFacts,
  hasSemanticDate,
  makeInput,
  readSource,
  validateCandidate,
  type BlockOperation,
  type GenerationInput,
} from './generator'

const pageField = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
const numPagesField = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

async function fixture(packageText = 'Pakiet Alpha obejmuje jednego fotografa.'): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const body = [
    'numer CT-18-2027',
    'Umowę zawarto 4 marca 2027 roku w Warszawie. Wesele odbędzie się 20 sierpnia 2027 roku.',
    'Ada Test, ada@example.com, tel. 111 222 333; Bar Test, bar@example.com, tel. 444 555 666.',
    'Adres: ul. Kwiatowa 1, 00-001 Warszawa.',
    'Miejsca: ul. Kwiatowa 1, 00-001 Warszawa; ul. Kwiatowa 1, 00-001 Warszawa; ul. Kwiatowa 1, 00-001 Warszawa.',
    'Wartość: 10 000 zł; wpłata: 1 000 zł; pozostało: 9 000 zł.',
    packageText,
  ].map(paragraph).join('')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`)
  zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t xml:space="preserve">Studio | CT-18-2027 | strona </w:t></w:r>${pageField}<w:r><w:t xml:space="preserve"> z </w:t></w:r>${numPagesField}</w:p></w:ftr>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function partyFixture(): Promise<ArrayBuffer> {
  const base = await fixture()
  const zip = await JSZip.loadAsync(base)
  const xml = await zip.file('word/document.xml')!.async('string')
  const cell = (text: string) => `<w:tc><w:tcPr/>${paragraph(text)}</w:tc>`
  const partyTable = `<w:tbl><w:tr>${cell('Zleceniodawczyni')}${cell('Lena Fikcyjna')}</w:tr><w:tr>${cell('Zleceniodawca')}${cell('Oskar Umowny')}</w:tr></w:tbl>`
  const signatureTable = `<w:tbl><w:tr>${cell('Lena Fikcyjna')}${cell('Oskar Umowny')}</w:tr><w:tr>${cell('Zleceniodawczyni — data i podpis')}${cell('Zleceniodawca — data i podpis')}</w:tr></w:tbl>`
  const partyRows = `${paragraph('Wykonawca: Studio Obiektyw; świadek: Tomasz Neutralny.')}${partyTable}${signatureTable}`
  zip.file('word/document.xml', xml.replace('<w:sectPr/>', `${partyRows}<w:sectPr/>`))
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function setup(sourceBytes: ArrayBuffer): Promise<{ input: GenerationInput; operations: BlockOperation[]; candidate: ArrayBuffer }> {
  const sourceDocument = await readSource(sourceBytes, 'source.docx')
  const input = makeInput({
    generationDate: '22.03.2027',
    sourceDocument,
    wedding: {
      bride: { name: 'Ada Test', email: 'ada@example.com', phone: '111 222 333' },
      groom: { name: 'Bar Test', phone: '444 555 666' },
      weddingDate: '21.08.2027',
      contractAddress: 'ul. Kwiatowa 1, 00-001 Warszawa',
      contractValuePln: 11400,
      depositPln: 2400,
      remainingDueDate: '04.09.2027',
      locations: {
        bridePreparations: 'ul. Kwiatowa 1, 00-001 Warszawa',
        groomPreparations: 'ul. Kwiatowa 1, 00-001 Warszawa',
        ceremony: 'ul. Kwiatowa 1, 00-001 Warszawa',
        reception: 'ul. Kwiatowa 1, 00-001 Warszawa',
      },
    },
    packagePolicy: { preserveSourcePackageExactly: true },
    extras: [],
    userProvidedAnswers: [{ id: 'contract.number', value: 'CT-24-2027' }],
  })
  const blocks = sourceDocument.blocks
  const conclusion = blocks.find((block) => block.text.includes('Umowę zawarto'))!
  const money = blocks.find((block) => block.text.startsWith('Wartość:'))!
  const number = blocks.find((block) => block.text.startsWith('numer '))!
  const footer = blocks.find((block) => block.kind === 'footer')!
  const operations: BlockOperation[] = [
    { blockId: number.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'numer CT-24-2027' },
    { blockId: conclusion.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Umowę zawarto 22 marca 2027 roku w Warszawie. Wesele odbędzie się 21 sierpnia 2027 roku.' },
    { blockId: money.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Wartość: 11 400,00 zł; wpłata: 2 400,00 zł; pozostało: 9 000,00 zł.' },
    { blockId: footer.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Studio | CT-24-2027 | strona 1 z 1' },
  ]
  const candidate = await applyBlockOperations(sourceBytes, operations)
  return { input, operations, candidate }
}

async function modifyFooter(bytes: ArrayBuffer, transform: (xml: string) => string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('word/footer1.xml')!.async('string')
  zip.file('word/footer1.xml', transform(xml))
  return zip.generateAsync({ type: 'arraybuffer' })
}

const source = await fixture()
const { input, operations, candidate } = await setup(source)

assert.equal(hasSemanticDate('Zawarto umowę 22.03.2027 r.', '22.03.2027'), true, 'numeric date is accepted')
assert.equal(hasSemanticDate('Zawarto umowę 22 marca 2027 roku.', '22.03.2027'), true, 'written Polish date is accepted')
assert.equal(hasSemanticDate('Zawarto umowę 22 marca 2027.', '22.03.2027'), true, 'written Polish date without roku is accepted')
assert.equal(hasSemanticDate('Zawarto umowę 23 marca 2027 roku.', '22.03.2027'), false, 'wrong day is rejected')
assert.equal(hasSemanticDate('Zawarto umowę 22 kwietnia 2027 roku.', '22.03.2027'), false, 'wrong month is rejected')
assert.equal(hasSemanticDate('Zawarto umowę 22 marca 2028 roku.', '22.03.2027'), false, 'wrong year is rejected')
assert.equal(hasPolishNameFacts('Uroczystość Mateusza Wilka.', 'Mateusz Wilk'), true, 'natural Polish name inflection is accepted')
assert.equal(hasPolishNameFacts('Uroczystość Mateusza Wiśniewskiego.', 'Mateusz Wilk'), false, 'a different surname is rejected')
assert.equal(hasMoneyAmount('Wynagrodzenie: 11 400,00 zł.', 11400), true, 'source decimal style is accepted')
assert.equal(hasMoneyAmount('Wynagrodzenie: 11 400 zł.', 11400), true, 'integer source style is accepted')
assert.equal(hasMoneyAmount('Wynagrodzenie: 11 401,00 zł.', 11400), false, 'numerically different money is rejected')

assert.deepEqual(await validateCandidate(source, candidate, input, operations), [], 'written dates, source-style money, package, and planned footer text pass')

const numericDateCandidate = await applyBlockOperations(source, operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.includes('Umowę zawarto')
  ? { ...operation, finalText: 'Umowę zawarto 22.03.2027 r. w Warszawie. Wesele odbędzie się 21.08.2027 r.' }
  : operation))
assert.deepEqual(await validateCandidate(source, numericDateCandidate, input, operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.includes('Umowę zawarto')
  ? { ...operation, finalText: 'Umowę zawarto 22.03.2027 r. w Warszawie. Wesele odbędzie się 21.08.2027 r.' }
  : operation)), [], 'numeric date rendering passes semantic candidate checks')

const wrongDateOperations = operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.includes('Umowę zawarto')
  ? { ...operation, finalText: 'Umowę zawarto 23 marca 2027 roku w Warszawie. Wesele odbędzie się 22 marca 2027 roku.' }
  : operation)
const wrongDateCandidate = await applyBlockOperations(source, wrongDateOperations)
const wrongDateFindings = await validateCandidate(source, wrongDateCandidate, input, wrongDateOperations)
assert.ok(wrongDateFindings.some((finding) => /dat[ey] zawarcia umowy/i.test(finding)), 'wrong conclusion date is rejected')
assert.ok(wrongDateFindings.some((finding) => /dat[ey] wydarzenia/i.test(finding)), 'conclusion date substituted for wedding date is rejected')

const wrongMoneyOperations = operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.startsWith('Wartość:')
  ? { ...operation, finalText: 'Wartość: 11 401,00 zł; wpłata: 2 400,00 zł; pozostało: 9 000,00 zł.' }
  : operation)
const wrongMoneyCandidate = await applyBlockOperations(source, wrongMoneyOperations)
assert.ok((await validateCandidate(source, wrongMoneyCandidate, input, wrongMoneyOperations)).some((finding) => /kwoty wynagrodzenia/i.test(finding)), 'a numerically wrong financial amount is rejected')

const staleConclusionOperations = operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.includes('Umowę zawarto')
  ? { ...operation, finalText: 'Umowę zawarto 4 marca 2027 roku w Warszawie. Wesele odbędzie się 21 sierpnia 2027 roku.' }
  : operation)
const staleConclusionCandidate = await applyBlockOperations(source, staleConclusionOperations)
assert.ok((await validateCandidate(source, staleConclusionCandidate, input, staleConclusionOperations)).some((finding) => /dat[ey] zawarcia umowy/i.test(finding)), 'stale source conclusion date is rejected')

const packageBSource = await fixture('Pakiet Beta zapewnia reportaż fotograficzny.')
const packageBSetup = await setup(packageBSource)
assert.deepEqual(await validateCandidate(packageBSource, packageBSetup.candidate, packageBSetup.input, packageBSetup.operations), [], 'a different source package identity is preserved generically')
const packageBlock = packageBSetup.input.sourceDocument.blocks.find((block) => block.contentClass === 'package_service')!
const alteredPackageOperations = [...packageBSetup.operations, { blockId: packageBlock.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: 'Pakiet Gamma zastępuje źródłowy zakres.' }]
const alteredPackageCandidate = await applyBlockOperations(packageBSource, alteredPackageOperations)
assert.ok((await validateCandidate(packageBSource, alteredPackageCandidate, packageBSetup.input, alteredPackageOperations)).some((finding) => /pakietu różni się/i.test(finding)), 'an unauthorized package change is rejected')

const staleNumberCandidate = await applyBlockOperations(source, operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' && operation.finalText.includes('Studio |')
  ? { ...operation, finalText: 'Studio | CT-18-2027 | CT-24-2027 | strona 1 z 1' }
  : operation))
assert.ok((await validateCandidate(source, staleNumberCandidate, input, operations)).some((finding) => /stara wartość|nieautoryzowana zmiana/i.test(finding)), 'stale contract number in an updated footer is rejected against the approved target')

for (const [fieldXml, label] of [[pageField, 'PAGE'], [numPagesField, 'NUMPAGES']] as const) {
  const flattened = await modifyFooter(candidate, (xml) => xml.replace(fieldXml, '<w:r><w:t>1</w:t></w:r>'))
  const findings = await validateCandidate(source, flattened, input, operations)
  assert.ok(findings.some((finding) => finding.includes(label)), `${label} flattened to literal text is rejected`)
}

assert.ok((await validateCandidate(source, source, input, [])).some((finding) => /dat[ey] zawarcia umowy/i.test(finding)), 'source package cannot pass when its conclusion date remains stale')

const stalePartySource = await partyFixture()
const stalePartySetup = await setup(stalePartySource)
const partyBlocks = stalePartySetup.input.sourceDocument.blocks
const partyOperations: BlockOperation[] = [...stalePartySetup.operations]
const staleNameReplacement = new Map([['Lena Fikcyjna', 'Ada Test'], ['Oskar Umowny', 'Bar Test']])
const partyOccurrenceBlocks = partyBlocks.filter((item) => staleNameReplacement.has(item.text) && /Table [01], row/u.test(item.context))
for (const block of partyOccurrenceBlocks) {
  partyOperations.push({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: staleNameReplacement.get(block.text)! })
}
const stalePartyClean = await applyBlockOperations(stalePartySource, partyOperations)
assert.deepEqual(await validateCandidate(stalePartySource, stalePartyClean, stalePartySetup.input, partyOperations), [], 'replacing all source-defined client names passes while provider and third-party names remain unchanged')

const oneStaleClientOps = partyOperations.filter((operation) => {
  const sourceBlock = partyBlocks.find((block) => block.blockId === operation.blockId)
  return !(sourceBlock?.text === 'Lena Fikcyjna' && /Table 0, row 0/u.test(sourceBlock.context))
})
const oneStaleClientCandidate = await applyBlockOperations(stalePartySource, oneStaleClientOps)
const oneStaleClientFindings = await validateCandidate(stalePartySource, oneStaleClientCandidate, stalePartySetup.input, oneStaleClientOps)
assert.ok(oneStaleClientFindings.some((finding) => finding.includes('Lena Fikcyjna')), 'a new name elsewhere does not hide one stale client name in another party occurrence')
assert.ok(oneStaleClientFindings.every((finding) => !finding.includes('Oskar Umowny')), 'the other replaced client name does not trigger a false finding')

const staleSignatureOps = partyOperations.filter((operation) => {
  const sourceBlock = partyBlocks.find((block) => block.blockId === operation.blockId)
  return !/Table 1, row/u.test(sourceBlock?.context ?? '')
})
const staleSignatureCandidate = await applyBlockOperations(stalePartySource, staleSignatureOps)
const staleSignatureFindings = await validateCandidate(stalePartySource, staleSignatureCandidate, stalePartySetup.input, staleSignatureOps)
assert.ok(staleSignatureFindings.some((finding) => finding.includes('Lena Fikcyjna')), 'stale name in a signature occurrence fails')
assert.ok(staleSignatureFindings.some((finding) => finding.includes('Oskar Umowny')), 'stale second client name in a signature occurrence fails')

const bothStaleRemovedFindings = await validateCandidate(stalePartySource, stalePartyClean, stalePartySetup.input, partyOperations)
assert.deepEqual(bothStaleRemovedFindings, [], 'both stale source customer names removed from all occurrences pass')

const ownershipInput = structuredClone(stalePartySetup.input)
ownershipInput.wedding.groom.name = 'Lena Fikcyjna'
const ownershipOperations = partyOperations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT'
  ? { ...operation, finalText: operation.finalText.replaceAll('Bar Test', 'Lena Fikcyjna') }
  : operation)
const ownershipCandidate = await applyBlockOperations(stalePartySource, ownershipOperations)
const ownershipFindings = await validateCandidate(stalePartySource, ownershipCandidate, ownershipInput, ownershipOperations)
assert.ok(ownershipFindings.some((finding) => finding.includes('Lena Fikcyjna')), 'a replaced bride name is still stale if it appears as the new groom')
console.log('PASS contract-generation-spike source-driven candidate validation')
