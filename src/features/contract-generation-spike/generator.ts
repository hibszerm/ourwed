import JSZip from 'jszip'
import { randomUUID } from 'node:crypto'
import { applyBlockOperations, applyExactTextPatches, type BlockOperation, type EditableBlock, type ExactTextPatch } from './blockDocxEditor'
import { escapeXml, unescapeXml } from '@/features/documents/template/canonicalParagraph'
import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'
import { isPolishPlnAmountEquivalent, parsePlnGrosz } from './polishPlnAmount'
import type { ContractGenerationInput } from './contractGenerationInput'
import { isGenerationResponse, type BlockEdit } from './generationProtocol'

export type MissingInput = { id: string; label: string; explanation: string; inputType: 'text' | 'date' | 'number'; required: true; sourceContext: string; infoText?: string; sourceRefs?: string[]; inventoryItemIds: string[] }
export type SourceBlock = EditableBlock
export type DocumentPropertyText = { part: string; property: string; ref: string; text: string }
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
export type SourceDocument = { fileName: string; blocks: SourceBlock[]; documentProperties?: DocumentPropertyText[] }
export type GenerationInput = {
  generationDate: string
  sourceDocument: SourceDocument
  wedding: WeddingFacts
  packagePolicy: { preserveSourcePackageExactly: true }
  productRules: Record<string, unknown>
  extras: string[]
  financials: { contractValuePln: number; depositPln: number; remainingPln: number }
  deterministicDerivedFacts: Array<{ ref: string; value: string; operation: 'subtract'; inputRefs: string[] }>
  userProvidedAnswers: Array<{ id: string; value: string }>
}
export type SourceInventoryOccurrence = { sourceRef: string; quote: string | null }
export type SourceInventoryItem = { id: string; label: string; conceptId?: string; occurrences: SourceInventoryOccurrence[] }
export type SourceInventory = { items: SourceInventoryItem[]; coveredSourceRefs?: string[] }
export type FactAuthority = { kind: 'crm' | 'user' | 'generation_date' | 'derived'; ref: string } | { kind: 'source'; ref: string }
export type ResolvedAuthorityRef = { value: string; source: string; owner?: 'partner1' | 'partner2' }
export type FactChange = { label: string; inventoryItemIds: string[]; inventoryItemId?: string; sourceRef?: string; expectedSource?: string; sourceProvenance?: { inventoryItemId: string; sourceRef: string; expectedSource: string }; newValue: string; newValueFormat: 'literal' | 'polish_pln_words'; authority: FactAuthority }
export type RetentionAuthority = { kind: 'product_rule' | 'user'; ref: string }
export type RetainedLiteral = { inventoryItemId: string; authority: RetentionAuthority; reason: string }
export type ExtraInsertion = { anchorBlockId: string; styleSourceBlockId: string; extraIds: string[] }
export type PlannerResponseStatus = 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'READY'
export type PlanResult = { status: PlannerResponseStatus; missingInputs: MissingInput[]; conflicts: ConflictInput[]; factChanges: FactChange[]; retainedLiterals: RetainedLiteral[]; operations: BlockOperation[]; extraInsertions?: ExtraInsertion[] }
export type ReviewResult = { status: 'PASS' } | { status: 'FAIL'; issues: string[] }
export type ConflictInput = { id: string; field: string; label: string; explanation: string; inputType: 'date' | 'text' | 'number'; currentValue?: string; relatedValues?: Array<{ label: string; value: string }>; required: true }
export type ChangedBlock = { blockRef: string; sourceText: string | null; candidateText: string | null }
export type GenerationSourceBlock = { blockId: string; kind: EditableBlock['kind']; text: string }
export type GenerationSourceView = { blocks: GenerationSourceBlock[]; sourceBlockIds: Map<string, string> }
export type OptionBGenerationResult =
  | { status: 'MISSING_INPUT'; missingInputs: string[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }
  | { status: 'FAILED'; issues: string[] }
  | { status: 'READY'; candidateBytes: ArrayBuffer; candidate: SourceDocument; edits: BlockEdit[]; changedBlocks: ChangedBlock[] }
export type ResolvedInventoryOccurrence = { itemId: string; sourceRef: string; text: string; start: number; end: number }
export type GenerationResult = { status: 'MISSING_INPUT'; missingInputs: MissingInput[] } | { status: 'CONFLICT_INPUT'; conflicts: ConflictInput[] } | { status: 'FAILED'; issues: string[] } | { status: 'COMPLETED'; docxBytes: ArrayBuffer; review: ReviewResult }
export interface ContractAi {
  inventory(source: SourceDocument): Promise<SourceInventory>
  plan(authorityContext: ContractGenerationInput, inventory: SourceInventory): Promise<PlanResult>
  review(args: { source: SourceDocument; authorityContext: ContractGenerationInput; inventory: SourceInventory; resolvedInventoryOccurrences: ResolvedInventoryOccurrence[]; factChanges: FactChange[]; retainedLiterals: RetainedLiteral[]; candidate: SourceBlock[]; changedBlocks: ChangedBlock[] }): Promise<ReviewResult>
}

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
export async function runSourceInventory(source: SourceDocument, ai: Pick<ContractAi, 'inventory'>): Promise<SourceInventory> {
  return ai.inventory(source)
}

export const SOURCE_INVENTORY_INSTRUCTIONS = `Inspect the complete source contract without receiving or inferring new client or wedding data. The source is a closed world. Return coveredSourceRefs containing every canonical sourceRef from the supplied source index, including every paragraph/block and supplied textual document property examined. Inventory every source-defined instance-specific semantic span that may need a new value or explicit disposition. Each occurrence is an independently patchable atomic slot: create a separate inventory item with exactly one occurrence; never combine distinct slots or reuse one item for multiple occurrences. A patchable occurrence must use an exact quote for the smallest source span that is itself one fact. Never use quote:null for a value replacement. Quote text must be copied exactly, including spaces, punctuation, diacritics, and capitalization. Do not invent offsets, replacement values, or generation decisions. Reusable source clauses may be inventoried as source provenance when a product rule may reuse them. Do not invent inventory items for facts absent from the source. Do not create overlapping occurrences.`
export const TRANSFORMATION_INSTRUCTIONS = `Use the source, source inventory, authoritative CRM input, user answers, and supplied product rules to understand the contract. The uploaded source is a closed world. Inventory occurrences are exact edit-permission spans; never retype old source literals. Each inventory item represents one atomic source occurrence and receives one factChange, one authorized retention, or a missing/conflict disposition. A factChange has exactly one inventoryItemId, one exact sourceRef, and one expectedSource literal equal to the item’s sole non-null quote. Never combine spans, authorities, or prose. Every occurrence is independently patched, even when several occurrences express a related concept. Do not emit ordinary block operations or complete block text. Deterministic code applies validated atomic patches to source text; all text outside those spans remains byte-for-byte/source-equivalent unchanged. For each item either declare its single factChange with an exact authoritative newValue and authority, declare its single retention with an existing product-rule or user authority, or report every missing required value. A free-text retention reason is explanatory only and is never authority. Do not retain old agreement-instance values without an explicit applicable preserve rule or user instruction. Preserve timing and deadline terms already defined by the source contract unless current authoritative input explicitly replaces that timing or creates a conflict. If only a payment amount changes, keep the source-defined timing in the final text and do not request a new timing value. Treat each payment obligation independently. A source-defined relative deadline tied to a defined event, such as within N days after signing, is a complete timing rule; preserve it without requiring an absolute calendar date, asking the user to confirm it, or inventing a signing date for conversion. An authoritative replacement deadline applies only to the same payment obligation; final-payment timing does not replace reservation/deposit timing, and timing for one obligation must not fill or replace another obligation. If the source requires payment timing but supplies none, a genuinely required timing dependency is undefined, or current authority explicitly requires replacing that obligation's timing without supplying the replacement, report MISSING_INPUT. If authoritative sources provide incompatible timing for the same obligation and existing precedence cannot resolve them, report CONFLICT_INPUT. This source-term rule does not authorize retaining stale transaction-specific amounts, identifiers, client facts, addresses, or event dates. If an inventory item combines a value that must change with unchanged source timing, use the current authority for the changed value and preserve the timing text from the source. If a required replacement value is unavailable and no authorized preservation applies, report MISSING_INPUT. Complete a full-document and full-inventory sweep before responding; return all currently discoverable missing inputs together. MISSING_INPUT and CONFLICT_INPUT responses must contain no partial factChanges, retentions, operations, or extraInsertions. READY requires every inventory item to have exactly one valid replacement or authorized retention, with no unresolved input or conflict. A block target alone grants no edit permission. Ordinary text changes require exact atomic patches and cannot be authorized by block operations. Metadata uses the same exact occurrence provenance and a separate deterministic XML edit path. Authority kinds for fact changes are crm, user, generation_date, derived. For crm, set authority.ref to the selected normalized input fact's .source copied byte-for-byte as an opaque identifier. Never construct, shorten, normalize, translate, infer, alias, or add/remove a namespace from an authority ref. For user, copy the exact opaque additionalAnswers id; generation_date uses generationDate; derived may reference commercial.remainingAfterDeposit or commercial.remainingToPayNow, whose arithmetic is checked deterministically. Use only sourceRefs supplied by the source index through inventory occurrences; never invent or repair sourceRefs. Retention authority kinds are product_rule or user, and refs must point to an actual supplied rule or userProvidedAnswer. Set newValueFormat to literal for ordinary text. Use polish_pln_words only when the semantic newValue itself is the written-out rendering of a numeric PLN authority; do not create another factChange just to express a different occurrence format. Code compares a declared written-out PLN value with a deterministic formatter. CRM/user values must match their named authority. Derived values must use declared authoritative inputs and arithmetic; derived operands belong only in the derivation declaration, never source refs. Apply the existing product rule: CRM supplies total, reservation/deposit and aggregate remainder only; if source semantics require a detailed allocation not present in authoritative input or user answers, report MISSING_INPUT instead of inferring amounts. Interpret commercial.contractValue as OurWed's authoritative TOTAL contract value, already composed from package/base value, selected extras, and effective travel. When commercial.travelFeeStatus is charged and commercial.travelFeeAmount is positive, that travel amount is already included in contractValue and must never be added on top or used to recompute a second total. For included or non-charged travel, effective travel contributes zero as a separate component. Selected extras are likewise components of the same authoritative total and must not be added again. If both contractValue and travel status/amount are present, do not ask whether charged travel is included or additional; that relationship is already resolved by OurWed. This rule governs commercial composition only: do not invent a travel clause or exact contract wording when the source has no relevant concept, and a genuinely source-required travel fact absent from normalized authority may still require MISSING_INPUT. Preserve source legal meaning and source-defined base service scope, including its obligations, deliverables, workflow, performance obligations, and service terms, unless an existing authoritative rule independently requires a particular transaction fact to change. Current package name/selection is an authoritative transaction fact and may replace an instance-specific package name or identifier under existing authority rules, but changing package identity does not authorize rewriting source-defined base service obligations. Current package snapshot/items are authoritative only for facts they explicitly state; they do not authorize reconstructing or inferring other obligations, deadlines, editing rules, rights, workflow, quantities, or provider duties from package names, labels, or item titles. A semantic mismatch between current package identity and source service category alone is not MISSING_INPUT or CONFLICT_INPUT and does not require replacement service-scope data. Explicit current extras/additional services are separate authoritative transaction facts and may be added, removed, or updated under existing extras behavior, but do not authorize wholesale reconstruction of unrelated source base scope. Preserve source base obligations unless another existing authority rule independently requires change; genuine unresolved source-required facts and genuine authority conflicts may still require MISSING_INPUT or CONFLICT_INPUT. For explicit current extras that have no source slot, use extraInsertions only: identify each selected extra by its exact normalized extra ID and choose an existing source block as insertion anchor and an existing source block as style source. Do not provide finalText or paraphrased wording; deterministic code renders the exact authoritative extra name and quantity. Existing source slots for extras should instead use ordinary atomic factChanges. Do not insert unrelated CRM fields or invent new contract clauses. Use generationDate for a source conclusion date when applicable; preserve the source conclusion place under current product rules. AI decides which source facts have those meanings. Ignore CRM facts with no source-defined corresponding slot. Do not expand addresses, add contact details, or create new location slots. Preserve source punctuation, quotation marks, whitespace, and surrounding prose. Source-to-source reuse must cite the exact source occurrence and literal, and is permitted only where Inventory explicitly links source and target occurrences under the same concept; deterministic validation checks the exact link and text. Never use invented derived refs for source reuse. Ordinary edits are reconstructed from source plus validated patches, never planner-authored replacement prose.`
export const REVIEW_INSTRUCTIONS = `Independently review source and candidate semantics using the source inventory, deterministic source-grounded occurrence texts, authoritative input, user answers, planner factChanges, retainedLiterals, and the mechanical changed-block diff. Treat resolvedInventoryOccurrences.text as the exact canonical old source text for each item and ref; labels and reasons are context only. Decide whether the correct person's values were assigned, payment meanings/deadlines remain correct, legal meaning and package scope are preserved, stale source-specific facts were incorrectly retained, anything was invented, any required input was missed, and signature roles remain correct. Return PASS or FAIL with findings. Do not edit or repair the document.`

export function buildProductRuleExtraOperations(input: GenerationInput | ContractGenerationInput, source: SourceDocument, insertions: ExtraInsertion[] = [], changes: FactChange[] = []): BlockOperation[] {
  const knownBlocks = new Map(source.blocks.map((block) => [block.blockId, block]))
  const usedIds = new Set<string>()
  const operations: BlockOperation[] = []
  for (const insertion of insertions) {
    const anchor = knownBlocks.get(insertion.anchorBlockId)
    const style = knownBlocks.get(insertion.styleSourceBlockId)
    if (!anchor || !style || anchor.part !== style.part || !insertion.extraIds.length) throw new Error('Product-rule extra insertion has an unsupported source anchor or style source.')
    const rendered: string[] = []
    for (const extraId of insertion.extraIds) {
      if (usedIds.has(extraId)) throw new Error(`Selected extra is inserted more than once: ${extraId}`)
      usedIds.add(extraId)
      let name: string | undefined
      let quantity = 1
      if ('generationContext' in input) {
        const extra = input.extras.find((item) => item.id.value === extraId)
        if (extra) { name = extra.name.value; quantity = extra.quantity.value }
      } else {
        const match = extraId.match(/^legacy-extra-(\d+)$/)
        const index = match ? Number(match[1]) - 1 : -1
        if (index >= 0 && index < input.extras.length) name = input.extras[index]
      }
      if (!name?.trim() || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`Selected extra has no exact renderable authority: ${extraId}`)
      rendered.push(quantity === 1 ? name : `${name} × ${quantity}`)
    }
    operations.push({ anchorBlockId: insertion.anchorBlockId, operation: 'INSERT_BLOCK_AFTER', styleSourceBlockId: insertion.styleSourceBlockId, finalText: rendered.join(' · ') })
  }
  if ('generationContext' in input) {
    for (const extra of input.extras) {
      const representedBySourcePatch = changes.some((change) => change.authority.kind === 'crm' && change.authority.ref === extra.name.source && declaredValueMatches(change, authorityText(extra.name.value) ?? ''))
      if (!usedIds.has(extra.id.value) && !representedBySourcePatch) throw new Error(`Current selected extra has no source patch or bounded product-rule insertion: ${extra.id.value}`)
    }
  } else {
    for (let index = 0; index < input.extras.length; index++) if (!usedIds.has(`legacy-extra-${index + 1}`)) throw new Error(`Current selected extra has no bounded product-rule insertion: legacy-extra-${index + 1}`)
  }
  return operations
}

export function sanitizePlannerOperations(status: PlannerResponseStatus, providerOperations: BlockOperation[] | undefined): { rawOperations: BlockOperation[]; operations: BlockOperation[]; rawOperationCount: number; operationCount: number; discardedOperationCount: number } {
  const rawOperations = providerOperations ?? []
  const operations = status === 'READY' ? rawOperations : []
  return { rawOperations, operations, rawOperationCount: rawOperations.length, operationCount: operations.length, discardedOperationCount: rawOperations.length - operations.length }
}

function normalize(value: string): string { return value.normalize('NFC').replace(/\s+/g, ' ').trim() }
function canonicalLegacyAuthorityRef(authority: FactAuthority): boolean {
  if (authority.kind === 'source') return false
  if (!authority.ref || authority.ref.includes(':')) return false
  if (authority.kind === 'generation_date') return authority.ref === 'generationDate'
  if (authority.kind === 'crm') return /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(authority.ref)
  return /^[^\s:]+(?:\.[^\s:]+)*$/.test(authority.ref)
}

function legacyAuthorityValue(input: GenerationInput, authority: FactAuthority): string | undefined {
  if (!canonicalLegacyAuthorityRef(authority)) return undefined
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

function authorityText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  try { return JSON.stringify(value) } catch { return undefined }
}

function canonicalNormalizedAuthorityRef(authority: FactAuthority): boolean {
  return authority.ref.length > 0 && authority.ref === authority.ref.trim()
    && !authority.ref.includes(':') && !Array.from(authority.ref).some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f)
    && (authority.kind !== 'generation_date' || authority.ref === 'generationDate')
}

/** Resolve canonical references only against exact normalized provenance or opaque answer IDs. */
export function resolveAuthorityRef(input: ContractGenerationInput, authority: FactAuthority): ResolvedAuthorityRef | undefined {
  if (authority.kind === 'source') return undefined
  if (!canonicalNormalizedAuthorityRef(authority)) return undefined
  if (authority.kind === 'generation_date') {
    const fact = input.generationContext.generationDate
    const value = authorityText(fact.value)
    return value === undefined ? undefined : { value, source: fact.source }
  }
  if (authority.kind === 'user') {
    const matches = input.additionalAnswers.filter((answer) => answer.id === authority.ref && answer.authority === 'user')
    if (matches.length !== 1) return undefined
    const answer = matches[0]!
    return { value: answer.value, source: answer.source }
  }
  if (authority.kind === 'derived') {
    // These two structural refs are the adapter's explicitly named arithmetic facts.
    const fact = authority.ref === 'commercial.remainingAfterDeposit'
      ? input.commercial.remainingAfterDeposit
      : authority.ref === 'commercial.remainingToPayNow'
        ? input.commercial.remainingToPayNow
        : undefined
    if (!fact) return undefined
    const value = authorityText(fact.value)
    return value === undefined ? undefined : { value, source: fact.source }
  }
  const matches = normalizedFacts(input).filter(({ path, fact }) => path !== 'generationContext.generationDate' && fact.source === authority.ref)
  if (matches.length !== 1) return undefined
  const resolved = matches[0]!
  const value = authorityText(resolved.fact.value)
  return value === undefined ? undefined : {
    value,
    source: resolved.fact.source,
    ...(resolved.fact.owner ? { owner: resolved.fact.owner } : {}),
  }
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

function numericLiteral(value: string): number | undefined {
  const amount = parsePlnGrosz(value)
  return amount === undefined ? undefined : amount / 100
}
function authoritativeValueMatches(declared: string, authoritative: string): boolean {
  if (normalize(declared) === normalize(authoritative)) return true
  const declaredDate = parseFlexibleDate(declared)
  const authoritativeDate = parseFlexibleDate(authoritative)
  if (declaredDate && authoritativeDate) return declaredDate === authoritativeDate
  const declaredMoney = parsePlnGrosz(declared)
  const authoritativeMoney = parsePlnGrosz(authoritative)
  return declaredMoney !== undefined && authoritativeMoney !== undefined && declaredMoney === authoritativeMoney
}
function declaredValueMatches(change: FactChange, authoritative: string): boolean {
  if (change.newValueFormat === 'polish_pln_words') {
    return isPolishPlnAmountEquivalent(authoritative, change.newValue)
  }
  return authoritativeValueMatches(change.newValue, authoritative)
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

function dateEquivalentOccurs(text: string, declared: string): boolean {
  const expected = parseFlexibleDate(declared)
  if (!expected) return false
  const words = normalize(text).split(' ')
  for (let start = 0; start < words.length; start++) {
    for (let length = 1; length <= 5 && start + length <= words.length; length++) {
      if (parseFlexibleDate(words.slice(start, start + length).join(' ')) === expected) return true
    }
  }
  return false
}

/** Return true/false only when candidate text exposes a mechanical date or PLN representation. */
function mechanicallyContainsDeclaredValue(text: string, declared: string): boolean | undefined {
  if (literalOccurs(text, declared)) return true
  if (parseFlexibleDate(declared)) return dateEquivalentOccurs(text, declared)
  const expectedMoney = parsePlnGrosz(declared)
  const candidateMoney = moneyAmountsInGrosz(text)
  if (expectedMoney !== undefined && candidateMoney.length > 0) return candidateMoney.includes(expectedMoney)
  return undefined
}

function validateDerivedFacts(input: GenerationInput): string[] {
  const issues: string[] = []
  for (const fact of input.deterministicDerivedFacts) {
    if (fact.operation !== 'subtract' || fact.inputRefs.length < 2) { issues.push(`Unsupported arithmetic derivation: ${fact.ref}`); continue }
    const values = fact.inputRefs.map((ref) => {
      const [kind, ...parts] = ref.split(':')
      if (kind === 'crm') return legacyAuthorityValue(input, { kind: 'crm', ref: parts.join(':') })
      if (kind === 'user') return legacyAuthorityValue(input, { kind: 'user', ref: parts.join(':') })
      return undefined
    })
    const numbers = values.map((value) => value === undefined ? undefined : numericLiteral(value))
    if (numbers.some((value) => value === undefined)) { issues.push(`Derived value ${fact.ref} uses an unsupported operand.`); continue }
    const expected = numbers.slice(1).reduce<number>((result, value) => result - (value ?? 0), numbers[0]!)
    if (numericLiteral(fact.value) !== expected) issues.push(`Derived value ${fact.ref} does not match its declared arithmetic.`)
  }
  return issues
}

function codePointSlice(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join('')
}

export function resolveInventoryOccurrences(source: SourceDocument, inventory: SourceInventory): { occurrences: ResolvedInventoryOccurrence[]; findings: string[] } {
  const locations = findTextLocations(source)
  const byRef = new Map(locations.map((location) => [location.ref, location.text]))
  const findings: string[] = []
  const resolved: ResolvedInventoryOccurrence[] = []
  const itemIds = new Set<string>()
  const rangesByRef = new Map<string, Array<{ start: number; end: number; itemId: string }>>()
  for (const item of inventory.items) {
    if (!item.id.trim() || itemIds.has(item.id)) findings.push(`Source inventory item id is empty or duplicated: ${item.id}`)
    itemIds.add(item.id)
    if (!item.label.trim()) findings.push(`Source inventory item ${item.id} has an empty label.`)
    if (!item.occurrences.length) findings.push(`Source inventory item ${item.id} has no occurrences.`)
    for (const occurrence of item.occurrences) {
      const sourceText = byRef.get(occurrence.sourceRef)
      if (sourceText === undefined || occurrence.sourceRef.includes(':')) {
        findings.push(`Source inventory item ${item.id} has an unsupported source reference: ${occurrence.sourceRef}`)
        continue
      }
      const length = Array.from(sourceText).length
      let start = 0
      let end = length
      if (occurrence.quote !== null) {
        if (typeof occurrence.quote !== 'string' || !occurrence.quote.length) {
          findings.push(`Source inventory item ${item.id} has an empty or invalid exact quote at ${occurrence.sourceRef}.`)
          continue
        }
        const codePoints = Array.from(sourceText)
        const quotePoints = Array.from(occurrence.quote)
        const matches: number[] = []
        for (let index = 0; index <= codePoints.length - quotePoints.length; index++) {
          if (quotePoints.every((point, offset) => codePoints[index + offset] === point)) matches.push(index)
        }
        if (matches.length === 0) {
          findings.push(`Source inventory item ${item.id} exact quote does not occur at ${occurrence.sourceRef}.`)
          continue
        }
        if (matches.length > 1) {
          findings.push(`Source inventory item ${item.id} exact quote is ambiguous at ${occurrence.sourceRef}.`)
          continue
        }
        start = matches[0]!
        end = start + quotePoints.length
      }
      const value = codePointSlice(sourceText, start, end)
      if (!value.trim()) {
        findings.push(`Source inventory item ${item.id} resolves to empty source text at ${occurrence.sourceRef}.`)
        continue
      }
      const ranges = rangesByRef.get(occurrence.sourceRef) ?? []
      if (ranges.some((range) => start < range.end && range.start < end)) findings.push(`Source inventory occurrences overlap at ${occurrence.sourceRef}.`)
      ranges.push({ start, end, itemId: item.id })
      rangesByRef.set(occurrence.sourceRef, ranges)
      resolved.push({ itemId: item.id, sourceRef: occurrence.sourceRef, text: value, start, end })
    }
  }
  return { occurrences: resolved, findings }
}

/** Validate canonical refs, exact quote selection, item IDs and overlap before downstream planning consumes inventory. */
export function validateSourceInventoryProtocol(source: SourceDocument, inventory: SourceInventory): string[] {
  const findings = resolveInventoryOccurrences(source, inventory).findings
  const expected = findTextLocations(source).map((location) => location.ref).sort()
  const covered = inventory.coveredSourceRefs
  if (!Array.isArray(covered) || JSON.stringify([...covered].sort()) !== JSON.stringify(expected)) {
    findings.push('Source inventory does not attest complete coverage of every canonical source reference.')
  }
  for (const item of inventory.items) {
    if (item.occurrences.length !== 1) findings.push(`Atomic inventory item must identify exactly one source occurrence: ${item.id}`)
  }
  return findings
}

function readRuleAtPath(roots: Record<string, unknown>, ref: string): unknown {
  let value: unknown = roots
  for (const segment of ref.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
  return value
}

export type NormalizedAuthorityValidationContext = { sourceDocument: SourceDocument; productRules: Record<string, unknown> }

function retentionAuthorityExists(input: GenerationInput | ContractGenerationInput, authority: RetentionAuthority, productRules: Record<string, unknown>): boolean {
  if (!authority || typeof authority !== 'object') return false
  if (!authority.ref || authority.ref.includes(':') || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(authority.ref)) return false
  if (authority.kind === 'product_rule') {
    const value = readRuleAtPath(productRules, authority.ref)
    return value !== undefined && value !== false && value !== ''
  }
  if ('generationContext' in input) return input.additionalAnswers.some((answer) => answer.id === authority.ref && answer.authority === 'user' && answer.value.trim().length > 0)
  return input.userProvidedAnswers.some((answer) => answer.id === authority.ref && answer.value.trim().length > 0)
}

export function validateAuthorityGate(
  input: GenerationInput | ContractGenerationInput,
  inventory: SourceInventory,
  plan: PlanResult,
  normalizedContext?: NormalizedAuthorityValidationContext,
): string[] {
  const normalized = 'generationContext' in input
  const sourceDocument = normalized ? normalizedContext?.sourceDocument : input.sourceDocument
  const productRules = normalized ? normalizedContext?.productRules ?? {} : input.productRules
  const issues = normalized ? validateNormalizedDerivedFacts(input) : validateDerivedFacts(input)
  if (!sourceDocument) return [...issues, 'Source document context is required for normalized authority validation.']
  const resolved = resolveInventoryOccurrences(sourceDocument, inventory)
  issues.push(...resolved.findings)
  const expectedCoverage = findTextLocations(sourceDocument).map((location) => location.ref).sort()
  if (!Array.isArray(inventory.coveredSourceRefs) || JSON.stringify([...inventory.coveredSourceRefs].sort()) !== JSON.stringify(expectedCoverage)) {
    issues.push('Source inventory does not attest complete coverage of every canonical source reference.')
  }
  const itemIds = new Set(inventory.items.map((item) => item.id))
  const occurrencesByItem = new Map<string, ResolvedInventoryOccurrence[]>()
  for (const occurrence of resolved.occurrences) occurrencesByItem.set(occurrence.itemId, [...(occurrencesByItem.get(occurrence.itemId) ?? []), occurrence])
  const locations = findTextLocations(sourceDocument)
  const sourceRefs = new Set(locations.map((item) => item.ref))
  const validateRefs = (refs: string[], context: string) => {
    if (!refs.length || refs.some((ref) => !sourceRefs.has(ref))) issues.push(`${context} has an unsupported source reference.`)
  }
  const assigned = new Map<string, string[]>()
  for (const change of plan.factChanges) for (const id of change.inventoryItemIds) assigned.set(id, [...(assigned.get(id) ?? []), `replacement:${change.label}`])
  for (const retained of plan.retainedLiterals) assigned.set(retained.inventoryItemId, [...(assigned.get(retained.inventoryItemId) ?? []), 'retention'])
  if (plan.status !== 'READY') {
    if (plan.operations.length) issues.push(`${plan.status} plan contains executable operations.`)
    if (plan.extraInsertions?.length) issues.push(`${plan.status} plan contains partial product-rule extra insertions.`)
    if (plan.factChanges.length || plan.retainedLiterals.length) issues.push(`${plan.status} plan contains a partial plan.`)
    if (plan.status === 'MISSING_INPUT' && !plan.missingInputs.length) issues.push('MISSING_INPUT plan has no missingInputs.')
    if (plan.status === 'CONFLICT_INPUT' && !plan.conflicts.length) issues.push('CONFLICT_INPUT plan has no conflicts.')
    for (const missing of plan.missingInputs) {
      if (missing.sourceRefs?.length) validateRefs(missing.sourceRefs, `Missing input “${missing.id}”`)
      for (const id of missing.inventoryItemIds) if (!itemIds.has(id)) issues.push(`Missing input “${missing.id}” references unknown inventory item ${id}.`)
    }
    return issues
  }
  if (plan.missingInputs.length || plan.conflicts.length) issues.push('READY plan contains unresolved inputs or conflicts.')
  if (plan.operations.length) issues.push('READY plan contains block operations; all semantic edits must be exact atomic source patches.')
  try { validateOperationTargets(sourceDocument.blocks, buildProductRuleExtraOperations(input, sourceDocument, plan.extraInsertions ?? [], plan.factChanges)) }
  catch (error) { issues.push(error instanceof Error ? error.message : 'Invalid bounded product-rule extra insertion.') }
  for (const change of plan.factChanges) {
    if (!normalize(change.newValue)) issues.push(`Fact change has an empty new literal: ${change.label}`)
    if (!change.inventoryItemIds.length) issues.push(`Fact change has no source inventory item: ${change.label}`)
    if (change.inventoryItemIds.length !== 1) issues.push(`Fact change must update exactly one atomic inventory item: ${change.label}`)
    const changeItemId = change.inventoryItemIds[0]
    const changeItem = inventory.items.find((item) => item.id === changeItemId)
    const changeOccurrence = changeItem?.occurrences.length === 1 ? changeItem.occurrences[0] : undefined
    if (!change.inventoryItemId || change.inventoryItemId !== changeItemId || !change.sourceRef || !change.expectedSource
      || !changeOccurrence || change.sourceRef !== changeOccurrence.sourceRef || change.expectedSource !== changeOccurrence.quote
      || changeOccurrence.quote === null) {
      issues.push(`Fact change “${change.label}” is not linked to one exact inventoried atomic source span.`)
    }
    for (const id of change.inventoryItemIds) if (!itemIds.has(id)) issues.push(`Fact change “${change.label}” references unknown inventory item ${id}.`)
    const sourceAuthority = change.authority.kind === 'source'
    const canonical = sourceAuthority ? Boolean(change.sourceProvenance?.sourceRef === change.authority.ref)
      : normalized ? canonicalNormalizedAuthorityRef(change.authority) : canonicalLegacyAuthorityRef(change.authority)
    if (!canonical) {
      issues.push(`Invalid canonical authority reference for “${change.label}”: ${change.authority.kind}:${change.authority.ref}`)
      continue
    }
    let authoritative: string | undefined
    if (sourceAuthority) {
      const provenance = change.sourceProvenance
      const sourceItem = provenance && inventory.items.find((item) => item.id === provenance.inventoryItemId)
      const targetItem = change.inventoryItemIds.length === 1 && inventory.items.find((item) => item.id === change.inventoryItemIds[0])
      const sourceOccurrence = sourceItem?.occurrences.length === 1 ? resolved.occurrences.find((item) => item.itemId === sourceItem.id) : undefined
      if (!provenance || !sourceItem || !targetItem || sourceItem.id === targetItem.id || !sourceItem.conceptId
        || sourceItem.conceptId !== targetItem.conceptId || !sourceOccurrence
        || provenance.sourceRef !== sourceOccurrence.sourceRef || provenance.expectedSource !== sourceOccurrence.text
        || change.newValue !== provenance.expectedSource) {
        issues.push(`Source-to-source authority for “${change.label}” lacks exact same-concept inventory provenance.`)
      } else authoritative = provenance.expectedSource
    } else authoritative = normalized ? resolveAuthorityRef(input, change.authority)?.value : legacyAuthorityValue(input, change.authority)
    if (authoritative === undefined) { issues.push(`Invalid authority reference for “${change.label}”: ${change.authority.kind}:${change.authority.ref}`); continue }
    if (!normalize(authoritative)) { issues.push(`Authority for “${change.label}” resolves to an empty value.`); continue }
    if (!declaredValueMatches(change, authoritative)) {
      issues.push(`New literal for “${change.label}” does not match its declared authority.`)
    }
  }
  for (const retained of plan.retainedLiterals) {
    if (!itemIds.has(retained.inventoryItemId)) issues.push(`Retention references unknown inventory item ${retained.inventoryItemId}.`)
    if (!retentionAuthorityExists(input, retained.authority, productRules)) issues.push(`Retention for inventory item ${retained.inventoryItemId} has no valid authority reference.`)
  }
  for (const item of inventory.items) {
    const dispositions = assigned.get(item.id) ?? []
    if (dispositions.length === 0) issues.push(`Source inventory item has no planner disposition: ${item.id}`)
    else if (dispositions.length > 1) issues.push(`Source inventory item has multiple planner dispositions: ${item.id}`)
    if (!occurrencesByItem.get(item.id)?.length) issues.push(`Source inventory item has no resolvable source occurrences: ${item.id}`)
    if (item.occurrences.length !== 1) issues.push(`Atomic inventory item must identify exactly one source occurrence: ${item.id}`)
  }
  const operationIssues = validateOperationTargets(sourceDocument.blocks, plan.operations ?? [])
  issues.push(...operationIssues)
  return issues
}

function validateOperationTargets(blocks: SourceBlock[], operations: BlockOperation[]): string[] {
  const known = new Set(blocks.map((block) => block.blockId))
  const changed = new Set<string>()
  const issues: string[] = []
  for (const raw of operations as unknown[]) {
    if (!raw || typeof raw !== 'object' || !('operation' in raw)) { issues.push('Malformed block operation.'); continue }
    const operation = raw as BlockOperation
    if (operation.operation === 'REPLACE_BLOCK_TEXT') {
      issues.push(`Complete block replacement is not permitted in the atomic patch protocol: ${operation.blockId}`)
      continue
    }
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

function findTextLocations(document: SourceDocument): Array<{ ref: string; text: string }> {
  return [
    ...document.blocks.map((block) => ({ ref: block.blockId, text: block.text })),
    ...(document.documentProperties ?? []).map((property) => ({ ref: property.ref, text: property.text })),
  ]
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

async function readDocumentProperties(bytes: ArrayBuffer): Promise<DocumentPropertyText[]> {
  const zip = await JSZip.loadAsync(bytes)
  const core = zip.file('docProps/core.xml')
  if (!core) return []
  const xml = await core.async('string')
  return [...xml.matchAll(/<([\w.-]+(?::[\w.-]+)?)\b[^>]*>([^<>]*)<\/\1\s*>/g)].flatMap((match) => {
    const text = unescapeXml(match[2]!).trim()
    const property = match[1]!.split(':').at(-1)!
    return text ? [{ part: 'docProps/core.xml', property, ref: `docProps/core.xml#${property}`, text }] : []
  })
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<SourceDocument> {
  const [blocks, documentProperties] = await Promise.all([(await import('./blockDocxEditor')).buildBlockIndex(bytes), readDocumentProperties(bytes)])
  return { fileName, blocks, documentProperties }
}

export function makeInput(args: Omit<GenerationInput, 'financials' | 'deterministicDerivedFacts' | 'productRules'> & { productRules?: Record<string, unknown> }): GenerationInput {
  const total = args.wedding.contractValuePln
  const deposit = args.wedding.depositPln
  const remaining = total - deposit
  if (![total, deposit, remaining].every(Number.isSafeInteger) || remaining < 0) throw new Error('Contract arithmetic is invalid')
  const base: GenerationInput = { ...args, productRules: { preserveSourcePackageExactly: args.packagePolicy.preserveSourcePackageExactly, preserveSourceConclusionPlace: true, ...(args.productRules ?? {}) }, financials: { contractValuePln: total, depositPln: deposit, remainingPln: remaining }, deterministicDerivedFacts: [] }
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
function replaceMetadataProperty(xml: string, property: string, expectedText: string, nextText: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(`<((?:[\\w.-]+:)?${escapedProperty})\\b([^>]*)>([^<]*)<\\/\\1\\s*>`)
  const match = xml.match(expression)
  if (!match || unescapeXml(match[3]!).normalize('NFC') !== expectedText.normalize('NFC')) throw new Error(`Cannot safely resolve metadata source reference: ${property}`)
  return xml.replace(expression, `<${match[1]}${match[2]}>${escapeXml(nextText)}</${match[1]}>`)
}

export async function applyMetadataFactChanges(bytes: ArrayBuffer, changes: FactChange[], inventory: SourceInventory, source: SourceDocument): Promise<ArrayBuffer> {
  const resolved = resolveInventoryOccurrences(source, inventory)
  if (resolved.findings.length) throw new Error(resolved.findings[0])
  const items = new Map(inventory.items.map((item) => [item.id, item]))
  const changesByRef = new Map<string, Array<{ start: number; end: number; newValue: string }>>()
  for (const change of changes) for (const id of change.inventoryItemIds) {
    const item = items.get(id)
    if (!item) continue
    for (const occurrence of resolved.occurrences.filter((entry) => entry.itemId === id && entry.sourceRef.startsWith('docProps/'))) {
      if (change.inventoryItemId !== id || change.sourceRef !== occurrence.sourceRef || change.expectedSource !== occurrence.text) throw new Error(`Metadata patch is not linked to its exact inventory occurrence: ${id}`)
      changesByRef.set(occurrence.sourceRef, [...(changesByRef.get(occurrence.sourceRef) ?? []), { start: occurrence.start, end: occurrence.end, newValue: change.newValue }])
    }
  }
  if (!changesByRef.size) return bytes
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file('docProps/core.xml')
  if (!file) return bytes
  let xml = await file.async('string')
  const properties = new Map((source.documentProperties ?? []).map((item) => [item.ref, item]))
  for (const [ref, edits] of changesByRef) {
    const property = properties.get(ref)
    if (!property || property.part !== 'docProps/core.xml') throw new Error(`Unsupported metadata source reference: ${ref}`)
    const text = Array.from(property.text)
    for (const edit of [...edits].sort((left, right) => right.start - left.start)) text.splice(edit.start, edit.end - edit.start, ...Array.from(edit.newValue))
    xml = replaceMetadataProperty(xml, property.property, property.text, text.join(''))
  }
  zip.file('docProps/core.xml', xml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

export function buildAtomicTextPatches(source: SourceDocument, inventory: SourceInventory, changes: FactChange[]): ExactTextPatch[] {
  const resolved = resolveInventoryOccurrences(source, inventory)
  if (resolved.findings.length) throw new Error(resolved.findings[0])
  return changes.flatMap((change) => {
    if (change.inventoryItemIds.length !== 1 || change.inventoryItemId !== change.inventoryItemIds[0]
      || !change.sourceRef || !change.expectedSource) throw new Error(`Fact change is not an exact atomic patch: ${change.label}`)
    const occurrence = resolved.occurrences.find((item) => item.itemId === change.inventoryItemId)
    if (!occurrence || occurrence.sourceRef !== change.sourceRef || occurrence.text !== change.expectedSource || !change.expectedSource) {
      throw new Error(`Fact change source span does not match Inventory: ${change.label}`)
    }
    if (occurrence.sourceRef.startsWith('docProps/')) return []
    return [{ blockId: occurrence.sourceRef, expectedSource: occurrence.text, replacement: change.newValue, sourceStart: occurrence.start, sourceEnd: occurrence.end }]
  })
}

export async function applyAtomicFactChanges(bytes: ArrayBuffer, changes: FactChange[], inventory: SourceInventory, source: SourceDocument): Promise<ArrayBuffer> {
  const patches = buildAtomicTextPatches(source, inventory, changes)
  const editedText = await applyExactTextPatches(bytes, patches)
  return applyMetadataFactChanges(editedText, changes, inventory, source)
}

export async function validateCandidate(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  input: GenerationInput | ContractGenerationInput,
  inventory: SourceInventory,
  plan: PlanResult,
  approvedOperations: BlockOperation[] = [],
  normalizedContext?: NormalizedAuthorityValidationContext,
): Promise<string[]> {
  const issues: string[] = []
  issues.push(...validateAuthorityGate(input, inventory, plan, normalizedContext))
  let sourceZip: JSZip; let candidateZip: JSZip
  try { sourceZip = await JSZip.loadAsync(sourceBytes); candidateZip = await JSZip.loadAsync(candidateBytes) } catch { return ['Cannot open DOCX ZIP package'] }
  let source: SourceDocument; let candidate: SourceDocument
  try { [source, candidate] = await Promise.all([readSource(sourceBytes, 'source.docx'), readSource(candidateBytes, 'candidate.docx')]) } catch { return ['DOCX XML or document structure is invalid'] }
  const productRuleOperations = buildProductRuleExtraOperations(input, source, plan.extraInsertions ?? [], plan.factChanges)
  issues.push(...validateOperationTargets(source.blocks, approvedOperations))
  if (JSON.stringify(approvedOperations) !== JSON.stringify(productRuleOperations)) issues.push('Candidate operations do not exactly match bounded product-rule extra insertions.')
  if (plan.operations.length) issues.push('READY plan contains block operations; ordinary content must use atomic source patches.')
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
  let expectedBytes: ArrayBuffer
  try {
    expectedBytes = await applyAtomicFactChanges(sourceBytes, plan.factChanges, inventory, source)
    if (productRuleOperations.length) expectedBytes = await applyBlockOperations(expectedBytes, productRuleOperations)
  }
  catch (error) { return [...issues, error instanceof Error ? error.message : 'Cannot reconstruct candidate from source patches'] }
  const expectedZip = await JSZip.loadAsync(expectedBytes)
  for (const part of sourcePackageParts) {
    const expected = await expectedZip.file(part)?.async('uint8array')
    const actual = await candidateZip.file(part)?.async('uint8array')
    if (!expected || !actual || expected.length !== actual.length || expected.some((byte, index) => byte !== actual[index])) {
      issues.push(`Candidate contains a change outside deterministic source patches: ${part}`)
    }
  }
  const candidateLocations = new Map(findTextLocations(candidate).map((item) => [item.ref, item.text]))
  const sourceBlockById = new Map(source.blocks.map((block) => [block.blockId, block]))
  const candidateRefForSourceRef = (sourceRef: string): string => {
    const sourceBlock = sourceBlockById.get(sourceRef)
    if (!sourceBlock) return sourceRef
    return `${sourceBlock.part}#p${candidateIndexForSourceBlock(sourceBlock, source.blocks, approvedOperations)}`
  }
  const resolved = resolveInventoryOccurrences(source, inventory)
  const changesByItem = new Map<string, FactChange>()
  const retainedIds = new Set(plan.retainedLiterals.map((item) => item.inventoryItemId))
  for (const change of plan.factChanges) for (const id of change.inventoryItemIds) changesByItem.set(id, change)
  for (const occurrence of resolved.occurrences) {
    const actual = candidateLocations.get(candidateRefForSourceRef(occurrence.sourceRef)) ?? ''
    const change = changesByItem.get(occurrence.itemId)
    if (change && normalize(occurrence.text) !== normalize(change.newValue) && literalOccurs(actual, occurrence.text)) {
      issues.push(`Declared old source span remains at ${occurrence.sourceRef}: ${occurrence.text}`)
    }
    if (retainedIds.has(occurrence.itemId) && !literalOccurs(actual, occurrence.text)) {
      issues.push(`Authorized retained source span is absent at ${occurrence.sourceRef}: ${occurrence.text}`)
    }
  }
  const candidateTextForChange = (change: FactChange): string[] => {
    const itemIds = new Set(change.inventoryItemIds)
    const refs = new Set(resolved.occurrences.filter((occurrence) => itemIds.has(occurrence.itemId)).map((occurrence) => occurrence.sourceRef))
    return [...refs].map((ref) => candidateLocations.get(ref) ?? '')
  }
  for (const change of plan.factChanges) {
    const candidateTexts = candidateTextForChange(change)
    const checks = candidateTexts.map((text) => mechanicallyContainsDeclaredValue(text, change.newValue))
    if (!candidateTexts.length || (!checks.some((result) => result === true) && !checks.every((result) => result === undefined))) {
      issues.push(`Declared new literal is absent: ${change.newValue}`)
    }
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

/** The normalized authority input is used by AI and deterministic validation; source structure stays separate. */
/** @deprecated Legacy Inventory/atomic pipeline retained only until Option B Slice 3 cleanup. */
export async function runLegacyInventoryAtomicGeneration(
  sourceBytes: ArrayBuffer,
  sourceDocument: SourceDocument,
  authorityContext: ContractGenerationInput,
  productRules: Record<string, unknown>,
  ai: ContractAi,
): Promise<GenerationResult> {
  const validationContext: NormalizedAuthorityValidationContext = { sourceDocument, productRules }
  const inventory = await runSourceInventory(sourceDocument, ai)
  const inventoryIssues = validateSourceInventoryProtocol(sourceDocument, inventory)
  if (inventoryIssues.length) return { status: 'FAILED', issues: inventoryIssues }
  const plan = await ai.plan(authorityContext, inventory)
  const safeOperations = sanitizePlannerOperations(plan.status, plan.operations).operations
  const effectivePlan = { ...plan, operations: safeOperations }
  const authorityIssues = validateAuthorityGate(authorityContext, inventory, effectivePlan, validationContext)
  if (authorityIssues.length) return { status: 'FAILED', issues: authorityIssues }
  if (plan.status === 'MISSING_INPUT') return { status: 'MISSING_INPUT', missingInputs: plan.missingInputs }
  if (plan.status === 'CONFLICT_INPUT') return { status: 'CONFLICT_INPUT', conflicts: plan.conflicts }
  const targetIssues = validateOperationTargets(sourceDocument.blocks, safeOperations)
  if (targetIssues.length) return { status: 'FAILED', issues: targetIssues }
  let candidateBytes = await applyAtomicFactChanges(sourceBytes, plan.factChanges, inventory, sourceDocument)
  const productRuleOperations = buildProductRuleExtraOperations(authorityContext, sourceDocument, plan.extraInsertions ?? [], plan.factChanges)
  if (productRuleOperations.length) candidateBytes = await applyBlockOperations(candidateBytes, productRuleOperations)
  const candidateDocument = await readSource(candidateBytes, sourceDocument.fileName)
  const candidateIssues = await validateCandidate(sourceBytes, candidateBytes, authorityContext, inventory, effectivePlan, productRuleOperations, validationContext)
  if (candidateIssues.length) return { status: 'FAILED', issues: candidateIssues }
  const changedBlocks = computeChangedBlockDiff(sourceDocument.blocks, candidateDocument.blocks, productRuleOperations)
  const resolvedInventoryOccurrences = resolveInventoryOccurrences(sourceDocument, inventory).occurrences
  const review = await ai.review({ source: sourceDocument, authorityContext, inventory, resolvedInventoryOccurrences, factChanges: plan.factChanges, retainedLiterals: plan.retainedLiterals, candidate: candidateDocument.blocks, changedBlocks })
  if (review.status === 'FAIL') return { status: 'FAILED', issues: review.issues }
  return { status: 'COMPLETED', docxBytes: candidateBytes, review }
}
