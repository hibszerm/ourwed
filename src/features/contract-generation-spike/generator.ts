import JSZip from 'jszip'
import { applyBlockOperations, remapOperationsToCurrentBlocks, type BlockOperation, type EditableBlock } from './blockDocxEditor'
import { unescapeXml } from '@/features/documents/template/canonicalParagraph'

export type MissingInput = { id: string; label: string; explanation: string; inputType: 'text' | 'date' | 'number'; required: true; sourceContext: string }
export type SourceBlock = EditableBlock & { contentClass: 'factual_dynamic' | 'package_service' | 'protected_legal_static' }
export type WeddingFacts = {
  bride: { name: string; phone: string; email: string }
  groom: { name: string; phone: string }
  weddingDate: string
  contractAddress: string
  contractValuePln: number
  depositPln: number
  remainingDueDate: string
  locations: { bridePreparations: string; groomPreparations: string; ceremony: string; reception: string }
}
export type GenerationInput = {
  generationDate: string
  conclusion: { replaceDate: boolean; sourceDate?: string; sourceBlockId?: string; replacementDate?: string; preservePlace?: string }
  sourceDocument: { fileName: string; blocks: SourceBlock[] }
  wedding: WeddingFacts
  packagePolicy: { preserveSourcePackageExactly: true }
  extras: string[]
  financials: { contractValuePln: number; depositPln: number; remainingPln: number }
  userProvidedAnswers: Array<{ id: string; value: string }>
}
export type EditPlan = { operations: BlockOperation[] }
export type ReviewResult = { status: 'PASS' } | { status: 'FAIL'; issues: string[] }
export type ConflictInput = { id: string; field: string; label: string; explanation: string; inputType: 'date' | 'text' | 'number'; currentValue?: string; relatedValues?: Array<{ label: string; value: string }>; required: true }
export type ConflictOverride = { id: string; value: string }
export type GenerationResult = { status: 'MISSING_INPUT'; missingInputs: MissingInput[] } | { status: 'CONFLICT_INPUT'; conflicts: ConflictInput[] } | { status: 'FAILED'; issues: string[] } | { status: 'COMPLETED'; docxBytes: ArrayBuffer; review: ReviewResult }
export interface ContractAi {
  plan(input: GenerationInput): Promise<{ missingInputs: MissingInput[]; blockOperations?: BlockOperation[] }>
  review(args: { source: GenerationInput['sourceDocument']; input: GenerationInput; candidate: SourceBlock[] }): Promise<ReviewResult>
  repair(args: { input: GenerationInput; source: SourceBlock[]; candidate: SourceBlock[]; issues: string[] }): Promise<BlockOperation[]>
}

export const AUTHORITATIVE_FIELD_SEMANTICS = `Resolve authoritative values by semantic concept and owning entity, not by exact label matching. The structured wedding.contractAddress field is the authoritative contract/residential address for the CRM client entity associated with that contract record. It satisfies equivalent source wording for that same entity, including an address or a clause such as “zamieszkała przy” or “zamieszkały przy”. It is not a universal address for every person named in the contract and must not satisfy a different entity's address requirement. Treat userProvidedAnswers as authoritative too; use each answer id to respect its entity/path scope. Distinct entities require their own authoritative address values. One address may satisfy multiple entities only when the authoritative input explicitly identifies it as shared. Before returning MISSING_INPUT for a source-required concept, check all structured authoritative fields, userProvidedAnswers, and applicable generation rules; return MISSING_INPUT only when that concept has no authoritative value for the relevant entity.`

export const TRANSFORMATION_INSTRUCTIONS = `${AUTHORITATIVE_FIELD_SEMANTICS} Transform only the supplied source blocks and authoritative inputs. Preserve legal wording: do not paraphrase legal clauses or change their legal subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery terms. Make only mechanical factual updates explicitly required by authoritative facts (names, dates, amounts, locations, package references, selected extras, internal references, and required grammatical inflection). You may make an obvious, unambiguous, minimal local editorial correction such as a duplicated token, typo, missing space, or punctuation error only when legal meaning does not change. For example, “tel. 668 698 892, tel. zwanego dalej” may become “tel. 668 698 892, zwanego dalej”; do not rewrite the full identification clause. Input conflicts must be stopped before transformation. Return complete final paragraph text for changed blocks. Leave unrelated protected legal/static blocks unchanged; return no operation for a protected block unless an explicit authoritative fact mechanically requires a change. Each source block includes a contentClass: factual_dynamic, package_service, or protected_legal_static. Preserve the Video Standard package exactly when required by packagePolicy. Follow structured input.conclusion deterministically: sourceDate/sourceBlockId identify the source conclusion, and when replaceDate is true, replacementDate is the required conclusion date for that block. Preserve preservePlace using the source's natural grammatical form. Keep this distinct from wedding.weddingDate; do not substitute the wedding/event date for the conclusion date. When replaceDate is false, do not introduce a conclusion date merely because generationDate is present.`

export const REVIEW_INSTRUCTIONS = `Review source and candidate blocks, including each source block's contentClass (factual_dynamic, package_service, or protected_legal_static). The source contract defines which factual concepts belong in the contract; authoritative input supplies the new value only for a concept the source contains or requires. Do not require every available CRM/input fact to appear in the candidate, and do not add an input fact when the source has no corresponding concept; doing so may be semantic drift. For each factual concept, distinguish: (A) source-required and input value available: candidate must preserve the concept with the authoritative updated value; (B) source-required but authoritative input value missing: generation should stop with MISSING_INPUT; (C) authoritative input value available but concept unused by the source: omission is allowed and is not MISSING_INPUT or a review failure. Use the source-vs-candidate context to decide whether the source contains or requires the concept; do not infer that requirement from CRM/input availability alone. Classify differences as: (D) substantive legal rewrite, which fails if a protected legal clause changes subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery without an explicit authoritative mechanical reason; (E) allowed mechanical factual adaptation; (F) allowed minimal, unambiguous editorial typo/token/spacing/punctuation fix that does not change legal meaning; or (G) unchanged source issue, which is not introduced by the transformation. Do not fail merely because a harmless editorial error was corrected. Do fail on an unauthorized substantive legal rewrite.`

export function classifyBlock(text: string): SourceBlock['contentClass'] {
  if (/Video Standard|teledysk|film ślubny|ujęcia|pakiet/i.test(text)) return 'package_service'
  if (/zgod[ęa]|oświadcza|zobowiązan|prawo|odpowiedzialnoś|rozwiązani|zadatek|copyright|autorsk|publik|przetwarzani|danych osobow|Umow.{0,24}wymagaj|nie podlegaj|wyraża zgody/i.test(text)) return 'protected_legal_static'
  return 'factual_dynamic'
}

const polishMonths: Record<string, number> = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
}

function validDateTimestamp(day: number, month: number, year: number): number | undefined {
  const fullYear = year < 100 ? 2000 + year : year
  const timestamp = Date.UTC(fullYear, month - 1, day)
  const date = new Date(timestamp)
  return date.getUTCFullYear() === fullYear && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : undefined
}

export function parsePolishDate(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (match) return validDateTimestamp(Number(match[1]), Number(match[2]), Number(match[3]))
  const written = value.trim().match(/^(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(\d{4})(?:\s+roku)?$/i)
  if (!written) return undefined
  const month = polishMonths[written[2]!.toLocaleLowerCase('pl-PL')]
  return month ? validDateTimestamp(Number(written[1]), month, Number(written[3])) : undefined
}

const polishDateOccurrences = /(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}(?:\s+roku)?)/gi

export function dateTimestampsInText(text: string): number[] {
  return [...text.matchAll(polishDateOccurrences)].flatMap((match) => {
    const timestamp = parsePolishDate(match[0])
    return timestamp === undefined ? [] : [timestamp]
  })
}

export function hasSemanticDate(text: string, authoritativeDate: string): boolean {
  const expected = parsePolishDate(authoritativeDate)
  return expected !== undefined && dateTimestampsInText(text).includes(expected)
}

const conclusionDateToken = /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}\b|\.{3,})/i
const conclusionVerb = /\bzawar(?:ta|ty|te|to)\b/i

function firstSentenceAfter(text: string, offset: number): string {
  const rest = text.slice(offset)
  const boundary = /[.!?](?=\s|$)/.exec(rest)
  return boundary ? rest.slice(0, boundary.index) : rest
}

function conclusionDateInText(text: string): { raw: string; timestamp?: number } | undefined {
  const verb = conclusionVerb.exec(text)
  if (!verb) return undefined
  const sentence = firstSentenceAfter(text, verb.index + verb[0].length)
  const match = conclusionDateToken.exec(sentence)
  if (!match) return undefined
  return { raw: match[0], timestamp: parsePolishDate(match[0]) }
}

function conclusionDateTimestampsInText(text: string): number[] {
  const verb = conclusionVerb.exec(text)
  if (!verb) return []
  const sentence = firstSentenceAfter(text, verb.index + verb[0].length)
  const pattern = new RegExp(conclusionDateToken.source, 'gi')
  return [...sentence.matchAll(pattern)].flatMap((match) => {
    const timestamp = parsePolishDate(match[0])
    return timestamp === undefined ? [] : [timestamp]
  })
}

function numericDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`
}

function conclusionPlaceInText(text: string): string | undefined {
  const match = text.match(/(?:\br\.|\b\d{4}\s+(?:r\.|roku))\s+w\s+(.+?)(?=,?\s+(?:zwana|zwany|zwane|pomiędzy|między)\b|[,;.!?]|$)/i)
  const place = match?.[1]?.trim()
  return place && /[\p{L}]/u.test(place) && !/\.{3,}/.test(place) ? place : undefined
}

export function validatePlannedConclusion(input: GenerationInput, operations: BlockOperation[]): string[] {
  const rule = input.conclusion
  if (!rule.sourceBlockId) return []
  const sourceBlock = input.sourceDocument.blocks.find((block) => block.blockId === rule.sourceBlockId)
  if (!sourceBlock) return [`Conclusion-date plan validation failed: source conclusion block ${rule.sourceBlockId} is unavailable.`]
  const operation = operations.find((item) => 'blockId' in item && item.blockId === rule.sourceBlockId)
  const plannedText = operation?.operation === 'REPLACE_BLOCK_TEXT' ? operation.finalText : operation ? '' : sourceBlock.text
  const sourceDate = conclusionDateInText(sourceBlock.text)
  const plannedDate = conclusionDateInText(plannedText)

  if (rule.replaceDate) {
    const targetTimestamp = rule.replacementDate ? parsePolishDate(rule.replacementDate) : undefined
    if (targetTimestamp === undefined) return ['Conclusion-date plan validation failed: replacementDate is missing or invalid.']
    if (plannedDate?.timestamp !== targetTimestamp) {
      const actual = plannedDate?.raw ?? 'no conclusion date'
      const oldDate = sourceDate?.timestamp !== undefined && sourceDate.timestamp !== targetTimestamp && plannedDate?.timestamp === sourceDate.timestamp
        ? ` Source conclusion date ${rule.sourceDate ?? sourceDate.raw} remains unchanged.`
        : ''
      return [`Conclusion-date plan validation failed: block ${rule.sourceBlockId} must use authoritative conclusion date ${numericDate(targetTimestamp)}; planned ${actual}.${oldDate} Wedding/event date ${input.wedding.weddingDate} is a separate fact.`]
    }
    const sourceTimestamp = sourceDate?.timestamp
    if (sourceTimestamp !== undefined && sourceTimestamp !== targetTimestamp && conclusionDateTimestampsInText(plannedText).includes(sourceTimestamp)) {
      return [`Conclusion-date plan validation failed: original source conclusion date ${rule.sourceDate ?? sourceDate?.raw ?? 'unknown'} remains in block ${rule.sourceBlockId} alongside the target date.`]
    }
    if (rule.preservePlace && !plannedText.normalize('NFC').includes(rule.preservePlace.normalize('NFC'))) {
      return [`Conclusion-date plan validation failed: source conclusion place “${rule.preservePlace}” is not preserved in block ${rule.sourceBlockId}.`]
    }
  } else if (!sourceDate && plannedDate) {
    return [`Conclusion-date plan validation failed: block ${rule.sourceBlockId} introduces conclusion date ${plannedDate.raw} although the source has no conclusion date.`]
  }
  return []
}

export function findInputConflicts(input: GenerationInput): ConflictInput[] {
  const conclusionDate = input.conclusion.replacementDate ?? input.generationDate
  const conclusionTimestamp = parsePolishDate(conclusionDate)
  const paymentTimestamp = parsePolishDate(input.wedding.remainingDueDate)
  const weddingTimestamp = parsePolishDate(input.wedding.weddingDate)
  if (conclusionTimestamp === undefined) return []
  const conflicts: ConflictInput[] = []
  if (paymentTimestamp !== undefined && paymentTimestamp < conclusionTimestamp) conflicts.push({
    id: 'remaining-payment-before-conclusion',
    field: 'wedding.remainingDueDate',
    label: 'Termin płatności pozostałej kwoty',
    explanation: 'Termin pozostałej płatności przypada przed datą zawarcia umowy. Podaj ręcznie poprawną datę albo skoryguj datę zawarcia umowy.',
    inputType: 'date',
    currentValue: input.wedding.remainingDueDate,
    relatedValues: [{ label: 'Data zawarcia umowy', value: conclusionDate }],
    required: true,
  })
  const sourceUsesFutureEventWording = input.sourceDocument.blocks.some((block) => /(?:które|która) odbęd(?:ą|zie) się/i.test(block.text))
  if (weddingTimestamp !== undefined && weddingTimestamp < conclusionTimestamp && sourceUsesFutureEventWording) conflicts.push({
    id: 'wedding-before-conclusion',
    field: 'generationDate',
    label: 'Data zawarcia umowy względem wydarzenia',
    explanation: 'Umowa jest datowana po wydarzeniu, które źródłowa umowa opisuje jako przyszłe. Podaj ręcznie poprawną datę zawarcia umowy albo datę wydarzenia.',
    inputType: 'date',
    currentValue: conclusionDate,
    relatedValues: [{ label: 'Data ślubu', value: input.wedding.weddingDate }],
    required: true,
  })
  return conflicts
}

export function applyConflictOverrides(input: GenerationInput, overrides: ConflictOverride[]): GenerationInput {
  let next = input
  for (const override of overrides) {
    if (override.id === 'remaining-payment-before-conclusion') {
      next = { ...next, wedding: { ...next.wedding, remainingDueDate: override.value } }
    }
    if (override.id === 'wedding-before-conclusion') {
      next = { ...next, generationDate: override.value, conclusion: { ...next.conclusion, replacementDate: next.conclusion.replaceDate ? override.value : next.conclusion.replacementDate } }
    }
  }
  return next
}

export function formatPlnInteger(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('PLN amount must be a non-negative safe integer')
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`
}

export function moneyAmountsInGrosz(text: string): number[] {
  const amounts: number[] = []
  const pattern = /(?<![\p{L}\p{N}])((?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.]\d{2})?)\s*zł(?![\p{L}\p{N}])/giu
  for (const match of text.matchAll(pattern)) {
    const value = match[1]!.replace(/[\s\u00a0\u202f]/g, '')
    const [whole, fractional = '00'] = value.split(/[,.]/)
    const integer = Number(whole)
    const cents = Number(fractional)
    if (Number.isSafeInteger(integer) && Number.isInteger(cents)) amounts.push(integer * 100 + cents)
  }
  return amounts
}

export function hasMoneyAmount(text: string, authoritativePln: number): boolean {
  return Number.isSafeInteger(authoritativePln) && authoritativePln >= 0 && moneyAmountsInGrosz(text).includes(authoritativePln * 100)
}

export function normalizeAuthoritativePlnText(text: string, amounts: number[]): string {
  const authoritative = new Set(amounts)
  return text.replace(/(^|[^\p{L}\p{N}])(\d[\d\s\u00a0\u202f]*)\s*zł(?![\p{L}\p{N}])/giu, (token, boundary: string, digits: string) => {
    const amount = Number(digits.replace(/[\s\u00a0\u202f]/g, ''))
    return authoritative.has(amount) ? `${boundary}${formatPlnInteger(amount)}` : token
  })
}

export function normalizeAuthoritativeFinancialBlocks<T extends { text: string }>(blocks: T[], amounts: number[]): Array<{ block: T; text: string }> {
  const uniqueAmounts = [...new Set(amounts)]
  return blocks.flatMap((block) => {
    const text = normalizeAuthoritativePlnText(block.text, uniqueAmounts)
    return text === block.text ? [] : [{ block, text }]
  })
}

export function comparePhoneDigits(authoritative: string, candidate: string): boolean {
  const normalized = (value: string) => value.replace(/[\s()\-]/g, '')
  return normalized(authoritative) === normalized(candidate)
}

export function hasExactFact(candidateText: string, authoritativeValue: string): boolean {
  return normalize(candidateText).includes(normalize(authoritativeValue))
}

export function hasPolishNameFacts(candidateText: string, authoritativeName: string): boolean {
  if (hasExactFact(candidateText, authoritativeName)) return true
  const words = (value: string) => value.normalize('NFC').toLocaleLowerCase('pl-PL').match(/[\p{L}]+/gu) ?? []
  const expectedWords = words(authoritativeName)
  const candidateWords = words(candidateText)
  return expectedWords.length > 0 && expectedWords.every((expected) => {
    const prefixLength = expected.length <= 4 ? expected.length : Math.max(4, expected.length - 2)
    const prefix = expected.slice(0, prefixLength)
    return candidateWords.some((candidate) => candidate.startsWith(prefix) && Math.abs(candidate.length - expected.length) <= 3)
  })
}

export function hasNaturalLocationFacts(candidateText: string, authoritativeLocation: string): boolean {
  const postalCode = authoritativeLocation.match(/\b\d{2}-\d{3}\b/)?.[0]
  if (!postalCode || !candidateText.includes(postalCode)) return false
  const beforePostal = authoritativeLocation.slice(0, authoritativeLocation.indexOf(postalCode))
  const streetNumber = [...beforePostal.matchAll(/\b\d+(?:\/\d+)?\b/g)].at(-1)?.[0]
  if (!streetNumber) return false
  const escapedPostal = postalCode.replace('-', '\\-')
  const escapedNumber = streetNumber.replace('/', '\\/')
  const addressPattern = new RegExp(`\\b${escapedNumber}\\b.{0,120}\\b${escapedPostal}\\b`)
  const addressMatch = addressPattern.exec(candidateText)
  if (!addressMatch) return false
  const streetName = authoritativeLocation.match(/\bul\.?\s+(.+?)\s+\d+(?:\/\d+)?/i)?.[1]
  const start = Math.max(0, addressMatch.index - 100)
  return !streetName || hasPolishNameFacts(candidateText.slice(start, addressMatch.index + addressMatch[0].length), streetName)
}

export function findStaleValues(candidateText: string, staleValues: string[]): string[] {
  const flat = normalize(candidateText)
  return staleValues.filter((value) => flat.includes(normalize(value)))
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<GenerationInput['sourceDocument']> {
  const blocks = await (await import('./blockDocxEditor')).buildBlockIndex(bytes)
  return { fileName, blocks: blocks.map((block) => ({ ...block, contentClass: classifyBlock(block.text) })) }
}

export function makeInput(args: Omit<GenerationInput, 'financials' | 'conclusion'>): GenerationInput {
  const remainingPln = args.wedding.contractValuePln - args.wedding.depositPln
  if (remainingPln < 0) throw new Error('Deposit exceeds contract value')
  return { ...args, conclusion: conclusionRule(args.sourceDocument.blocks, args.generationDate), financials: { contractValuePln: args.wedding.contractValuePln, depositPln: args.wedding.depositPln, remainingPln } }
}

export function conclusionRule(sourceBlocks: SourceBlock[], generationDate: string): GenerationInput['conclusion'] {
  const openingBlock = sourceBlocks.find((block) => conclusionVerb.test(block.text))
  const opening = openingBlock?.text ?? ''
  const sourceDateMatch = conclusionDateInText(opening)
  const hasDate = Boolean(generationDate.trim()) && Boolean(sourceDateMatch)
  return {
    replaceDate: hasDate,
    ...(sourceDateMatch?.timestamp !== undefined ? { sourceDate: numericDate(sourceDateMatch.timestamp) } : {}),
    ...(openingBlock?.blockId ? { sourceBlockId: openingBlock.blockId } : {}),
    ...(hasDate ? { replacementDate: generationDate } : {}),
    ...(conclusionPlaceInText(opening) ? { preservePlace: conclusionPlaceInText(opening) } : {}),
  }
}

function candidateText(blocks: SourceBlock[]): string { return blocks.map((b) => b.text).join('\n') }
function normalize(text: string): string { return text.normalize('NFC').replace(/\s+/g, ' ').trim() }

export async function runGeneration(sourceBytes: ArrayBuffer, input: GenerationInput, ai: ContractAi): Promise<GenerationResult> {
  const conflicts = findInputConflicts(input)
  if (conflicts.length) return { status: 'CONFLICT_INPUT', conflicts }
  const planned = await ai.plan(input)
  if (planned.missingInputs.some((x) => x.required)) return { status: 'MISSING_INPUT', missingInputs: planned.missingInputs }
  if (!planned.blockOperations) return { status: 'FAILED', issues: ['Plan nie zawiera operacji blokowych'] }
  const conclusionPlanIssues = validatePlannedConclusion(input, planned.blockOperations)
  if (conclusionPlanIssues.length) return { status: 'FAILED', issues: conclusionPlanIssues }
  const authoritativeAmounts = [input.financials.contractValuePln, input.financials.depositPln, input.financials.remainingPln]
  const normalizedOperations = planned.blockOperations.map((operation) => 'finalText' in operation
    ? { ...operation, finalText: normalizeAuthoritativePlnText(operation.finalText, authoritativeAmounts) }
    : operation)
  const plannedBlockIds = new Set(normalizedOperations.flatMap((operation) => 'blockId' in operation ? [operation.blockId] : []))
  const financialBlockOperations: BlockOperation[] = normalizeAuthoritativeFinancialBlocks(input.sourceDocument.blocks, authoritativeAmounts)
    .filter(({ block }) => !plannedBlockIds.has(block.blockId))
    .map(({ block, text }) => ({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: text }))
  const completeOperations = [...normalizedOperations, ...financialBlockOperations]
  let validationOperations = completeOperations
  let candidateBytes = await applyBlockOperations(sourceBytes, completeOperations)
  let blocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
  let review = await ai.review({ source: input.sourceDocument, input, candidate: blocks })
  if (review.status === 'FAIL') {
    const repair = await ai.repair({ input, source: input.sourceDocument.blocks, candidate: blocks, issues: review.issues })
    const implicated = new Set(review.issues.flatMap((issue) => input.sourceDocument.blocks.filter((block) => issue.includes(block.blockId)).map((block) => block.blockId)))
    if (repair.some((operation) => !implicated.has('blockId' in operation ? operation.blockId : operation.anchorBlockId))) return { status: 'FAILED', issues: ['Naprawa wskazała bloki spoza ustaleń recenzji'] }
    const remappedRepair = remapOperationsToCurrentBlocks(repair, input.sourceDocument.blocks, blocks, completeOperations)
    candidateBytes = await applyBlockOperations(candidateBytes, remappedRepair)
    validationOperations = [...validationOperations, ...remappedRepair]
    blocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
    review = await ai.review({ source: input.sourceDocument, input, candidate: blocks })
  }
  if (review.status === 'FAIL') return { status: 'FAILED', issues: review.issues }
  const safety = await validateCandidate(sourceBytes, candidateBytes, input, validationOperations)
  return safety.length ? { status: 'FAILED', issues: safety } : { status: 'COMPLETED', docxBytes: candidateBytes, review }
}

function xmlWithTextValuesMasked(xml: string): string {
  return xml.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, '$1__TEXT__$2')
}

function wordFieldInstructions(xml: string): string[] {
  const instructions = [
    ...[...xml.matchAll(/<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/g)].map((match) => unescapeXml(match[1]!).trim().replace(/\s+/g, ' ').toUpperCase()),
    ...[...xml.matchAll(/<w:fldSimple\b[^>]*\bw:instr\s*=\s*["']([^"']*)["']/g)].map((match) => unescapeXml(match[1]!).trim().replace(/\s+/g, ' ').toUpperCase()),
  ]
  return instructions
}

const eventCue = /\b(?:uroczysto\p{L}*|ślub\p{L}*|wesel\p{L}*|wydarzeni\p{L}*)\b/iu

function datesFollowingEventCue(text: string): number[] {
  const cue = eventCue.exec(text)
  return cue ? dateTimestampsInText(text.slice(cue.index + cue[0].length)) : []
}

function sourceEventBlocks(blocks: SourceBlock[]): SourceBlock[] {
  return blocks.filter((block) => datesFollowingEventCue(block.text).length > 0)
}

function sourceContainsPartyPhone(blocks: SourceBlock[], person: 'bride' | 'groom'): boolean {
  const rolePattern = person === 'bride'
    ? /\b(?:zleceniodawczyni|klientka|panna młoda|par\p{L}*\s+młod\p{L}*)\b/iu
    : /\b(?:zleceniodawca|klient\b|pan młody|par\p{L}*\s+młod\p{L}*)\b/iu
  const phonePattern = /(?:\+?\d[\d\s()-]{6,}\d)/u
  if (blocks.some((block) => rolePattern.test(`${block.text} ${block.context}`) && /\b(?:tel\.?|telefon|phone)\b/i.test(`${block.text} ${block.context}`) && phonePattern.test(block.text))) return true

  const tableCell = (block: SourceBlock) => block.context.match(/Table (\d+), row (\d+), cell (\d+)/)
  const headerContactColumns = new Set<string>()
  for (const block of blocks) {
    const coordinates = tableCell(block)
    if (coordinates?.[2] === '0' && /\b(?:kontakt|contact)\b/i.test(block.text)) headerContactColumns.add(`${coordinates[1]}:${coordinates[3]}`)
  }
  const rows = new Map<string, SourceBlock[]>()
  for (const block of blocks) {
    const coordinates = tableCell(block)
    if (!coordinates) continue
    const key = `${coordinates[1]}:${coordinates[2]}`
    rows.set(key, [...(rows.get(key) ?? []), block])
  }
  return [...rows.values()].some((row) => {
    if (!row.some((block) => rolePattern.test(block.text))) return false
    return row.some((block) => {
      const coordinates = tableCell(block)
      return !!coordinates && headerContactColumns.has(`${coordinates[1]}:${coordinates[3]}`) && phonePattern.test(block.text)
    })
  })
}

function sourcePackageDefinitionBlocks(blocks: SourceBlock[]): SourceBlock[] {
  const packageAnchor = /\bpak(?:iet(?:u|em)?|iecie)\s+[\p{L}\d-]+/iu
  const packageScope = /\b(?:obejmuje|obejmują|obejmującej|zapewnia|składa się|zakres(?:ie)?)\b|:\s*$/iu
  const serviceDetail = /(?:fotograf|zdję|fotografii|galeri|odbit|teledysk|film ślubny|album|godzin|minut|ujęć|wydruk)/iu
  const financialText = /\b(?:wynagrodzen|kwot[ay]|zapłac|wpłat|płatn|zł|pln)\b/iu
  const selected = new Set<string>()
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!
    if (!packageAnchor.test(block.text) || !packageScope.test(block.text) || !serviceDetail.test(block.text) || financialText.test(block.text)) continue
    selected.add(block.blockId)
    for (let next = index + 1; next < blocks.length; next++) {
      const item = blocks[next]!
      if (!/^\s*\d+[.)]\s+/.test(item.text)) break
      if (serviceDetail.test(item.text) && !financialText.test(item.text)) selected.add(item.blockId)
    }
  }
  return blocks.filter((block) => selected.has(block.blockId))
}

function tableCellCoordinates(block: EditableBlock): string | undefined {
  const match = block.context.match(/Table (\d+), row (\d+), cell (\d+)/)
  return match ? `${match[1]}:${match[2]}:${match[3]}` : undefined
}

function approvedReplacementMatchesCandidate(
  operation: Extract<BlockOperation, { operation: 'REPLACE_BLOCK_TEXT' }>,
  sourceBlocks: SourceBlock[],
  candidateBlocks: SourceBlock[],
): boolean {
  const sourceBlock = sourceBlocks.find((block) => block.blockId === operation.blockId)
  if (!sourceBlock) return false
  const expected = normalize(operation.finalText)
  if (candidateBlocks.some((block) => block.blockId === operation.blockId && normalize(block.text) === expected)) return true
  const coordinates = tableCellCoordinates(sourceBlock)
  return !!coordinates && candidateBlocks.some((block) => block.part === sourceBlock.part && tableCellCoordinates(block) === coordinates && normalize(block.text) === expected)
}

const partyRoleLabel = /^(?:zleceniodawczyni|zleceniodawca|klientka|klient|zamawiająca|zamawiający)$/iu
const partyNamePair = /^\s*([\p{Lu}][\p{L}'’.-]*)\s+([\p{Lu}][\p{L}'’.-]*)/u
type PartyOwner = 'bride' | 'groom' | null
type SourceCustomerName = { name: string; owner: PartyOwner }

function customerOwner(label: string): PartyOwner {
  if (/zleceniodawczyn|klientk|zamawiająca/iu.test(label)) return 'bride'
  if (/zleceniodawca|zamawiający/iu.test(label)) return 'groom'
  return null
}

function partyNameFingerprint(value: string): string[] {
  return value.normalize('NFC').toLocaleLowerCase('pl-PL').match(/[\p{L}]+/gu)?.map((word) => word.replace(/ą$/u, '')) ?? []
}

function partyNamesMatch(text: string, name: string): boolean {
  const expected = partyNameFingerprint(name)
  const words = text.normalize('NFC').toLocaleLowerCase('pl-PL').match(/[\p{L}]+/gu) ?? []
  if (expected.length < 2) return false
  return words.some((_, index) => expected.every((part, offset) => {
    const candidate = words[index + offset]
    return !!candidate && candidate.startsWith(part) && candidate.length - part.length <= 2
  }))
}

function firstNamePair(value: string): string | undefined {
  const match = partyNamePair.exec(value)
  return match ? `${match[1]} ${match[2]}` : undefined
}

function customerPartyNames(sourceBlocks: SourceBlock[], documentXml: string): SourceCustomerName[] {
  const names = new Map<string, SourceCustomerName>()
  const addName = (name: string, owner: PartyOwner) => names.set(`${owner ?? 'unknown'}:${name}`, { name, owner })
  const paragraphXml = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0])
  const byTableRow = new Map<string, SourceBlock[]>()
  for (const block of sourceBlocks) {
    const coordinates = block.context.match(/Table (\d+), row (\d+), cell (\d+)/)
    if (!coordinates) continue
    const rowKey = `${coordinates[1]}:${coordinates[2]}`
    byTableRow.set(rowKey, [...(byTableRow.get(rowKey) ?? []), block])
  }
  const firstXmlText = (block: SourceBlock): string | undefined => {
    const xml = paragraphXml[block.index]
    const raw = xml?.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/)?.[1]
    return raw ? unescapeXml(raw).trim() : undefined
  }

  for (const block of sourceBlocks) {
    const role = block.text.trim().replace(/[:\-–—]$/, '').trim()
    if (partyRoleLabel.test(role)) {
      const coordinates = block.context.match(/Table (\d+), row (\d+), cell (\d+)/)
      if (coordinates) {
        const rowKey = `${coordinates[1]}:${coordinates[2]}`
        for (const related of byTableRow.get(rowKey) ?? []) {
          if (related.blockId === block.blockId || related.contentClass === 'package_service') continue
          const name = firstNamePair(firstXmlText(related) ?? '')
          if (name) addName(name, customerOwner(role))
        }
      }
    }

    const inlineLabel = block.text.match(/\b(zleceniodawczyni|zleceniodawca|klientka|klient|zamawiająca|zamawiający)\s*[:\-–—]\s*(.*)$/iu)
    const inlineName = inlineLabel?.[2] ? firstNamePair(inlineLabel[2]) : undefined
    if (inlineName && inlineLabel?.[1]) addName(inlineName, customerOwner(inlineLabel[1]))

    const customerAlias = /\b(?:zwaną|zwany|zwane)\s+(?:dalej\s+)?[„"']?(klient\p{L}*|parą\s+młodą|zleceniodawczyni|zleceniodawca)\b/giu
    const aliases = [...block.text.matchAll(customerAlias)]
    const alias = aliases.at(-1)
    if (!alias || alias.index === undefined) continue
    const prefix = block.text.slice(0, alias.index)
    const lastJoin = [...prefix.matchAll(/(?:\bpomiędzy\s+|,\s*a\s+)/giu)].at(-1)
    if (!lastJoin || lastJoin.index === undefined) continue
    const name = firstNamePair(prefix.slice(lastJoin.index + lastJoin[0].length))
    if (name) addName(name, customerOwner(alias[1] ?? ''))
  }
  return [...names.values()]
}

export async function validateCandidate(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  input: GenerationInput,
  approvedOperations: BlockOperation[] = [],
): Promise<string[]> {
  const issues: string[] = []
  let sourceZip: JSZip; let candidateZip: JSZip
  try { sourceZip = await JSZip.loadAsync(sourceBytes); candidateZip = await JSZip.loadAsync(candidateBytes) } catch { return ['Nie można otworzyć pakietu DOCX'] }
  const sourceDocument = await readSource(sourceBytes, input.sourceDocument.fileName)
  const candidateDocument = await readSource(candidateBytes, input.sourceDocument.fileName)
  const text = candidateText(candidateDocument.blocks)
  const flat = normalize(text)
  for (const expectedName of [input.wedding.bride.name, input.wedding.groom.name]) {
    if (!hasPolishNameFacts(flat, expectedName)) issues.push(`Brak wymaganej wartości: ${expectedName}`)
  }
  const authoritativePartyNames = [input.wedding.bride.name, input.wedding.groom.name]
  for (const staleParty of customerPartyNames(sourceDocument.blocks, await sourceZip.file('word/document.xml')!.async('string'))) {
    const authoritativeNames = staleParty.owner ? [input.wedding[staleParty.owner].name] : authoritativePartyNames
    if (authoritativeNames.some((name) => partyNamesMatch(name, staleParty.name))) continue
    if (partyNamesMatch(flat, staleParty.name)) issues.push(`Pozostała stara wartość strony umowy: ${staleParty.name}`)
  }
  for (const expected of [input.wedding.bride.email, ...input.extras]) {
    if (!hasExactFact(flat, expected)) issues.push(`Brak wymaganej wartości: ${expected}`)
  }
  if (!hasNaturalLocationFacts(flat, input.wedding.contractAddress)) {
    issues.push(`Brak prawidłowego adresu umownego: ${input.wedding.contractAddress}`)
  }
  for (const answer of input.userProvidedAnswers) {
    if (answer.id === 'contract.number' && !hasExactFact(flat, answer.value)) issues.push(`Brak wymaganego numeru umowy: ${answer.value}`)
  }
  const eventBlocks = sourceEventBlocks(sourceDocument.blocks)
  if (eventBlocks.length) {
    const candidateById = new Map(candidateDocument.blocks.map((block) => [block.blockId, block]))
    const expectedWeddingDate = parsePolishDate(input.wedding.weddingDate)
    const sourceConclusionDate = input.conclusion.sourceDate ? parsePolishDate(input.conclusion.sourceDate) : undefined
    let weddingDateFound = false
    for (const sourceBlock of eventBlocks) {
      const cue = eventCue.exec(sourceBlock.text)
      const suffixStart = cue ? cue.index + cue[0].length : 0
      const sourceEventDates = dateTimestampsInText(sourceBlock.text.slice(suffixStart)).filter((date) => date !== sourceConclusionDate)
      const candidateBlock = candidateById.get(sourceBlock.blockId)
      if (!candidateBlock) continue
      const candidateCue = eventCue.exec(candidateBlock.text)
      const candidateSuffix = candidateCue ? candidateBlock.text.slice(candidateCue.index + candidateCue[0].length) : candidateBlock.text
      const candidateEventDates = dateTimestampsInText(candidateSuffix)
      if (expectedWeddingDate !== undefined && candidateEventDates.includes(expectedWeddingDate)) weddingDateFound = true
      if (expectedWeddingDate !== undefined) {
        for (const staleDate of sourceEventDates) {
          if (staleDate !== expectedWeddingDate && candidateEventDates.includes(staleDate)) {
            issues.push(`Pozostała stara data wydarzenia w ${sourceBlock.blockId}: ${numericDate(staleDate)}`)
          }
        }
      }
    }
    if (!weddingDateFound) issues.push(`Brak prawidłowej daty wydarzenia: ${input.wedding.weddingDate}`)
  }
  for (const [label, amount] of [
    ['wynagrodzenia', input.financials.contractValuePln],
    ['wpłaty', input.financials.depositPln],
    ['pozostałej kwoty', input.financials.remainingPln],
  ] as const) {
    if (!hasMoneyAmount(flat, amount)) issues.push(`Brak prawidłowej kwoty ${label}: ${formatPlnInteger(amount)}`)
  }
  const candidateDigits = flat.replace(/[\s()\-]/g, '')
  for (const person of ['bride', 'groom'] as const) {
    const phone = input.wedding[person].phone
    if (sourceContainsPartyPhone(sourceDocument.blocks, person) && !candidateDigits.includes(phone.replace(/[\s()\-]/g, ''))) {
      issues.push(`Nieprawidłowy numer telefonu: ${phone}`)
    }
  }
  for (const location of Object.values(input.wedding.locations)) {
    if (!hasNaturalLocationFacts(flat, location)) issues.push(`Brak numeru adresowego lub kodu pocztowego lokalizacji: ${location}`)
  }
  const originalDoc = await sourceZip.file('word/document.xml')!.async('string')
  const candidateDoc = await candidateZip.file('word/document.xml')!.async('string')
  const candidateBlocks = candidateDocument.blocks
  const candidateOpeningBlock = input.conclusion.sourceBlockId
    ? candidateBlocks.find((block) => block.blockId === input.conclusion.sourceBlockId)
    : candidateBlocks.find((block) => conclusionVerb.test(block.text))
  const candidateOpening = candidateOpeningBlock?.text ?? ''
  if (input.conclusion.replaceDate) {
    const targetDate = input.conclusion.replacementDate ? parsePolishDate(input.conclusion.replacementDate) : undefined
    const actualDate = conclusionDateInText(candidateOpening)?.timestamp
    if (targetDate === undefined || actualDate !== targetDate) issues.push('Nie ustawiono daty zawarcia umowy zgodnej z datą generowania')
    const originalDate = input.conclusion.sourceDate ? parsePolishDate(input.conclusion.sourceDate) : undefined
    if (originalDate !== undefined && originalDate !== targetDate && conclusionDateTimestampsInText(candidateOpening).includes(originalDate)) issues.push(`Pozostawiono pierwotną datę zawarcia umowy: ${input.conclusion.sourceDate}`)
  } else if (!input.conclusion.sourceDate && conclusionDateInText(candidateOpening)) {
    issues.push('Dodano datę zawarcia umowy, której brakowało w źródle')
  }
  if (input.conclusion.preservePlace && !candidateOpening.includes(input.conclusion.preservePlace)) issues.push('Zmieniono miejscowość zawarcia umowy ze źródła')
  if (!input.conclusion.preservePlace && /\br\.\s*w\s+(?!\.{3})[\p{L}]/u.test(candidateOpening)) issues.push('Dodano miejscowość zawarcia umowy, której brakowało w źródle')
  for (const element of ['tbl', 'tr', 'tc'] as const) {
    const sourceCount = originalDoc.match(new RegExp(`<w:${element}\\b`, 'g'))?.length ?? 0
    const candidateCount = candidateDoc.match(new RegExp(`<w:${element}\\b`, 'g'))?.length ?? 0
    if (candidateCount !== sourceCount) issues.push(`Zmieniono strukturę tabel DOCX (${element}: ${sourceCount} → ${candidateCount})`)
  }

  const candidateById = new Map(candidateDocument.blocks.map((block) => [block.blockId, block]))
  for (const sourceBlock of sourcePackageDefinitionBlocks(sourceDocument.blocks)) {
    if (candidateById.get(sourceBlock.blockId)?.text !== sourceBlock.text) issues.push(`Treść pakietu różni się od źródła: ${sourceBlock.blockId}`)
  }

  const latestReplacementById = new Map<string, Extract<BlockOperation, { operation: 'REPLACE_BLOCK_TEXT' }>>()
  for (const operation of approvedOperations) if (operation.operation === 'REPLACE_BLOCK_TEXT') latestReplacementById.set(operation.blockId, operation)
  for (const operation of latestReplacementById.values()) {
    if (!approvedReplacementMatchesCandidate(operation, sourceDocument.blocks, candidateDocument.blocks)) {
      issues.push(`Pozostała stara wartość lub zmieniono zatwierdzony tekst w ${operation.blockId}`)
    }
  }

  const sourcePartPaths = Object.keys(sourceZip.files).filter((part) => /^word\/(header\d+|footer\d+|styles)\.xml$/.test(part)).sort()
  const candidatePartPaths = Object.keys(candidateZip.files).filter((part) => /^word\/(header\d+|footer\d+|styles)\.xml$/.test(part)).sort()
  if (JSON.stringify(candidatePartPaths) !== JSON.stringify(sourcePartPaths)) issues.push('Zmieniono zestaw części DOCX nagłówków, stopek lub stylów')
  for (const part of sourcePartPaths) {
    const sourcePart = await sourceZip.file(part)!.async('string')
    const candidatePart = await candidateZip.file(part)?.async('string')
    if (!candidatePart) continue
    if (part === 'word/styles.xml') {
      if (candidatePart !== sourcePart) issues.push(`Nieoczekiwana zmiana stylów: ${part}`)
      continue
    }
    if (xmlWithTextValuesMasked(candidatePart) !== xmlWithTextValuesMasked(sourcePart)) issues.push(`Nieoczekiwana zmiana struktury lub formatowania: ${part}`)
    const sourceInstructions = wordFieldInstructions(sourcePart)
    const candidateInstructions = wordFieldInstructions(candidatePart)
    if (JSON.stringify(candidateInstructions) !== JSON.stringify(sourceInstructions)) issues.push(`Zmieniono strukturę pól Word: ${part}`)
    for (const field of ['PAGE', 'NUMPAGES']) {
      const count = (instructions: string[]) => instructions.reduce((total, instruction) => total + (instruction.match(new RegExp(`\\b${field}\\b`, 'g'))?.length ?? 0), 0)
      if (count(sourceInstructions) > count(candidateInstructions)) issues.push(`Utracono dynamiczne pole Word ${field}: ${part}`)
    }
    const sourceBlocks = sourceDocument.blocks.filter((block) => block.part === part)
    for (const sourceBlock of sourceBlocks) {
      const candidateBlock = candidateById.get(sourceBlock.blockId)
      if (!candidateBlock || candidateBlock.text === sourceBlock.text) continue
      const approved = latestReplacementById.get(sourceBlock.blockId)
      const authorizedContractNumber = part.startsWith('word/footer') && input.userProvidedAnswers.find((answer) => answer.id === 'contract.number')?.value
      const matchesAuthoritativeFooterNumber = !!authorizedContractNumber && candidateBlock.text.includes(authorizedContractNumber)
      if ((!approved || normalize(candidateBlock.text) !== normalize(approved.finalText)) && !matchesAuthoritativeFooterNumber) {
        issues.push(`Nieautoryzowana zmiana treści w ${sourceBlock.blockId}`)
      }
    }
  }
  return issues
}
