import JSZip from 'jszip'
import { randomUUID } from 'node:crypto'
import { applyBlockOperations, type BlockOperation, type EditableBlock } from './blockDocxEditor'
import { unescapeXml } from '@/features/documents/template/canonicalParagraph'
import type { ContractGenerationInput } from './contractGenerationInput'
import { isGenerationResponse, type BlockEdit } from './generationProtocol'

export type SourceBlock = EditableBlock
export type SourceDocument = { fileName: string; blocks: SourceBlock[] }
export type ChangedBlock = { blockRef: string; sourceText: string | null; candidateText: string | null }
export type GenerationSourceBlock = { blockId: string; kind: EditableBlock['kind']; text: string }
export type GenerationSourceView = { blocks: GenerationSourceBlock[]; sourceBlockIds: Map<string, string> }
export type OptionBGenerationResult =
  | { status: 'MISSING_INPUT'; missingInputs: string[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }
  | { status: 'FAILED'; issues: string[] }
  | { status: 'READY'; candidateBytes: ArrayBuffer; candidate: SourceDocument; edits: BlockEdit[]; changedBlocks: ChangedBlock[] }

export const GENERATION_INSTRUCTIONS = `Read the source contract and current authoritative wedding data. Produce the same contract correctly adapted to this wedding. The source defines the contract's clauses, obligations, service scope, legal and commercial meaning, payment concepts, and structure. Current authoritative input supplies current transaction facts; user answers and the explicit product rules below are also authoritative. Preserve unrelated content and make only changes needed for this transaction. Do not rewrite or improve unrelated prose, modernize or summarize the contract, or add CRM information merely because it exists. Use natural grammar, including inflected names and locations; literal equality with display-form values is not required. Ask only for facts genuinely required by the source and unavailable from authority, and report all discoverable required gaps together. Return CONFLICT_INPUT only for a material conflict not resolved by the source, authority, answers, or product rules. Otherwise return READY with the minimal whole-block edits. Replace blocks to update existing text; insert only content actually authorized by the source or product rules. Do not invent legal clauses or alter base service scope. Return only the GenerationResponse protocol.`

export const GENERIC_CONTRACT_PRODUCT_RULES = [
  'contractValue is the authoritative total; do not add selected extras or charged travel on top when they are already components of that total.',
  'Use only explicit current extras; they do not authorize rewriting unrelated source service obligations or inserting unrelated CRM information.',
  'Apply the existing travel status and amount as supplied; included or non-charged travel is not a separate added amount.',
  'Preserve source-defined payment timing for each obligation unless an existing explicit authority replaces that same obligation; do not invent signing dates or convert relative deadlines.',
  'Use the supplied generation date where the source requires the contract conclusion date; preserve the source conclusion place.',
] as const

/** Create per-call opaque handles so model-visible IDs reveal no XML path or paragraph index. */
export function createGenerationSourceView(source: SourceDocument): GenerationSourceView {
  const sourceBlockIds = new Map<string, string>()
  const blocks = source.blocks.map((block) => {
    const blockId = randomUUID()
    sourceBlockIds.set(blockId, block.blockId)
    return { blockId, kind: block.kind, text: block.text }
  })
  return { blocks, sourceBlockIds }
}

export function validateOptionBInput(input: ContractGenerationInput): string[] {
  const issues = validateNormalizedDerivedFacts(input)
  for (const { path, fact } of normalizedFacts(input)) {
    if (!fact.source.trim()) issues.push(`Normalized authority fact has no provenance source: ${path}`)
  }
  const amounts = [
    ['contractValue', input.commercial.contractValue.value],
    ['agreedDeposit', input.commercial.agreedDeposit.value],
    ['totalPaid', input.commercial.totalPaid.value],
    ['travelFeeAmount', input.commercial.travelFeeAmount.value],
  ] as const
  for (const [name, amount] of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) issues.push(`Normalized commercial amount ${name} is invalid.`)
  }
  for (const extra of input.extras) {
    if (!Number.isSafeInteger(extra.quantity.value) || extra.quantity.value < 1 || !Number.isSafeInteger(extra.price.value) || extra.price.value < 0) {
      issues.push(`Normalized extra ${extra.id.value} has invalid quantity or price.`)
    }
  }
  return issues
}
export const REVIEW_INSTRUCTIONS = `Review independently. Use the source contract as authority for clauses, scope, and structure; use current input and user answers as authority for transaction facts; apply supplied product rules only where relevant. Natural grammatical variation is allowed. Do not fail because rendered text differs literally from CRM display text, and do not require quote, span, or occurrence provenance. Compare source, authority, rules, candidate, and mechanical diff for material correctness: preservation of unrelated clauses and service scope, correct current facts and payment terms, stale facts, unauthorized additions or removals, and unnecessary CRM enrichment. Focus only on material correctness. PASS only if no material issue exists; otherwise return FAIL with concise material findings. Do not edit or repair. Return only ReviewResponse.`

function isNormalizedFact(value: unknown): value is { value: unknown; source: string; owner?: 'partner1' | 'partner2' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const fact = value as Record<string, unknown>
  const keys = Object.keys(fact)
  return typeof fact.source === 'string' && 'value' in fact
    && keys.every((key) => key === 'value' || key === 'source' || key === 'owner')
    && (fact.owner === undefined || fact.owner === 'partner1' || fact.owner === 'partner2')
}

function normalizedFacts(input: ContractGenerationInput): Array<{ path: string; fact: { value: unknown; source: string; owner?: 'partner1' | 'partner2' } }> {
  const found: Array<{ path: string; fact: { value: unknown; source: string; owner?: 'partner1' | 'partner2' } }> = []
  const visit = (value: unknown, path: string) => {
    if (isNormalizedFact(value)) {
      found.push({ path, fact: value })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key)
    }
  }
  visit(input, '')
  return found
}

function validateNormalizedDerivedFacts(input: ContractGenerationInput): string[] {
  const issues: string[] = []
  const { commercial } = input
  const checks = [
    ['remainingAfterDeposit', commercial.contractValue.value - commercial.agreedDeposit.value, commercial.remainingAfterDeposit.value],
    ['remainingToPayNow', commercial.contractValue.value - commercial.totalPaid.value, commercial.remainingToPayNow.value],
  ] as const
  for (const [name, expected, actual] of checks) {
    if (![expected, actual].every(Number.isFinite) || actual !== expected) {
      issues.push(`Normalized commercial derivation ${name} does not match its authoritative arithmetic.`)
    }
  }
  return issues
}

function candidateIndexForSourceBlock(block: SourceBlock, source: SourceBlock[], insertions: BlockOperation[]): number {
  const sourceBlockById = new Map(source.map((item) => [item.blockId, item]))
  return block.index + insertions.reduce((shift, operation) => {
    if (operation.operation !== 'INSERT_BLOCK_AFTER' && operation.operation !== 'INSERT_BLOCK_BEFORE') return shift
    const anchor = sourceBlockById.get(operation.anchorBlockId)
    if (!anchor || anchor.part !== block.part) return shift
    const movesBlock = operation.operation === 'INSERT_BLOCK_AFTER' ? anchor.index < block.index : anchor.index <= block.index
    return shift + Number(movesBlock)
  }, 0)
}

export function computeChangedBlockDiff(source: SourceBlock[], candidate: SourceBlock[], insertions: BlockOperation[] = []): ChangedBlock[] {
  const candidateById = new Map(candidate.map((block) => [block.blockId, block]))
  const mappedCandidateIds = new Set<string>()
  const changes: ChangedBlock[] = []
  for (const sourceBlock of source) {
    const candidateId = `${sourceBlock.part}#p${candidateIndexForSourceBlock(sourceBlock, source, insertions)}`
    const candidateBlock = candidateById.get(candidateId)
    if (candidateBlock) mappedCandidateIds.add(candidateId)
    if (sourceBlock.text !== (candidateBlock?.text ?? null)) changes.push({ blockRef: sourceBlock.blockId, sourceText: sourceBlock.text, candidateText: candidateBlock?.text ?? null })
  }
  for (const candidateBlock of candidate) if (!mappedCandidateIds.has(candidateBlock.blockId)) changes.push({ blockRef: candidateBlock.blockId, sourceText: null, candidateText: candidateBlock.text })
  return changes
}

function wordFieldInstructions(xml: string): string[] {
  return [
    ...[...xml.matchAll(/<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/g)].map((match) => unescapeXml(match[1]!).trim().replace(/\s+/g, ' ').toUpperCase()),
    ...[...xml.matchAll(/<w:fldSimple\b[^>]*\bw:instr\s*=\s*["']([^"']*)["']/g)].map((match) => unescapeXml(match[1]!).trim().replace(/\s+/g, ' ').toUpperCase()),
  ]
}
function tableStructureSignatures(xml: string): string[] {
  const stack: Array<{ rows: number; cells: number }> = []
  const signatures: string[] = []
  for (const match of xml.matchAll(/<\/?w:(tbl|tr|tc)\b[^>]*>/g)) {
    const tag = match[0]!
    const name = match[1]!
    if (tag.startsWith('</')) {
      if (name === 'tbl') {
        const table = stack.pop()
        if (table) signatures.push(`${table.rows}x${table.cells}`)
      }
    } else if (name === 'tbl') stack.push({ rows: 0, cells: 0 })
    else if (stack.length && name === 'tr') stack.at(-1)!.rows++
    else if (stack.length && name === 'tc') stack.at(-1)!.cells++
  }
  return signatures
}

function wordFieldMarkers(xml: string): string[] {
  return [...xml.matchAll(/<w:fldChar\b[^>]*\bw:fldCharType\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/g)].map((match) => match[1]!)
}

/** Mechanical-only checks for a source-copy candidate produced by block edits. */
export async function validateOptionBCandidate(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  source: SourceDocument,
  candidate: SourceDocument,
  operations: BlockOperation[],
): Promise<string[]> {
  const issues: string[] = []
  let sourceZip: JSZip
  let candidateZip: JSZip
  try {
    [sourceZip, candidateZip] = await Promise.all([JSZip.loadAsync(sourceBytes), JSZip.loadAsync(candidateBytes)])
  } catch {
    return ['Cannot open source or candidate DOCX ZIP package']
  }
  const sourceParts = Object.keys(sourceZip.files).filter((part) => !sourceZip.files[part]?.dir).sort()
  const candidateParts = Object.keys(candidateZip.files).filter((part) => !candidateZip.files[part]?.dir).sort()
  if (!sourceParts.includes('[Content_Types].xml') || !sourceParts.includes('word/document.xml')) issues.push('Source DOCX is missing a required package part.')
  if (JSON.stringify(sourceParts) !== JSON.stringify(candidateParts)) issues.push('DOCX package part set changed.')

  const editablePart = (part: string) => /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(part)
  for (const part of sourceParts) {
    const beforeFile = sourceZip.file(part)
    const afterFile = candidateZip.file(part)
    if (!beforeFile || !afterFile) continue
    if (!editablePart(part)) {
      const [before, after] = await Promise.all([beforeFile.async('uint8array'), afterFile.async('uint8array')])
      if (before.length !== after.length || before.some((byte, index) => byte !== after[index])) issues.push(`Untouched DOCX package part changed: ${part}`)
      continue
    }
    const [before, after] = await Promise.all([beforeFile.async('string'), afterFile.async('string')])
    const insertedInPart = operations.filter((operation) => operation.operation === 'INSERT_BLOCK_AFTER' && source.blocks.find((block) => block.blockId === operation.anchorBlockId)?.part === part).length
    const sourceParagraphs = source.blocks.filter((block) => block.part === part).length
    const candidateParagraphs = candidate.blocks.filter((block) => block.part === part).length
    if (candidateParagraphs !== sourceParagraphs + insertedInPart) issues.push(`Paragraph structure changed unexpectedly: ${part}`)
    if (JSON.stringify(tableStructureSignatures(before)) !== JSON.stringify(tableStructureSignatures(after))) issues.push(`Table row/cell structure changed: ${part}`)
    if (JSON.stringify(wordFieldInstructions(before)) !== JSON.stringify(wordFieldInstructions(after))) issues.push(`Word field instructions changed: ${part}`)
    if (JSON.stringify(wordFieldMarkers(before)) !== JSON.stringify(wordFieldMarkers(after))) issues.push(`Word field structure changed: ${part}`)
  }

  const diff = computeChangedBlockDiff(source.blocks, candidate.blocks, operations)
  if (diff.length !== operations.length) issues.push('Candidate contains an unrequested text change or source block loss.')
  for (const operation of operations) {
    if (operation.operation === 'REPLACE_BLOCK_TEXT') {
      const original = source.blocks.find((block) => block.blockId === operation.blockId)
      const change = diff.find((item) => item.blockRef === operation.blockId)
      if (!original || !change || change.sourceText !== original.text || change.candidateText !== operation.finalText) {
        issues.push(`Requested block replacement was not applied exactly: ${operation.blockId}`)
      }
    } else if (operation.operation === 'INSERT_BLOCK_AFTER') {
      if (!diff.some((item) => item.sourceText === null && item.candidateText === operation.finalText)) {
        issues.push(`Requested block insertion was not applied exactly: ${operation.anchorBlockId}`)
      }
    } else issues.push('Option B does not permit deleting source blocks.')
  }
  return issues
}

/** Apply one validated generation response to a copy of the source DOCX. */
export async function applyOptionBGenerationResponse(
  sourceBytes: ArrayBuffer,
  source: SourceDocument,
  input: ContractGenerationInput,
  sourceBlockIds: Map<string, string>,
  response: unknown,
): Promise<OptionBGenerationResult> {
  if (!isGenerationResponse(response)) return { status: 'FAILED', issues: ['Generation response does not match the strict Option B protocol.'] }
  if (response.status === 'MISSING_INPUT') return { status: 'MISSING_INPUT', missingInputs: response.missingInputs }
  if (response.status === 'CONFLICT_INPUT') return { status: 'CONFLICT_INPUT', conflicts: response.conflicts }

  const inputIssues = validateOptionBInput(input)
  if (inputIssues.length) return { status: 'FAILED', issues: inputIssues }
  const sourceBlocksById = new Map(source.blocks.map((block) => [block.blockId, block]))
  const seenReplacementTargets = new Set<string>()
  const operations: BlockOperation[] = []
  for (const edit of response.edits) {
    const sourceBlockId = sourceBlockIds.get(edit.blockId)
    if (!sourceBlockId || !sourceBlocksById.has(sourceBlockId)) return { status: 'FAILED', issues: [`Unknown generation block ID: ${edit.blockId}`] }
    if (edit.kind === 'replace') {
      if (seenReplacementTargets.has(sourceBlockId)) return { status: 'FAILED', issues: [`Duplicate replacement target: ${edit.blockId}`] }
      seenReplacementTargets.add(sourceBlockId)
      operations.push({ operation: 'REPLACE_BLOCK_TEXT', blockId: sourceBlockId, finalText: edit.text })
    } else {
      operations.push({ operation: 'INSERT_BLOCK_AFTER', anchorBlockId: sourceBlockId, styleSourceBlockId: sourceBlockId, finalText: edit.text })
    }
  }

  let candidateBytes: ArrayBuffer
  let candidate: SourceDocument
  try {
    candidateBytes = await applyBlockOperations(sourceBytes, operations)
    candidate = await readSource(candidateBytes, source.fileName)
  } catch (error) {
    return { status: 'FAILED', issues: [error instanceof Error ? error.message : 'Unable to safely apply block edits to the source DOCX.'] }
  }
  const findings = await validateOptionBCandidate(sourceBytes, candidateBytes, source, candidate, operations)
  if (findings.length) return { status: 'FAILED', issues: findings }
  return {
    status: 'READY', candidateBytes, candidate, edits: response.edits,
    changedBlocks: computeChangedBlockDiff(source.blocks, candidate.blocks, operations),
  }
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<SourceDocument> {
  return { fileName, blocks: await (await import('./blockDocxEditor')).buildBlockIndex(bytes) }
}

export function formatPlnInteger(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('PLN amount must be a non-negative safe integer')
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`
}
export function moneyAmountsInGrosz(text: string): number[] {
  const amounts: number[] = []
  for (const match of text.matchAll(/(?<![\p{L}\p{N}])((?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.]\d{2})?)\s*zł(?![\p{L}\p{N}])/giu)) {
    const [whole, fractional = '00'] = match[1]!.replace(/[\s\u00a0\u202f]/g, '').split(/[,.]/)
    const integer = Number(whole); const cents = Number(fractional)
    if (Number.isSafeInteger(integer) && Number.isInteger(cents)) amounts.push(integer * 100 + cents)
  }
  return amounts
}
export function normalizeAuthoritativePlnText(text: string, amounts: number[]): string {
  const authoritative = new Set(amounts)
  return text.replace(/(^|[^\p{L}\p{N}])(\d[\d\s\u00a0\u202f]*)\s*zł(?![\p{L}\p{N}])/giu, (token, boundary: string, digits: string) => {
    const amount = Number(digits.replace(/[\s\u00a0\u202f]/g, ''))
    return authoritative.has(amount) ? `${boundary}${formatPlnInteger(amount)}` : token
  })
}
export function normalizeAuthoritativeFinancialBlocks<T extends { text: string }>(blocks: T[], amounts: number[]): Array<{ block: T; text: string }> {
  return blocks.flatMap((block) => { const text = normalizeAuthoritativePlnText(block.text, [...new Set(amounts)]); return text === block.text ? [] : [{ block, text }] })
}
