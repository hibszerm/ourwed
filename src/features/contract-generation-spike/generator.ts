import JSZip from 'jszip'
import { applyBlockOperations, remapOperationsToCurrentBlocks, type BlockOperation, type EditableBlock } from './blockDocxEditor'

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
  conclusion: { replaceDate: boolean; replacementDate?: string; preservePlace?: string }
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

export const TRANSFORMATION_INSTRUCTIONS = `Transform only the supplied source blocks and authoritative inputs. Preserve legal wording: do not paraphrase legal clauses or change their legal subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery terms. Make only mechanical factual updates explicitly required by authoritative facts (names, dates, amounts, locations, package references, selected extras, internal references, and required grammatical inflection). You may make an obvious, unambiguous, minimal local editorial correction such as a duplicated token, typo, missing space, or punctuation error only when legal meaning does not change. For example, “tel. 668 698 892, tel. zwanego dalej” may become “tel. 668 698 892, zwanego dalej”; do not rewrite the full identification clause. Input conflicts must be stopped before transformation. Return complete final paragraph text for changed blocks. Leave unrelated protected legal/static blocks unchanged; return no operation for a protected block unless an explicit authoritative fact mechanically requires a change. Each source block includes a contentClass: factual_dynamic, package_service, or protected_legal_static. Preserve the Video Standard package exactly when required by packagePolicy.`

export const REVIEW_INSTRUCTIONS = `Review source and candidate blocks, including each source block's contentClass (factual_dynamic, package_service, or protected_legal_static). The source contract defines which factual concepts belong in the contract; authoritative input supplies the new value only for a concept the source contains or requires. Do not require every available CRM/input fact to appear in the candidate, and do not add an input fact when the source has no corresponding concept; doing so may be semantic drift. For each factual concept, distinguish: (A) source-required and input value available: candidate must preserve the concept with the authoritative updated value; (B) source-required but authoritative input value missing: generation should stop with MISSING_INPUT; (C) authoritative input value available but concept unused by the source: omission is allowed and is not MISSING_INPUT or a review failure. Use the source-vs-candidate context to decide whether the source contains or requires the concept; do not infer that requirement from CRM/input availability alone. Classify differences as: (D) substantive legal rewrite, which fails if a protected legal clause changes subject, obligations, rights, scope, consent, cancellation, liability, copyright, publication, or delivery without an explicit authoritative mechanical reason; (E) allowed mechanical factual adaptation; (F) allowed minimal, unambiguous editorial typo/token/spacing/punctuation fix that does not change legal meaning; or (G) unchanged source issue, which is not introduced by the transformation. Do not fail merely because a harmless editorial error was corrected. Do fail on an unauthorized substantive legal rewrite.`

export function classifyBlock(text: string): SourceBlock['contentClass'] {
  if (/Video Standard|teledysk|film ślubny|ujęcia|pakiet/i.test(text)) return 'package_service'
  if (/zgod[ęa]|oświadcza|zobowiązan|prawo|odpowiedzialnoś|rozwiązani|zadatek|copyright|autorsk|publik|przetwarzani|danych osobow|Umow.{0,24}wymagaj|nie podlegaj|wyraża zgody/i.test(text)) return 'protected_legal_static'
  return 'factual_dynamic'
}

function parsePolishDate(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!match) return undefined
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : undefined
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

export function hasNaturalLocationFacts(candidateText: string, authoritativeLocation: string): boolean {
  const postalCode = authoritativeLocation.match(/\b\d{2}-\d{3}\b/)?.[0]
  if (!postalCode || !candidateText.includes(postalCode)) return false
  const beforePostal = authoritativeLocation.slice(0, authoritativeLocation.indexOf(postalCode))
  const streetNumber = [...beforePostal.matchAll(/\b\d+(?:\/\d+)?\b/g)].at(-1)?.[0]
  if (!streetNumber) return false
  const escapedPostal = postalCode.replace('-', '\\-')
  const escapedNumber = streetNumber.replace('/', '\\/')
  return new RegExp(`\\b${escapedNumber}\\b.{0,120}\\b${escapedPostal}\\b`).test(candidateText)
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
  const datePattern = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\.{3,}|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}\b/i
  const opening = sourceBlocks.find((block) => /\bzawarta\b/i.test(block.text) && datePattern.test(block.text))?.text ?? ''
  const hasDate = Boolean(generationDate.trim()) && datePattern.test(opening)
  const place = opening.match(/(?:\br\.|\b\d{4}\s+(?:r\.|roku))\s+w\s+([^,;]+?)(?=,?\s+(?:zwana|zwany|zwane|pomiędzy|między)\b|[,;]|$)/i)?.[1]?.trim()
  return { replaceDate: hasDate, ...(hasDate ? { replacementDate: generationDate } : {}), ...(place && !/\.{3,}/.test(place) ? { preservePlace: place } : {}) }
}

function candidateText(blocks: SourceBlock[]): string { return blocks.map((b) => b.text).join('\n') }
function normalize(text: string): string { return text.normalize('NFC').replace(/\s+/g, ' ').trim() }

export async function runGeneration(sourceBytes: ArrayBuffer, input: GenerationInput, ai: ContractAi): Promise<GenerationResult> {
  const conflicts = findInputConflicts(input)
  if (conflicts.length) return { status: 'CONFLICT_INPUT', conflicts }
  const planned = await ai.plan(input)
  if (planned.missingInputs.some((x) => x.required)) return { status: 'MISSING_INPUT', missingInputs: planned.missingInputs }
  if (!planned.blockOperations) return { status: 'FAILED', issues: ['Plan nie zawiera operacji blokowych'] }
  const authoritativeAmounts = [input.financials.contractValuePln, input.financials.depositPln, input.financials.remainingPln]
  const normalizedOperations = planned.blockOperations.map((operation) => 'finalText' in operation
    ? { ...operation, finalText: normalizeAuthoritativePlnText(operation.finalText, authoritativeAmounts) }
    : operation)
  const plannedBlockIds = new Set(normalizedOperations.flatMap((operation) => 'blockId' in operation ? [operation.blockId] : []))
  const financialBlockOperations: BlockOperation[] = normalizeAuthoritativeFinancialBlocks(input.sourceDocument.blocks, authoritativeAmounts)
    .filter(({ block }) => !plannedBlockIds.has(block.blockId))
    .map(({ block, text }) => ({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: text }))
  const completeOperations = [...normalizedOperations, ...financialBlockOperations]
  let candidateBytes = await applyBlockOperations(sourceBytes, completeOperations)
  let blocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
  let review = await ai.review({ source: input.sourceDocument, input, candidate: blocks })
  if (review.status === 'FAIL') {
    const repair = await ai.repair({ input, source: input.sourceDocument.blocks, candidate: blocks, issues: review.issues })
    const implicated = new Set(review.issues.flatMap((issue) => input.sourceDocument.blocks.filter((block) => issue.includes(block.blockId)).map((block) => block.blockId)))
    if (repair.some((operation) => !implicated.has('blockId' in operation ? operation.blockId : operation.anchorBlockId))) return { status: 'FAILED', issues: ['Naprawa wskazała bloki spoza ustaleń recenzji'] }
    const remappedRepair = remapOperationsToCurrentBlocks(repair, input.sourceDocument.blocks, blocks, completeOperations)
    candidateBytes = await applyBlockOperations(candidateBytes, remappedRepair)
    blocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
    review = await ai.review({ source: input.sourceDocument, input, candidate: blocks })
  }
  if (review.status === 'FAIL') return { status: 'FAILED', issues: review.issues }
  const safety = await validateCandidate(sourceBytes, candidateBytes, input)
  return safety.length ? { status: 'FAILED', issues: safety } : { status: 'COMPLETED', docxBytes: candidateBytes, review }
}

export const KNOWN_OLD_VALUES = ['Adelą Światłowską', '533 962 003', '30.07.2027', 'Willi Berlińskiej', '10 500 zł', '9 500 zł']

export async function validateCandidate(sourceBytes: ArrayBuffer, candidateBytes: ArrayBuffer, input: GenerationInput): Promise<string[]> {
  const issues: string[] = []
  let sourceZip: JSZip; let candidateZip: JSZip
  try { sourceZip = await JSZip.loadAsync(sourceBytes); candidateZip = await JSZip.loadAsync(candidateBytes) } catch { return ['Nie można otworzyć pakietu DOCX'] }
  const text = candidateText((await readSource(candidateBytes, input.sourceDocument.fileName)).blocks)
  const flat = normalize(text)
  for (const expected of [input.wedding.bride.name, input.wedding.groom.name, input.wedding.bride.email, input.wedding.weddingDate, input.wedding.contractAddress, formatPlnInteger(input.financials.contractValuePln), formatPlnInteger(input.financials.depositPln), formatPlnInteger(input.financials.remainingPln), ...input.extras]) {
    if (!hasExactFact(flat, expected)) issues.push(`Brak wymaganej wartości: ${expected}`)
  }
  for (const stale of findStaleValues(flat, KNOWN_OLD_VALUES)) issues.push(`Pozostała stara wartość: ${stale}`)
  const candidateDigits = flat.replace(/[\s()\-]/g, '')
  for (const phone of [input.wedding.bride.phone, input.wedding.groom.phone]) {
    if (!candidateDigits.includes(phone.replace(/[\s()\-]/g, ''))) issues.push(`Nieprawidłowy numer telefonu: ${phone}`)
  }
  for (const location of Object.values(input.wedding.locations)) {
    if (!hasNaturalLocationFacts(flat, location)) issues.push(`Brak numeru adresowego lub kodu pocztowego lokalizacji: ${location}`)
  }
  const originalDoc = await sourceZip.file('word/document.xml')!.async('string')
  const candidateDoc = await candidateZip.file('word/document.xml')!.async('string')
  const candidateBlocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
  const candidateOpening = candidateBlocks.find((block) => /Zawarta w dniu|zawarta dnia/i.test(block.text))?.text ?? ''
  if (input.conclusion.replaceDate && input.conclusion.replacementDate && !candidateOpening.includes(input.conclusion.replacementDate)) issues.push('Nie ustawiono daty zawarcia umowy zgodnej z datą generowania')
  if (input.conclusion.preservePlace && !candidateOpening.includes(input.conclusion.preservePlace)) issues.push('Zmieniono miejscowość zawarcia umowy ze źródła')
  if (!input.conclusion.preservePlace && /\br\.\s*w\s+(?!\.{3})[\p{L}]/u.test(candidateOpening)) issues.push('Dodano miejscowość zawarcia umowy, której brakowało w źródle')
  if ((candidateDoc.match(/<w:tbl\b/g) ?? []).length < (originalDoc.match(/<w:tbl\b/g) ?? []).length) issues.push('Zniknęła tabela lub struktura podpisów')
  for (const path of Object.keys(sourceZip.files).filter((p) => /^(word\/(header|footer|styles)\w*\.xml)$/.test(p))) {
    const a = await sourceZip.file(path)!.async('string'); const b = await candidateZip.file(path)?.async('string')
    if (a !== b) issues.push(`Nieoczekiwana zmiana struktury: ${path}`)
  }
  if (!originalDoc.includes('Video Standard')) issues.push('Źródłowy pakiet nie zawiera oczekiwanej nazwy pakietu')
  for (const sourceBlock of input.sourceDocument.blocks.filter((b) => /Video Standard|teledysku ślubnego o długości|filmy ślubnego o długości/.test(b.text))) {
    if (!flat.includes(normalize(sourceBlock.text))) issues.push('Treść pakietu różni się od źródła')
  }
  return issues
}
