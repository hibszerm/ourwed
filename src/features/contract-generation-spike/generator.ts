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
export type PlannerResponseStatus = 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'READY'
export type GenerationResult = { status: 'MISSING_INPUT'; missingInputs: MissingInput[] } | { status: 'CONFLICT_INPUT'; conflicts: ConflictInput[] } | { status: 'FAILED'; issues: string[] } | { status: 'COMPLETED'; docxBytes: ArrayBuffer; review: ReviewResult }
export interface ContractAi {
  plan(input: GenerationInput): Promise<{ missingInputs: MissingInput[]; blockOperations?: BlockOperation[] }>
  review(args: { source: GenerationInput['sourceDocument']; input: GenerationInput; candidate: SourceBlock[] }): Promise<ReviewResult>
  repair(args: { input: GenerationInput; source: SourceBlock[]; candidate: SourceBlock[]; issues: string[] }): Promise<BlockOperation[]>
}

export const AUTHORITATIVE_FIELD_SEMANTICS = `Resolve authoritative values by semantic concept and owning entity, not by exact label matching. The structured wedding.contractAddress field is the authoritative contract/residential address for the CRM client entity associated with that contract record. It satisfies equivalent source wording for that same entity, including an address or a clause such as “zamieszkała przy” or “zamieszkały przy”. It is not a universal address for every person named in the contract and must not satisfy a different entity's address requirement. Treat userProvidedAnswers as authoritative too; use each answer id to respect its entity/path scope. Distinct entities require their own authoritative address values. One address may satisfy multiple entities only when the authoritative input explicitly identifies it as shared. Before returning MISSING_INPUT for a source-required concept, check all structured authoritative fields, userProvidedAnswers, and applicable generation rules; return MISSING_INPUT only when that concept has no authoritative value for the relevant entity. When a source entity is replaced, source-owned factual values are not authoritative for the replacement entity. For each source-required factual concept, use a value authoritative for that same entity and concept; if it is unavailable, return MISSING_INPUT. Do not carry over the old entity's value, guess a replacement, or omit the required concept to avoid asking.`

export const TRANSFORMATION_INSTRUCTIONS = `${AUTHORITATIVE_FIELD_SEMANTICS} Before deciding the planning result, complete a full audit of every source-required factual change. First determine the facts and relationships the source requires; then match each fact to authoritative input for the correct entity, context, and required level of detail; then collect all clearly identifiable missing values and conflicts. Do not stop after finding the first missing fact. Return all independent missing inputs in one response. Determine the result only after the audit: any required missing value means MISSING_INPUT; any conflict means CONFLICT_INPUT where the current response schema supports conflicts, while preserving existing deterministic conflict handling otherwise; READY is allowed only when no unresolved required value or conflict remains. Generate transformation operations only for READY. For MISSING_INPUT or CONFLICT_INPUT, return no operations. Transform only the supplied source blocks and authoritative inputs. Preserve legal wording: do not paraphrase legal clauses or change their legal subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery terms. Make only mechanical factual updates explicitly required by authoritative facts (names, dates, amounts, locations, package references, selected extras, internal references, and required grammatical inflection). You may make an obvious, unambiguous, minimal local editorial correction such as a duplicated token, typo, missing space, or punctuation error only when legal meaning does not change. For example, remove a duplicated “tel.” token immediately before a grammatical party label when the local correction is unambiguous; preserve the rest of the identification clause and its meaning. Input conflicts must be stopped before transformation. Return complete final paragraph text for changed blocks. Leave unrelated protected legal/static blocks unchanged; return no operation for a protected block unless an explicit authoritative fact mechanically requires a change. Each source block includes a contentClass: factual_dynamic, package_service, or protected_legal_static. The source DOCX is authoritative for package name, package wording, package scope, and package terms. Preserve source package content exactly unless authoritative generation input explicitly requires a permitted factual change. Do not substitute package names or package scope from another template. Do not reconstruct a package from prior-case knowledge. Do not use hardcoded knowledge of any package. Treat an authoritative aggregate amount separately from a source-required detailed allocation: if the source requires the amount to be distributed across multiple independently meaningful payments, deadlines, or installments, and authoritative input does not provide that allocation, do not infer or preserve an allocation; return MISSING_INPUT for the unresolved detail. You may return all independently identified missing inputs together. Follow structured input.conclusion deterministically: sourceDate/sourceBlockId identify the source conclusion, and when replaceDate is true, replacementDate is the required conclusion date for that block. Preserve preservePlace using the source's natural grammatical form. Keep this distinct from wedding.weddingDate; do not substitute the wedding/event date for the conclusion date. When replaceDate is false, do not introduce a conclusion date merely because generationDate is present.`

export function sanitizePlannerOperations(status: PlannerResponseStatus, providerOperations: BlockOperation[] | undefined): {
  rawOperations: BlockOperation[]
  operations: BlockOperation[]
  rawOperationCount: number
  operationCount: number
  discardedOperationCount: number
} {
  const rawOperations = providerOperations ?? []
  const operations = status === 'READY' ? rawOperations : []
  return {
    rawOperations,
    operations,
    rawOperationCount: rawOperations.length,
    operationCount: operations.length,
    discardedOperationCount: rawOperations.length - operations.length,
  }
}

export const REVIEW_INSTRUCTIONS = `Review source and candidate blocks, including each source block's contentClass (factual_dynamic, package_service, or protected_legal_static). The source contract defines which factual concepts belong in the contract; authoritative input supplies the new value only for a concept the source contains or requires. Do not require every available CRM/input fact to appear in the candidate, and do not add an input fact when the source has no corresponding concept; doing so may be semantic drift. For each factual concept, distinguish: (A) source-required and input value available: candidate must preserve the concept with the authoritative updated value; (B) source-required but authoritative input value missing: generation should stop with MISSING_INPUT; (C) authoritative input value available but concept unused by the source: omission is allowed and is not MISSING_INPUT or a review failure. Use the source-vs-candidate context to decide whether the source contains or requires the concept; do not infer that requirement from CRM/input availability alone. Classify differences as: (D) substantive legal rewrite, which fails if a protected legal clause changes subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery without an explicit authoritative mechanical reason; (E) allowed mechanical factual adaptation; (F) allowed minimal, unambiguous editorial typo/token/spacing/punctuation fix that does not change legal meaning; or (G) unchanged source issue, which is not introduced by the transformation. Do not fail merely because a harmless editorial error was corrected. Do fail on an unauthorized substantive legal rewrite.`

export function classifyBlock(text: string): SourceBlock['contentClass'] {
  if (/\bvideo\b|teledysk|film ślubny|ujęcia|pakiet/i.test(text)) return 'package_service'
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

type FormalClientIdentity = { body: string; clauses: string[] }
type WeddingPartyKey = 'bride' | 'groom'

const formalClientRoleBoundary = /\bzwan(?:y|a|ą|e|ego|ej|ym)\s+dalej\s+["“]?(?:zleceniodawc\p{L}*|zamawiaj\p{L}*|klient\p{L}*)["”]?/iu

function formalClientIdentity(text: string): FormalClientIdentity | undefined {
  const role = formalClientRoleBoundary.exec(text)
  if (!role) return undefined
  const body = text.slice(0, role.index).trim().replace(/[\s,;:]+$/u, '')
  const clauses = body.split(/\s*,\s*/u).filter(Boolean)
  return clauses.length > 1 ? { body, clauses } : undefined
}

function identityAttributeGroups(clauses: string[]): string[] {
  const groups: string[] = []
  const startsAttribute = (clause: string) =>
    /^[^,:]{1,60}:\s*\S/u.test(clause) ||
    /^\s*[\p{Lu}][\p{Lu}\d_-]{1,}\s+\S/u.test(clause) ||
    /\b(?:zamieszka\p{L}*|adres|address|residen\p{L}*)\s+(?:przy|at)\b/iu.test(clause) ||
    /^\s*[\p{Lu}][\p{L}-]{1,}\s+[^,]*[\d@]/u.test(clause)

  for (const clause of clauses) {
    if (startsAttribute(clause) || !groups.length) groups.push(clause.trim())
    else groups[groups.length - 1] = `${groups[groups.length - 1]}, ${clause.trim()}`
  }
  return groups
}

function identityAttribute(group: string): { label: string; value: string } {
  const colon = group.indexOf(':')
  if (colon > 0) return { label: group.slice(0, colon).trim(), value: group.slice(colon + 1).trim() }
  const address = group.match(/\b(?:zamieszka\p{L}*|adres|address|residen\p{L}*)\s+(?:przy|at)\s+(.+)$/iu)
  if (address) return { label: 'address', value: address[1]!.trim() }
  const uppercaseLabel = group.match(/^\s*([\p{Lu}\d][\p{Lu}\d_-]{1,})\s+(.+)$/u)
  if (uppercaseLabel) return { label: uppercaseLabel[1]!, value: uppercaseLabel[2]!.trim() }
  const firstWord = group.match(/^\s*([\p{L}][\p{L}-]*)\s+(.+)$/u)
  if (firstWord) return { label: firstWord[1]!, value: firstWord[2]!.trim() }
  return { label: '', value: group.trim() }
}

function beginsWithPartyName(clause: string, name: string): boolean {
  const leadingValue = clause.split(/[,;:]/u, 1)[0]!.trim().replace(/^(?:a|i|oraz)\s+/iu, '')
  const leadingWords = leadingValue.match(/[\p{L}][\p{L}'’-]*/gu) ?? []
  const expectedWords = name.match(/[\p{L}][\p{L}'’-]*/gu) ?? []
  if (!expectedWords.length || leadingWords.length < expectedWords.length) return false
  return hasPolishNameFacts(leadingWords.slice(0, expectedWords.length).join(' '), name)
}

function normalizedConcept(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '')
}

const existingConceptAliases = [
  ['address', 'contractaddress', 'adres', 'residence', 'residentialaddress', 'zamieszkanie', 'zamieszkała', 'zamieszkały'],
  ['phone', 'telephone', 'telefon', 'tel'],
  ['email', 'mail'],
]

function conceptsMatch(left: string, right: string): boolean {
  const a = normalizedConcept(left)
  const b = normalizedConcept(right)
  if (!a || !b) return false
  return a === b || existingConceptAliases.some((group) => group.includes(a) && group.includes(b))
}

function scopedAnswerForParty(answerId: string, party: WeddingPartyKey): boolean {
  const parts = answerId.split(/[.[\]/:_-]+/u).map(normalizedConcept).filter(Boolean)
  return parts.includes(party) || parts.some((part) => ['client', 'customer', 'contractclient', 'contractingparty'].includes(part))
}

function valueOccurs(text: string, value: string): boolean {
  const haystack = normalize(text)
  const needle = normalize(value)
  if (!needle || needle.length < 2) return false
  if (haystack.includes(needle)) return true
  const expectedDate = parsePolishDate(value)
  return expectedDate !== undefined && dateTimestampsInText(text).includes(expectedDate)
}

function authoritativeValueForParty(
  input: GenerationInput,
  party: WeddingPartyKey,
  label: string,
  value: string,
): boolean {
  const profile = input.wedding[party] as unknown as Record<string, unknown>
  const structuredValues = Object.entries(profile)
    .filter(([key, item]) => typeof item === 'string' && conceptsMatch(label, key))
    .map(([, item]) => item as string)
  if (conceptsMatch(label, 'address')) structuredValues.push(input.wedding.contractAddress)
  if (structuredValues.some((item) => valueOccurs(value, item) || valueOccurs(item, value))) return true

  return input.userProvidedAnswers.some((answer) => {
    if (!scopedAnswerForParty(answer.id, party)) return false
    const pathParts = answer.id.split(/[.[\]/:_-]+/u).filter(Boolean)
    const conceptParts = pathParts.filter((part) => !['wedding', 'bride', 'groom', 'client', 'customer', 'contractclient', 'contractingparty'].includes(normalizedConcept(part)))
    if (!conceptParts.some((part) => conceptsMatch(label, part))) return false
    return valueOccurs(value, answer.value) || valueOccurs(answer.value, value)
  })
}

/** Rejects source-owned identity facts carried into a replacement client's formal identity without same-entity authority. */
export function validatePlannedEntityFacts(input: GenerationInput, operations: BlockOperation[]): string[] {
  const replacements = new Map(operations.flatMap((operation) =>
    operation.operation === 'REPLACE_BLOCK_TEXT' ? [[operation.blockId, operation.finalText] as const] : []))
  const findings: string[] = []
  const parties: Array<{ key: WeddingPartyKey; name: string }> = [
    { key: 'bride', name: input.wedding.bride.name },
    { key: 'groom', name: input.wedding.groom.name },
  ]

  for (const sourceBlock of input.sourceDocument.blocks) {
    const plannedText = replacements.get(sourceBlock.blockId)
    if (plannedText === undefined) continue
    const sourceIdentity = formalClientIdentity(sourceBlock.text)
    const plannedIdentity = formalClientIdentity(plannedText)
    if (!sourceIdentity || !plannedIdentity) continue

    const targets = parties.flatMap((party) => plannedIdentity.clauses.flatMap((clause, clauseIndex) =>
      beginsWithPartyName(clause, party.name) ? [{ ...party, clauseIndex }] : []))
    if (targets.length !== 1) continue
    const target = targets[0]!
    const sourceEntityClause = sourceIdentity.clauses[target.clauseIndex]
    if (!sourceEntityClause || beginsWithPartyName(sourceEntityClause, target.name)) continue
    const replacementIdentity = plannedIdentity.clauses.slice(target.clauseIndex).join(', ')
    const sourceName = sourceEntityClause.replace(/^\s*(?:a|i|oraz)\s+/iu, '')
    if (hasExactFact(replacementIdentity, sourceName) && !authoritativeValueForParty(input, target.key, 'name', sourceName)) {
      findings.push(`A source entity-owned value remains in the replacement party identity in block ${sourceBlock.blockId}; no authoritative replacement for the same entity and concept was found.`)
    }

    for (const group of identityAttributeGroups(sourceIdentity.clauses.slice(target.clauseIndex + 1))) {
      const { label, value } = identityAttribute(group)
      if (!valueOccurs(replacementIdentity, value)) continue
      if (authoritativeValueForParty(input, target.key, label, value)) continue
      findings.push(`A source entity-owned value remains in the replacement party identity in block ${sourceBlock.blockId}; no authoritative replacement for the same entity and concept was found.`)
      break
    }
  }

  return [...new Set(findings)]
}

const paymentAllocationClause = /(?:płat|plat|zapł|zapl|kwot|pozostał|należn|rata|raty|instalment|installment|deposit|reservation)/iu
const reservationClause = /(?:opłat\p{L}*\s+rezerwacyj\p{L}*|reservation|deposit|zaliczk)/iu
const aggregateClause = /(?:suma|łącznie|razem|całość|total|aggregate)/iu

function paymentObligationAmounts(text: string): number[][] {
  return text
    .split(/[.;!?\n]+/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause && !aggregateClause.test(clause) && !reservationClause.test(clause) && paymentAllocationClause.test(clause))
    .map((clause) => moneyAmountsInGrosz(clause))
    .filter((amounts) => amounts.length > 0)
}

function explicitPaymentAllocation(input: GenerationInput): number[] {
  const allocationAnswers = input.userProvidedAnswers.filter((answer) => /payment|installment|allocation|schedule|rata|płatno|platno|harmonogram/iu.test(answer.id))
  return allocationAnswers.flatMap((answer) => {
    const currencyAmounts = /zł/iu.test(answer.value) ? moneyAmountsInGrosz(answer.value) : []
    if (currencyAmounts.length) return currencyAmounts
    return [...answer.value.matchAll(/(?<![\p{L}\p{N}])(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?![\p{L}\p{N}])/gu)]
      .map((match) => Number(match[0].replace(/[\s\u00a0\u202f]/gu, '').replace(',', '.')))
      .filter((amount) => Number.isSafeInteger(amount) && amount >= 0)
      .map((amount) => amount * 100)
  })
}

export function validatePlannedPaymentAllocation(input: GenerationInput, operations: BlockOperation[]): string[] {
  const sourceObligations = input.sourceDocument.blocks.flatMap((block) => {
    if (/\b(?:katalog|opcjonaln|nie są objęte|not included|optional service)/iu.test(block.text)) return []
    return paymentObligationAmounts(block.text)
  })
  if (sourceObligations.length <= 1) return []

  const supportedAmounts = explicitPaymentAllocation(input)
  if (supportedAmounts.length !== sourceObligations.length) {
    return ['Payment-allocation plan validation failed: the source requires multiple distinct post-reservation payment obligations, but authoritative input provides only an aggregate amount and no complete detailed allocation.']
  }

  const replacementMap = new Map(operations.flatMap((operation) => operation.operation === 'REPLACE_BLOCK_TEXT' ? [[operation.blockId, operation.finalText] as const] : []))
  const plannedObligations = input.sourceDocument.blocks.flatMap((block) => paymentObligationAmounts(replacementMap.get(block.blockId) ?? block.text))
  const plannedAmounts = plannedObligations.flat()
  const expected = supportedAmounts.slice(0, sourceObligations.length).sort((a, b) => a - b)
  const actual = plannedAmounts.sort((a, b) => a - b)
  if (actual.length !== expected.length || actual.some((amount, index) => amount !== expected[index])) {
    return ['Payment-allocation plan validation failed: planned payment amounts do not match the explicit authoritative detailed allocation.']
  }
  return []
}

export function validatePlannedTransformation(input: GenerationInput, operations: BlockOperation[]): string[] {
  return [...validatePlannedConclusion(input, operations), ...validatePlannedEntityFacts(input, operations), ...validatePlannedPaymentAllocation(input, operations)]
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
  const status: PlannerResponseStatus = planned.missingInputs.some((x) => x.required) ? 'MISSING_INPUT' : 'READY'
  const responseOperations = sanitizePlannerOperations(status, planned.blockOperations)
  if (status === 'MISSING_INPUT') return { status, missingInputs: planned.missingInputs }
  if (!planned.blockOperations) return { status: 'FAILED', issues: ['Plan nie zawiera operacji blokowych'] }
  const planIssues = validatePlannedTransformation(input, responseOperations.operations)
  if (planIssues.length) return { status: 'FAILED', issues: planIssues }
  const authoritativeAmounts = [input.financials.contractValuePln, input.financials.depositPln, input.financials.remainingPln]
  const normalizedOperations = responseOperations.operations.map((operation) => 'finalText' in operation
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
