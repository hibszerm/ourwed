import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { applyBlockOperations } from './blockDocxEditor'
import { runGeneration, makeInput, readSource, conclusionRule, KNOWN_OLD_VALUES, findInputConflicts, applyConflictOverrides, AUTHORITATIVE_FIELD_SEMANTICS, TRANSFORMATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS, classifyBlock, type ContractAi, type GenerationInput, type SourceBlock } from './generator'

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceBytes = await readFile(`${here}fixtures/source-video-standard.docx`)
const referenceBytes = await readFile(`${here}fixtures/work-generated-reference.docx`)
const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength)
const referenceBuffer = referenceBytes.buffer.slice(referenceBytes.byteOffset, referenceBytes.byteOffset + referenceBytes.byteLength)
const source = await readSource(sourceBuffer, 'source-video-standard.docx')
const wedding: GenerationInput['wedding'] = {
  bride: { name: 'Julia Kanicka', phone: '555666898', email: 'kanickaj7@wp.pl' },
  groom: { name: 'Maksymilian Ruth', phone: '675264927' },
  weddingDate: '20.09.2026', contractAddress: 'Juliusza Słowackiego 6/17, 41-800 Zabrze', contractValuePln: 14200, depositPln: 1000, remainingDueDate: '20.09.2026',
  locations: {
    groomPreparations: 'Wolności 110, 30-661 Kraków', bridePreparations: 'Marii Konopnickiej 6, 04-218 Kraków',
    ceremony: 'Zamek Królewski na Wawelu – Państwowe Zbiory Sztuki, Wawel 5, 31-001 Kraków',
    reception: 'Hotel Stary, Szczepańska 5, 31-011 Kraków',
  },
}
const input = makeInput({ generationDate: '15.09.2026', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: ['ujęcia VHS', 'ujęcia z drona'], userProvidedAnswers: [] })
assert.equal(input.financials.remainingPln, 13200)
assert.equal(input.conclusion.replaceDate, true)
assert.equal(input.conclusion.preservePlace, 'Zabrzu')
assert.deepEqual(conclusionRule([{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu .................... r. w ........................, zwana dalej umową' }], '15.09.2026'), { replaceDate: true, replacementDate: '15.09.2026' })
const writtenMonthOpening = [{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu 15 lutego 2027 r. w Warszawie, zwana dalej umową' }] as SourceBlock[]
assert.deepEqual(conclusionRule(writtenMonthOpening, '10.02.2027'), { replaceDate: true, replacementDate: '10.02.2027', preservePlace: 'Warszawie' }, 'a written Polish conclusion date is replaced with generation date while preserving place')
const laterWeddingFacts = { ...wedding, weddingDate: '18.07.2027', remainingDueDate: '11.07.2027' }
assert.deepEqual(findInputConflicts(makeInput({ generationDate: '10.02.2027', sourceDocument: { fileName: 'test.docx', blocks: writtenMonthOpening }, wedding: laterWeddingFacts, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })), [], 'a conclusion date differing from the wedding date does not conflict')
const conclusionMatchesWedding = [{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu 18.07.2027 r. w Warszawie, zwana dalej umową o uroczystości, która odbędzie się 18.07.2027' }] as SourceBlock[]
assert.deepEqual(conclusionRule(conclusionMatchesWedding, '10.02.2027'), { replaceDate: true, replacementDate: '10.02.2027', preservePlace: 'Warszawie' }, 'a source conclusion date remains a conclusion date even when it matches the wedding date')
assert.deepEqual(findInputConflicts(makeInput({ generationDate: '10.02.2027', sourceDocument: { fileName: 'test.docx', blocks: conclusionMatchesWedding }, wedding: laterWeddingFacts, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })), [], 'conclusion and wedding dates remain independent')
assert.deepEqual(conclusionRule(writtenMonthOpening, ''), { replaceDate: false, preservePlace: 'Warszawie' }, 'without a generation date the source date is not targeted for replacement')
assert.deepEqual(findInputConflicts(input), [], 'realistic dates allow generation to proceed')
const conflictingInput = makeInput({ generationDate: '27.09.2026', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: input.extras, userProvidedAnswers: [] })
assert.equal(findInputConflicts(conflictingInput)[0]?.id, 'remaining-payment-before-conclusion')
assert.ok(findInputConflicts(conflictingInput).some((conflict) => conflict.id === 'wedding-before-conclusion'))
const overridden = applyConflictOverrides(conflictingInput, [
  { id: 'remaining-payment-before-conclusion', value: '20.09.2026' },
  { id: 'wedding-before-conclusion', value: '15.09.2026' },
])
assert.equal(overridden.wedding.remainingDueDate, '20.09.2026')
assert.equal(overridden.generationDate, '15.09.2026')
assert.deepEqual(findInputConflicts(overridden), [], 'manual override replaces conflicting due date')

const legalSource = '1.Para młoda oświadcza, iż wyraża zgodę na przetwarzanie jej danych osobowych.'
const prohibitedLegalRewrite = '1.Osoby tworzące Parę Młodą oświadczają, iż wyrażają zgodę na przetwarzanie swoich danych osobowych.'
assert.equal(classifyBlock(legalSource), 'protected_legal_static')
assert.ok(source.blocks.some((block) => block.contentClass === 'protected_legal_static'))
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not paraphrase legal clauses/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /duplicated token, typo, missing space/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /tel\. 668 698 892, tel\. zwanego dalej.*may become.*tel\. 668 698 892, zwanego dalej/)
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not rewrite the full identification clause/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Input conflicts must be stopped before transformation/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /complete final paragraph text/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /return no operation for a protected block/i)
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /wedding\.contractAddress.*authoritative contract\/residential address.*same entity/i, 'the CRM contract address maps to equivalent source wording for its owning entity')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /not by exact label matching/i, 'semantic equivalence is independent of the source label')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /not a universal address for every person/i, 'one party address cannot satisfy another party')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /userProvidedAnswers as authoritative.*each answer id.*entity\/path scope/i, 'answer IDs preserve value ownership')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /Distinct entities require their own authoritative address values/i, 'distinct clients require distinct owned values')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /only when the authoritative input explicitly identifies it as shared/i, 'shared residence must be explicit')
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /check all structured authoritative fields, userProvidedAnswers, and applicable generation rules.*only when that concept has no authoritative value/i, 'missing input is reported only after all authoritative sources are checked')
assert.doesNotMatch(AUTHORITATIVE_FIELD_SEMANTICS, /Anna|Piotr|bride|groom|case.?02/i, 'shared semantics contain no person- or template-specific rules')
assert.ok(TRANSFORMATION_INSTRUCTIONS.startsWith(AUTHORITATIVE_FIELD_SEMANTICS), 'the planner receives the shared field semantics')
assert.match(REVIEW_INSTRUCTIONS, /allowed minimal, unambiguous editorial/i)
assert.match(REVIEW_INSTRUCTIONS, /unauthorized substantive legal rewrite/i)
assert.match(REVIEW_INSTRUCTIONS, /source contract defines which factual concepts belong/i)
assert.match(REVIEW_INSTRUCTIONS, /source-required and input value available: candidate must preserve the concept with the authoritative updated value/i, 'source concepts with available replacements remain required in the candidate')
assert.match(REVIEW_INSTRUCTIONS, /source-required but authoritative input value missing: generation should stop with MISSING_INPUT/i, 'required source concepts without replacement data remain missing input')
assert.match(REVIEW_INSTRUCTIONS, /authoritative input value available but concept unused by the source: omission is allowed and is not MISSING_INPUT or a review failure/i, 'unused CRM facts neither require insertion nor cause a false failure')
assert.match(REVIEW_INSTRUCTIONS, /do not require every available CRM\/input fact to appear/i)
assert.match(REVIEW_INSTRUCTIONS, /do not add an input fact when the source has no corresponding concept/i)
assert.notEqual(legalSource, prohibitedLegalRewrite, 'the prohibited legal rewrite is detectably different')
const consentSourceBlock = source.blocks.find((block) => block.text.includes('wyraża zgodę na przetwarzanie'))!
const noOpCandidate = await applyBlockOperations(sourceBuffer, [])
const consentNoOpCandidate = await readSource(noOpCandidate, source.fileName)
assert.equal(consentNoOpCandidate.blocks.find((block) => block.blockId === consentSourceBlock.blockId)?.text, consentSourceBlock.text, 'protected consent wording remains unchanged when no factual update requires an edit')

let transformCalls = 0
let reviewCalls = 0
const missingAi: ContractAi = {
  async plan() { transformCalls++; return { missingInputs: [{ id: 'template-value-1', label: 'PESEL Julii Kanickiej', explanation: 'Umowa wymaga numeru PESEL Julii Kanickiej.', inputType: 'text', required: true, sourceContext: 'Identyfikacja Strony' }] } },
  async review() { reviewCalls++; return { status: 'PASS' } },
  async repair() { throw new Error('repair must not run') },
}
const missing = await runGeneration(sourceBuffer, input, missingAi)
assert.equal(missing.status, 'MISSING_INPUT')
assert.equal(transformCalls, 1)
assert.equal(reviewCalls, 0)
if (missing.status === 'MISSING_INPUT') assert.equal(missing.missingInputs[0]?.label, 'PESEL Julii Kanickiej')

let conflictPlanCalls = 0
const conflictAi: ContractAi = {
  async plan() { conflictPlanCalls++; return { missingInputs: [], blockOperations: [] } },
  async review() { return { status: 'PASS' } },
  async repair() { throw new Error('repair must not run') },
}
const conflictResult = await runGeneration(sourceBuffer, conflictingInput, conflictAi)
assert.equal(conflictResult.status, 'CONFLICT_INPUT')
assert.equal(conflictPlanCalls, 0, 'conflicts stop before provider planning')
await runGeneration(sourceBuffer, overridden, conflictAi)
assert.equal(conflictPlanCalls, 1, 'manual override clears the conflict and resumes generation planning')

const supplied = makeInput({ generationDate: input.generationDate, sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: input.extras, userProvidedAnswers: [{ id: 'template-value-1', value: '90010112345' }] })
assert.equal(supplied.userProvidedAnswers[0]?.value, '90010112345', 'user answer enters the next authoritative generation input')
let answeredReviewCalls = 0
const answeredAi: ContractAi = {
  async plan(nextInput) { assert.equal(nextInput.userProvidedAnswers[0]?.value, '90010112345'); return { missingInputs: [], blockOperations: [] } },
  async review() { answeredReviewCalls++; return { status: 'PASS' } },
  async repair() { throw new Error('repair must not run') },
}
const resumed = await runGeneration(sourceBuffer, supplied, answeredAi)
assert.equal(resumed.status, 'FAILED', 'answered attempt proceeds past missing-input planning and reaches final safety checks')
assert.equal(answeredReviewCalls, 1)

const reference = await readSource(referenceBuffer, 'work-generated-reference.docx')
const refText = reference.blocks.map((b) => b.text).join('\n')
assert.match(refText, /Zawarta w dniu \.{3,} r\. w \.{3,}/)
assert.match(refText, /wydarzeń odbywających się w dniu 20\.09\.2026/)
assert.match(refText, /14 200 zł/)
assert.match(refText, /13 200 zł/)
assert.match(refText, /ujęć VHS oraz ujęć z drona/)
assert.match(refText, /Video Standard/)

const noPlace = conclusionRule([{ part: 'word/document.xml', index: 0, text: 'Zawarta w dniu 22.09.2026 r., zwana dalej umową' }], '25.09.2026')
assert.deepEqual(noPlace, { replaceDate: true, replacementDate: '25.09.2026' }, 'absence of source conclusion place does not authorize city insertion')
assert.ok(KNOWN_OLD_VALUES.every((value) => source.blocks.some((b: SourceBlock) => b.text.includes(value))), 'old-data guard fixture values come from actual source')
console.log('PASS contract-generation-spike offline acceptance (fixture preparation, missing input, supplied answer, dates, place rule, finance, extras, package)')
