import JSZip from 'jszip'
import { applyBlockOperations, type BlockOperation, type EditableBlock } from './blockDocxEditor'
import { escapeXml, unescapeXml } from '@/features/documents/template/canonicalParagraph'

export type MissingInput = { id: string; label: string; explanation: string; inputType: 'text' | 'date' | 'number'; required: true; sourceContext: string; infoText?: string; sourceRefs?: string[] }
export type SourceBlock = EditableBlock
export type DocumentPropertyText = { part: string; property: string; text: string }
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
  sourceDocument: { fileName: string; blocks: SourceBlock[]; documentProperties?: DocumentPropertyText[] }
  wedding: WeddingFacts
  packagePolicy: { preserveSourcePackageExactly: true }
  extras: string[]
  financials: { contractValuePln: number; depositPln: number; remainingPln: number }
  deterministicDerivedFacts: Array<{ ref: string; value: string; operation: 'subtract'; inputRefs: string[] }>
  userProvidedAnswers: Array<{ id: string; value: string }>
}
export type SourceInventoryItem = { value: string; sourceRefs: string[]; label: string }
export type SourceInventory = { items: SourceInventoryItem[] }
export type FactAuthority = { kind: 'crm' | 'user' | 'generation_date' | 'derived'; ref: string }
export type FactChange = { label: string; oldValues: string[]; newValue: string; authority: FactAuthority; sourceRefs: string[] }
export type RetainedLiteral = { value: string; reason: string }
export type PlannerResponseStatus = 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'READY'
export type PlanResult = { status: PlannerResponseStatus; missingInputs: MissingInput[]; conflicts: ConflictInput[]; factChanges: FactChange[]; retainedLiterals: RetainedLiteral[]; operations: BlockOperation[] }
export type ReviewResult = { status: 'PASS' } | { status: 'FAIL'; issues: string[] }
export type ConflictInput = { id: string; field: string; label: string; explanation: string; inputType: 'date' | 'text' | 'number'; currentValue?: string; relatedValues?: Array<{ label: string; value: string }>; required: true }
export type ChangedBlock = { blockRef: string; sourceText: string | null; candidateText: string | null }
export type GenerationResult = { status: 'MISSING_INPUT'; missingInputs: MissingInput[] } | { status: 'CONFLICT_INPUT'; conflicts: ConflictInput[] } | { status: 'FAILED'; issues: string[] } | { status: 'COMPLETED'; docxBytes: ArrayBuffer; review: ReviewResult }
export interface ContractAi {
  inventory(source: GenerationInput['sourceDocument']): Promise<SourceInventory>
  plan(input: GenerationInput, inventory: SourceInventory): Promise<PlanResult>
  review(args: { source: GenerationInput['sourceDocument']; input: GenerationInput; inventory: SourceInventory; factChanges: FactChange[]; retainedLiterals: RetainedLiteral[]; candidate: SourceBlock[]; changedBlocks: ChangedBlock[] }): Promise<ReviewResult>
}
export async function runSourceInventory(source: GenerationInput['sourceDocument'], ai: Pick<ContractAi, 'inventory'>): Promise<SourceInventory> {
  return ai.inventory(source)
}

export const SOURCE_INVENTORY_INSTRUCTIONS = `Inspect this source contract without receiving or inferring any new client or wedding data. Identify literal values that appear specific to this source agreement or event. Return only items with the exact literal value, supported sourceRefs, and a short free-form label. Inspect body paragraphs, tables, headers, footers, and supplied textual document properties. Do not infer replacements, request information, or make generation decisions. The label is descriptive text only.`
export const TRANSFORMATION_INSTRUCTIONS = `Use the source, source inventory, authoritative CRM input, user answers, and product rules to understand the contract. For every relevant inventory item, either declare a factChange with the exact old literal, exact authoritative new value and source refs, retain it with a free-form reason, or report every missing required value. Complete a full-document and full-inventory sweep before responding. Do not stop after the first missing input. If missingInputs is non-empty, return MISSING_INPUT and no operations. If a conflict exists, return CONFLICT_INPUT and no operations. Return READY only with no unresolved required input or conflict. Use only these semantic declarations: missingInputs, factChanges, retainedLiterals; operations remain the existing safe block operations. Authority kinds are provenance only: crm, user, generation_date, derived. Labels and reasons are free text and have no machine meaning. CRM/user values must be supported by the named authority reference. Derived values must use declared authoritative inputs and arithmetic. Apply the existing product rule: CRM supplies total, reservation/deposit and aggregate remainder only; if source semantics require a detailed allocation not present in authoritative input or user answers, report MISSING_INPUT instead of inferring amounts. Preserve source legal meaning and package/service scope. Use generationDate for a source conclusion date when applicable; preserve the source conclusion place under current product rules. The AI decides which source facts have those meanings. Operations must target supported source blocks and provide complete final text.`
export const REVIEW_INSTRUCTIONS = `Independently review source and candidate semantics using the source inventory, authoritative input, user answers, planner factChanges, retainedLiterals, and the mechanical changed-block diff. Decide whether the correct person's values were assigned, payment meanings/deadlines remain correct, legal meaning and package scope are preserved, stale source-specific facts were incorrectly retained, anything was invented, any required input was missed, and signature roles remain correct. Labels and reasons are context only. Return PASS or FAIL with findings. Do not edit or repair the document.`

export function sanitizePlannerOperations(status: PlannerResponseStatus, providerOperations: BlockOperation[] | undefined): { rawOperations: BlockOperation[]; operations: BlockOperation[]; rawOperationCount: number; operationCount: number; discardedOperationCount: number } {
  const rawOperations = providerOperations ?? []
  const operations = status === 'READY' ? rawOperations : []
  return { rawOperations, operations, rawOperationCount: rawOperations.length, operationCount: operations.length, discardedOperationCount: rawOperations.length - operations.length }
}

function normalize(value: string): string { return value.normalize('NFC').replace(/\s+/g, ' ').trim() }
function authorityValue(input: GenerationInput, authority: FactAuthority): string | undefined {
  if (authority.kind === 'generation_date') return authority.ref === 'generationDate' && input.generationDate ? input.generationDate : undefined
  if (authority.kind === 'user') return input.userProvidedAnswers.find((answer) => answer.id === authority.ref)?.value
  if (authority.kind === 'derived') return input.deterministicDerivedFacts.find((fact) => fact.ref === authority.ref)?.value
  if (authority.kind === 'crm') {
    const roots: Record<string, unknown> = { wedding: input.wedding, financials: input.financials, extras: input.extras }
    const [root, ...path] = authority.ref.split('.')
    let value: unknown = roots[root ?? '']
    for (const segment of path) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
  }
  return undefined
}

function numericLiteral(value: string): number | undefined {
  const clean = value.normalize('NFC').replace(/\s/g, '').replace(/(?:PLN|zł)$/iu, '').replace(',', '.')
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : undefined
}
function authoritativeValueMatches(declared: string, authoritative: string): boolean {
  if (normalize(declared) === normalize(authoritative)) return true
  const moneyOnly = (value: string): number | undefined => {
    const match = value.normalize('NFC').trim().match(/^(\d[\d \u00a0\u202f]*(?:[,.]\d{2})?)\s*(?:PLN|zł)$/iu)
    if (!match) return undefined
    return moneyAmountsInGrosz(`${match[1]} zł`)[0]
  }
  const declaredMoney = moneyOnly(declared)
  const authoritativeMoney = moneyOnly(authoritative)
  return declaredMoney !== undefined && authoritativeMoney !== undefined && declaredMoney === authoritativeMoney
}
function literalOccurs(text: string, value: string): boolean {
  const haystack = normalize(text).toLocaleLowerCase('pl-PL')
  const needle = normalize(value).toLocaleLowerCase('pl-PL')
  if (!needle) return false
  let offset = 0
  while ((offset = haystack.indexOf(needle, offset)) >= 0) {
    const before = offset === 0 ? '' : Array.from(haystack.slice(0, offset)).at(-1) ?? ''
    const after = Array.from(haystack.slice(offset + needle.length))[0] ?? ''
    const wordChar = (character: string) => /[\p{L}\p{N}_]/u.test(character)
    const startsWord = wordChar(Array.from(needle)[0] ?? '')
    const endsWord = wordChar(Array.from(needle).at(-1) ?? '')
    if ((!startsWord || !wordChar(before)) && (!endsWord || !wordChar(after))) return true
    offset += needle.length
  }
  if (!/zł\b/iu.test(value)) return false
  const expected = moneyAmountsInGrosz(value)
  return expected.length > 0 && expected.every((amount) => moneyAmountsInGrosz(text).includes(amount))
}

function validateDerivedFacts(input: GenerationInput): string[] {
  const issues: string[] = []
  for (const fact of input.deterministicDerivedFacts) {
    if (fact.operation !== 'subtract' || fact.inputRefs.length < 2) { issues.push(`Unsupported arithmetic derivation: ${fact.ref}`); continue }
    const values = fact.inputRefs.map((ref) => {
      const [kind, ...parts] = ref.split(':')
      if (kind === 'crm') return authorityValue(input, { kind: 'crm', ref: parts.join(':') })
      if (kind === 'user') return authorityValue(input, { kind: 'user', ref: parts.join(':') })
      return undefined
    })
    const numbers = values.map((value) => value === undefined ? undefined : numericLiteral(value))
    if (numbers.some((value) => value === undefined)) { issues.push(`Derived value ${fact.ref} uses an unsupported operand.`); continue }
    const expected = numbers.slice(1).reduce<number>((result, value) => result - (value ?? 0), numbers[0]!)
    if (numericLiteral(fact.value) !== expected) issues.push(`Derived value ${fact.ref} does not match its declared arithmetic.`)
  }
  return issues
}

export function validateAuthorityGate(input: GenerationInput, inventory: SourceInventory, plan: PlanResult): string[] {
  const issues = validateDerivedFacts(input)
  const sourceRefs = new Set(findTextLocations(input.sourceDocument).map((item) => item.ref))
  for (const item of inventory.items) {
    if (!normalize(item.value)) issues.push('Source inventory contains an empty literal value.')
    if (!item.sourceRefs.length || item.sourceRefs.some((ref) => !sourceRefs.has(ref))) issues.push(`Inventory item has an unsupported source reference: ${item.value}`)
    if (!item.sourceRefs.some((ref) => findTextLocations(input.sourceDocument).some((location) => location.ref === ref && literalOccurs(location.text, item.value)))) {
      issues.push(`Inventory literal is not present at its declared source reference: ${item.value}`)
    }
  }
  if (plan.status !== 'READY') {
    if (plan.operations.length) issues.push(`${plan.status} plan contains executable operations.`)
    if (plan.status === 'MISSING_INPUT' && !plan.missingInputs.length) issues.push('MISSING_INPUT plan has no missingInputs.')
    if (plan.status === 'CONFLICT_INPUT' && !plan.conflicts.length) issues.push('CONFLICT_INPUT plan has no conflicts.')
    return issues
  }
  if (plan.missingInputs.length || plan.conflicts.length) issues.push('READY plan contains unresolved inputs or conflicts.')
  const dispositionChanges: FactChange[] = []
  const retained = new Set(plan.retainedLiterals.map((item) => normalize(item.value)))
  for (const change of plan.factChanges) {
    if (!normalize(change.newValue)) issues.push(`Fact change has an empty new literal: ${change.label}`)
    if (!change.sourceRefs.length || change.sourceRefs.some((ref) => !sourceRefs.has(ref))) issues.push(`Fact change has an unsupported source reference: ${change.label}`)
    for (const oldValue of change.oldValues) if (!change.sourceRefs.some((ref) => findTextLocations(input.sourceDocument).some((location) => location.ref === ref && literalOccurs(location.text, oldValue)))) {
      issues.push(`Declared old literal is not present at its source reference: ${oldValue}`)
    }
    const authoritative = authorityValue(input, change.authority)
    if (authoritative === undefined) { issues.push(`Invalid authority reference for “${change.label}”: ${change.authority.kind}:${change.authority.ref}`); continue }
    if (!normalize(authoritative)) { issues.push(`Authority for “${change.label}” resolves to an empty value.`); continue }
    if (!authoritativeValueMatches(change.newValue, authoritative)) {
      issues.push(`New literal for “${change.label}” does not match its declared authority.`)
    }
    dispositionChanges.push(change)
  }
  for (const item of inventory.items) {
    const matchingChange = dispositionChanges.find((change) => change.oldValues.some((value) => normalize(value) === normalize(item.value)) && change.sourceRefs.some((ref) => item.sourceRefs.includes(ref)))
    if (!retained.has(normalize(item.value)) && !matchingChange) issues.push(`Source inventory literal has no planner disposition: ${item.value}`)
  }
  return issues
}

function validateOperationTargets(blocks: SourceBlock[], operations: BlockOperation[]): string[] {
  const known = new Set(blocks.map((block) => block.blockId))
  const changed = new Set<string>()
  const issues: string[] = []
  for (const raw of operations as unknown[]) {
    if (!raw || typeof raw !== 'object' || !('operation' in raw)) { issues.push('Malformed block operation.'); continue }
    const operation = raw as BlockOperation
    if (!['REPLACE_BLOCK_TEXT', 'INSERT_BLOCK_AFTER', 'INSERT_BLOCK_BEFORE', 'DELETE_BLOCK'].includes(operation.operation)) { issues.push('Unsupported block operation.'); continue }
    if ('finalText' in operation && typeof operation.finalText !== 'string') { issues.push('Block operation finalText must be a string.'); continue }
    const targets = 'blockId' in operation ? [operation.blockId] : [operation.anchorBlockId, operation.styleSourceBlockId]
    for (const target of targets) if (typeof target !== 'string' || !known.has(target)) issues.push(`Unknown block operation target: ${String(target)}`)
    const primary = 'blockId' in operation ? operation.blockId : operation.anchorBlockId
    if (changed.has(primary)) issues.push(`Duplicate block operation target: ${primary}`)
    changed.add(primary)
  }
  return issues
}

function findTextLocations(document: GenerationInput['sourceDocument']): Array<{ ref: string; text: string }> {
  return [
    ...document.blocks.map((block) => ({ ref: block.blockId, text: block.text })),
    ...(document.documentProperties ?? []).map((property) => ({ ref: `${property.part}#${property.property}`, text: property.text })),
  ]
}

export function computeChangedBlockDiff(source: SourceBlock[], candidate: SourceBlock[]): ChangedBlock[] {
  const left = new Map(source.map((block) => [block.blockId, block.text]))
  const right = new Map(candidate.map((block) => [block.blockId, block.text]))
  return [...new Set([...left.keys(), ...right.keys()])].flatMap((blockRef) => {
    const sourceText = left.get(blockRef) ?? null
    const candidateText = right.get(blockRef) ?? null
    return sourceText === candidateText ? [] : [{ blockRef, sourceText, candidateText }]
  })
}

function xmlWithTextValuesMasked(xml: string): string { return xml.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, '$1__TEXT__$2') }
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

async function readDocumentProperties(bytes: ArrayBuffer): Promise<DocumentPropertyText[]> {
  const zip = await JSZip.loadAsync(bytes)
  const core = zip.file('docProps/core.xml')
  if (!core) return []
  const xml = await core.async('string')
  return [...xml.matchAll(/<([\w.-]+(?::[\w.-]+)?)\b[^>]*>([^<>]*)<\/\1\s*>/g)].flatMap((match) => {
    const text = unescapeXml(match[2]!).trim()
    return text ? [{ part: 'docProps/core.xml', property: match[1]!.split(':').at(-1)!, text }] : []
  })
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<GenerationInput['sourceDocument']> {
  const [blocks, documentProperties] = await Promise.all([(await import('./blockDocxEditor')).buildBlockIndex(bytes), readDocumentProperties(bytes)])
  return { fileName, blocks, documentProperties }
}

export function makeInput(args: Omit<GenerationInput, 'financials' | 'deterministicDerivedFacts'>): GenerationInput {
  const total = args.wedding.contractValuePln
  const deposit = args.wedding.depositPln
  const remaining = total - deposit
  if (![total, deposit, remaining].every(Number.isSafeInteger) || remaining < 0) throw new Error('Contract arithmetic is invalid')
  const base: GenerationInput = { ...args, financials: { contractValuePln: total, depositPln: deposit, remainingPln: remaining }, deterministicDerivedFacts: [] }
  return { ...base, deterministicDerivedFacts: [{ ref: 'financials.remainingPln', value: String(remaining), operation: 'subtract', inputRefs: ['crm:financials.contractValuePln', 'crm:financials.depositPln'] }] }
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
function replaceLiteralInXml(xml: string, oldValue: string, newValue: string): string {
  const escaped = escapeXml(oldValue)
  return xml.replaceAll(escaped, escapeXml(newValue))
}
export async function applyMetadataFactChanges(bytes: ArrayBuffer, changes: FactChange[]): Promise<ArrayBuffer> {
  const replacements = changes.flatMap((change) => change.oldValues.filter((oldValue) => normalize(oldValue) !== normalize(change.newValue)).map((oldValue) => ({ oldValue, newValue: change.newValue })))
  if (!replacements.length) return bytes
  const zip = await JSZip.loadAsync(bytes)
  const path = 'docProps/core.xml'
  const file = zip.file(path)
  if (!file) return bytes
  let xml = await file.async('string')
  for (const replacement of replacements) xml = replaceLiteralInXml(xml, replacement.oldValue, replacement.newValue)
  zip.file(path, xml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

export async function validateCandidate(sourceBytes: ArrayBuffer, candidateBytes: ArrayBuffer, input: GenerationInput, inventory: SourceInventory, plan: PlanResult, approvedOperations: BlockOperation[] = []): Promise<string[]> {
  const issues: string[] = []
  issues.push(...validateAuthorityGate(input, inventory, plan))
  let sourceZip: JSZip; let candidateZip: JSZip
  try { sourceZip = await JSZip.loadAsync(sourceBytes); candidateZip = await JSZip.loadAsync(candidateBytes) } catch { return ['Cannot open DOCX ZIP package'] }
  let source: GenerationInput['sourceDocument']; let candidate: GenerationInput['sourceDocument']
  try { [source, candidate] = await Promise.all([readSource(sourceBytes, 'source.docx'), readSource(candidateBytes, 'candidate.docx')]) } catch { return ['DOCX XML or document structure is invalid'] }
  issues.push(...validateOperationTargets(source.blocks, approvedOperations))
  const sourcePackageParts = Object.keys(sourceZip.files).filter((part) => !sourceZip.files[part]?.dir).sort()
  const candidatePackageParts = Object.keys(candidateZip.files).filter((part) => !candidateZip.files[part]?.dir).sort()
  if (JSON.stringify(sourcePackageParts) !== JSON.stringify(candidatePackageParts)) issues.push('DOCX package part set changed')
  const permittedTextParts = new Set(['word/document.xml', 'docProps/core.xml', ...sourcePackageParts.filter((part) => /^word\/(?:header\d+|footer\d+)\.xml$/.test(part))])
  for (const part of sourcePackageParts) {
    if (permittedTextParts.has(part)) continue
    const before = await sourceZip.file(part)!.async('uint8array')
    const after = await candidateZip.file(part)?.async('uint8array')
    if (!after || before.length !== after.length || before.some((byte, index) => byte !== after[index])) issues.push(`Untouched DOCX package part changed: ${part}`)
  }
  const expectedMetadataBytes = await applyMetadataFactChanges(sourceBytes, plan.factChanges)
  const expectedMetadataZip = await JSZip.loadAsync(expectedMetadataBytes)
  const expectedCore = await expectedMetadataZip.file('docProps/core.xml')?.async('string')
  const actualCore = await candidateZip.file('docProps/core.xml')?.async('string')
  if (expectedCore !== actualCore) issues.push('Document properties contain a change outside declared literal replacements')
  const changedIds = new Set(approvedOperations.flatMap((operation) => 'blockId' in operation ? [operation.blockId] : []))
  for (const block of source.blocks) {
    if (changedIds.has(block.blockId)) continue
    const counterpart = candidate.blocks.find((item) => item.blockId === block.blockId)
    if (!counterpart || counterpart.text !== block.text) issues.push(`Untouched block changed: ${block.blockId}`)
  }
  const allText = [...findTextLocations(candidate).map((item) => item.text)]
  const retained = new Set(plan.retainedLiterals.map((item) => normalize(item.value)))
  for (const item of inventory.items) {
    const replaced = plan.factChanges.some((change) => change.oldValues.some((value) => normalize(value) === normalize(item.value)) && change.sourceRefs.some((ref) => item.sourceRefs.includes(ref)))
    if (!retained.has(normalize(item.value)) && !replaced) issues.push(`Inventory item has no final disposition: ${item.value}`)
  }
  for (const change of plan.factChanges) {
    for (const oldValue of change.oldValues) if (!literalOccurs(change.newValue, oldValue) && allText.some((text) => literalOccurs(text, oldValue))) issues.push(`Declared old literal remains: ${oldValue}`)
    if (!allText.some((text) => literalOccurs(text, change.newValue))) issues.push(`Declared new literal is absent: ${change.newValue}`)
  }
  const partPaths = (zip: JSZip) => Object.keys(zip.files).filter((part) => /^word\/(?:header\d+|footer\d+|styles|numbering)\.xml$/.test(part)).sort()
  const sourcePaths = partPaths(sourceZip); const candidatePaths = partPaths(candidateZip)
  if (JSON.stringify(sourcePaths) !== JSON.stringify(candidatePaths)) issues.push('Header, footer, style, or numbering part set changed')
  for (const part of sourcePaths) {
    const left = await sourceZip.file(part)!.async('string'); const right = await candidateZip.file(part)?.async('string')
    if (!right) continue
    if (part === 'word/styles.xml' || part === 'word/numbering.xml') { if (left !== right) issues.push(`Unexpected structural part change: ${part}`); continue }
    if (xmlWithTextValuesMasked(left) !== xmlWithTextValuesMasked(right)) issues.push(`Unexpected header/footer XML structure change: ${part}`)
    if (JSON.stringify(wordFieldInstructions(left)) !== JSON.stringify(wordFieldInstructions(right))) issues.push(`Word field instructions changed: ${part}`)
  }
  const sourceDoc = await sourceZip.file('word/document.xml')?.async('string')
  const candidateDoc = await candidateZip.file('word/document.xml')?.async('string')
  if (!sourceDoc || !candidateDoc) issues.push('Main Word document part is missing')
  else for (const tag of ['tbl', 'tr', 'tc'] as const) {
    const count = (xml: string) => xml.match(new RegExp(`<w:${tag}\\b`, 'g'))?.length ?? 0
    if (count(sourceDoc) !== count(candidateDoc)) issues.push(`Table structure changed (${tag}: ${count(sourceDoc)} → ${count(candidateDoc)})`)
  }
  if (sourceDoc && candidateDoc && JSON.stringify(tableStructureSignatures(sourceDoc)) !== JSON.stringify(tableStructureSignatures(candidateDoc))) issues.push('Per-table row or cell structure changed')
  const sourceFields = sourceDoc ? wordFieldInstructions(sourceDoc) : []
  const candidateFields = candidateDoc ? wordFieldInstructions(candidateDoc) : []
  if (JSON.stringify(sourceFields) !== JSON.stringify(candidateFields)) issues.push('Main document Word field instructions changed')
  if (sourceDoc && candidateDoc) {
    const markers = (xml: string) => [...xml.matchAll(/<w:fldChar\b[^>]*\bw:fldCharType\s*=\s*["']([^"']+)["'][^>]*>/g)].map((match) => match[1])
    if (JSON.stringify(markers(sourceDoc)) !== JSON.stringify(markers(candidateDoc))) issues.push('Main document Word field structure changed')
  }
  for (const operation of approvedOperations) {
    if (operation.operation !== 'REPLACE_BLOCK_TEXT') continue
    const actual = candidate.blocks.find((block) => block.blockId === operation.blockId)
    if (!actual || normalize(actual.text) !== normalize(operation.finalText)) issues.push(`Approved literal replacement was not applied: ${operation.blockId}`)
  }
  return issues
}

export async function runGeneration(sourceBytes: ArrayBuffer, input: GenerationInput, ai: ContractAi): Promise<GenerationResult> {
  const inventory = await runSourceInventory(input.sourceDocument, ai)
  const plan = await ai.plan(input, inventory)
  const safeOperations = sanitizePlannerOperations(plan.status, plan.operations).operations
  const effectivePlan = { ...plan, operations: safeOperations }
  const authorityIssues = validateAuthorityGate(input, inventory, effectivePlan)
  if (authorityIssues.length) return { status: 'FAILED', issues: authorityIssues }
  if (plan.status === 'MISSING_INPUT') return { status: 'MISSING_INPUT', missingInputs: plan.missingInputs }
  if (plan.status === 'CONFLICT_INPUT') return { status: 'CONFLICT_INPUT', conflicts: plan.conflicts }
  const targetIssues = validateOperationTargets(input.sourceDocument.blocks, safeOperations)
  if (targetIssues.length) return { status: 'FAILED', issues: targetIssues }
  const edited = await applyBlockOperations(sourceBytes, safeOperations)
  const candidateBytes = await applyMetadataFactChanges(edited, plan.factChanges)
  const candidateDocument = await readSource(candidateBytes, input.sourceDocument.fileName)
  const candidateIssues = await validateCandidate(sourceBytes, candidateBytes, input, inventory, effectivePlan, safeOperations)
  if (candidateIssues.length) return { status: 'FAILED', issues: candidateIssues }
  const changedBlocks = computeChangedBlockDiff(input.sourceDocument.blocks, candidateDocument.blocks)
  const review = await ai.review({ source: input.sourceDocument, input, inventory, factChanges: plan.factChanges, retainedLiterals: plan.retainedLiterals, candidate: candidateDocument.blocks, changedBlocks })
  if (review.status === 'FAIL') return { status: 'FAILED', issues: review.issues }
  return { status: 'COMPLETED', docxBytes: candidateBytes, review }
}
