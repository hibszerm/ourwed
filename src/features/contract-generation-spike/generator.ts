import JSZip from 'jszip'
import { applyBlockOperations, remapOperationsToCurrentBlocks, type BlockOperation, type EditableBlock } from './blockDocxEditor'

export type MissingInput = { id: string; label: string; explanation: string; inputType: 'text' | 'date' | 'number'; required: true; sourceContext: string }
export type SourceBlock = EditableBlock
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
export type GenerationResult = { status: 'MISSING_INPUT'; missingInputs: MissingInput[] } | { status: 'FAILED'; issues: string[] } | { status: 'COMPLETED'; docxBytes: ArrayBuffer; review: ReviewResult }
export interface ContractAi {
  plan(input: GenerationInput): Promise<{ missingInputs: MissingInput[]; blockOperations?: BlockOperation[] }>
  review(args: { source: GenerationInput['sourceDocument']; input: GenerationInput; candidate: SourceBlock[] }): Promise<ReviewResult>
  repair(args: { input: GenerationInput; source: SourceBlock[]; candidate: SourceBlock[]; issues: string[] }): Promise<BlockOperation[]>
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<GenerationInput['sourceDocument']> {
  const blocks = await (await import('./blockDocxEditor')).buildBlockIndex(bytes)
  return { fileName, blocks }
}

export function makeInput(args: Omit<GenerationInput, 'financials' | 'conclusion'>): GenerationInput {
  const remainingPln = args.wedding.contractValuePln - args.wedding.depositPln
  if (remainingPln < 0) throw new Error('Deposit exceeds contract value')
  return { ...args, conclusion: conclusionRule(args.sourceDocument.blocks, args.generationDate), financials: { contractValuePln: args.wedding.contractValuePln, depositPln: args.wedding.depositPln, remainingPln } }
}

export function conclusionRule(sourceBlocks: SourceBlock[], generationDate: string): GenerationInput['conclusion'] {
  const opening = sourceBlocks.find((block) => /Zawarta w dniu|zawarta dnia/i.test(block.text))?.text ?? ''
  const hasDate = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\.{3,}/.test(opening)
  const place = opening.match(/\br\.\s*w\s+([^,;]+?)(?=,|\s+zwana|$)/i)?.[1]?.trim()
  return { replaceDate: hasDate, ...(hasDate ? { replacementDate: generationDate } : {}), ...(place && !/\.{3,}/.test(place) ? { preservePlace: place } : {}) }
}

function candidateText(blocks: SourceBlock[]): string { return blocks.map((b) => b.text).join('\n') }
function normalize(text: string): string { return text.normalize('NFC').replace(/\s+/g, ' ').trim() }

export async function runGeneration(sourceBytes: ArrayBuffer, input: GenerationInput, ai: ContractAi): Promise<GenerationResult> {
  const planned = await ai.plan(input)
  if (planned.missingInputs.some((x) => x.required)) return { status: 'MISSING_INPUT', missingInputs: planned.missingInputs }
  if (!planned.blockOperations) return { status: 'FAILED', issues: ['Plan nie zawiera operacji blokowych'] }
  let candidateBytes = await applyBlockOperations(sourceBytes, planned.blockOperations)
  let blocks = (await readSource(candidateBytes, input.sourceDocument.fileName)).blocks
  let review = await ai.review({ source: input.sourceDocument, input, candidate: blocks })
  if (review.status === 'FAIL') {
    const repair = await ai.repair({ input, source: input.sourceDocument.blocks, candidate: blocks, issues: review.issues })
    const implicated = new Set(review.issues.flatMap((issue) => input.sourceDocument.blocks.filter((block) => issue.includes(block.blockId)).map((block) => block.blockId)))
    if (repair.some((operation) => !implicated.has('blockId' in operation ? operation.blockId : operation.anchorBlockId))) return { status: 'FAILED', issues: ['Naprawa wskazała bloki spoza ustaleń recenzji'] }
    const remappedRepair = remapOperationsToCurrentBlocks(repair, input.sourceDocument.blocks, blocks, planned.blockOperations)
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
  const locationNeedles = Object.values(input.wedding.locations).map((location) => location.split(',').find((part) => /\d/.test(part))?.trim() ?? location)
  for (const expected of [input.wedding.bride.name, input.wedding.groom.name, input.wedding.bride.phone, input.wedding.bride.email, input.wedding.groom.phone, input.wedding.weddingDate, `${input.financials.contractValuePln.toLocaleString('pl-PL')} zł`, `${input.financials.depositPln} zł`, `${input.financials.remainingPln.toLocaleString('pl-PL')} zł`, ...locationNeedles, ...input.extras]) {
    if (!flat.includes(normalize(expected))) issues.push(`Brak wymaganej wartości: ${expected}`)
  }
  for (const stale of KNOWN_OLD_VALUES) if (flat.includes(normalize(stale))) issues.push(`Pozostała stara wartość: ${stale}`)
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
