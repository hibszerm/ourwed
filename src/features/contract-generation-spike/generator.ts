import JSZip from 'jszip'
import { randomUUID } from 'node:crypto'
import { applyBlockOperations, type BlockOperation, type EditableBlock } from './blockDocxEditor.ts'
import { canonicalizeParagraphText, unescapeXml } from '@/features/documents/template/canonicalParagraph.ts'
import type { ContractGenerationInput } from './contractGenerationInput'
import { isGenerationResponse, REVIEWER_FINDING_RULE_IDS, type BlockEdit, type MissingInput } from './generationProtocol.ts'
import type { MechanicalEditOperation, MechanicalFailureDiagnostic, MechanicalSourceBlockType } from './mechanicalDiagnostics.ts'

export type SourceBlock = EditableBlock
export type SourceDocument = { fileName: string; blocks: SourceBlock[] }
export type ChangedBlock = { blockRef: string; sourceText: string | null; candidateText: string | null }
export type GenerationSourceBlock = { blockId: string; kind: EditableBlock['kind']; text: string }
export type GenerationSourceView = { blocks: GenerationSourceBlock[]; sourceBlockIds: Map<string, string> }
export type OptionBGenerationResult =
  | { status: 'MISSING_INPUT'; missingInputs: MissingInput[] }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }
  | { status: 'FAILED'; issues: string[]; mechanicalFailure?: MechanicalFailureDiagnostic }
  | { status: 'READY'; candidateBytes: ArrayBuffer; candidate: SourceDocument; edits: BlockEdit[]; changedBlocks: ChangedBlock[] }

export const GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION = 'Treat current authoritative facts as facts about this transaction; the source controls general or conditional contractual terms. Preserve any such source term that can coexist with current facts. Modify it only when current authority or an explicit product rule clearly establishes that it is superseded, waived, or replaced for this contract; update stale transaction-specific facts without discarding the surrounding condition. Do not request missing input or report a conflict solely to evaluate a condition that can be faithfully preserved.'

export const RESOLVED_MISSING_INPUT_INSTRUCTIONS = 'Distinguish CURRENT AUTHORITATIVE INPUT (normalized product records), the SOURCE CONTRACT (which controls contractual wording, structure, and source-defined requirements except where an explicit authoritative product rule applies), and RESOLVED USER INPUT (the structured resolvedMissingInputs collection). Each resolved item binds the original MissingInput ID, complete requirement definition including label, answerKind and any subject, to the user answer. User answers are authoritative only for the specific requirement they answer. That requirement is resolved: use its answer naturally where the source requires that fact and do not request the same requirement again, including by paraphrasing its label or assigning a new opaque ID. A resolved answer does not authorize unrelated assumptions; an answer to one requirement must not satisfy a genuinely distinct requirement unless the supplied fact and source clearly establish that relationship. Continue inspecting the complete source for other genuinely missing requirements and return all newly discovered requirements together in one MISSING_INPUT response. A requirement is missing only when it is not safely available from normalized authority, authoritative user answers, or applicable generic product rules; resolved user answers are authoritative user answers for this purpose. Return CONFLICT_INPUT only for a material conflict not resolved by the source, authority, answers, or product rules, including resolved user answers.'

export const GENERATION_INSTRUCTIONS = `Read the source contract and current authoritative wedding data. Produce the same contract correctly adapted to this wedding. The source defines the contract's clauses, obligations, service scope, legal and commercial meaning, payment concepts, and structure. Required identity and contact facts come only from contracting parties and contractual roles represented by the source; CRM participants are not automatically contracting parties, and do not request their identity or contact facts unless the source requires them for the corresponding role. Current authoritative input supplies current transaction facts; user answers and the explicit product rules below are also authoritative. ${RESOLVED_MISSING_INPUT_INSTRUCTIONS} ${GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION} Use party associations supplied in normalized input and do not invent ownership for unowned facts. Explicit participant associations describe only what authoritative upstream data establishes about that participant; they do not automatically map the participant to a source-contract role. Determine source role relevance from the source contract. A fact associated with one participant describes only that participant. Do not turn it into another participant's or a collective/shared party fact unless authoritative input explicitly establishes the same fact for every required participant or explicitly establishes its shared scope. If the source requires a collective/shared fact and current authority establishes it for only some of the required participants, return MISSING_INPUT for the unsupported requirement. A contract/correspondence address is not automatically a residential address. Preserve unrelated content and make only changes needed for this transaction. Do not rewrite or improve unrelated prose, modernize or summarize the contract, or add CRM information merely because it exists. Use the normalized place role and provenance; when a place has both a meaningful stored display name and formatted address, preserve both when naturally adapting a source location reference unless the source clearly requires only one. If only one is available, use only that fact; do not infer a name from an address, fetch or geocode a place, or repeat equivalent text. Realize authoritative textual facts with grammar appropriate to the source language, including required case or other inflection, while preserving the fact's underlying identity and meaning; canonical display forms need not appear literally in inflected prose. Before returning MISSING_INPUT, inspect the complete source contract for every currently discoverable source-required fact not sufficiently established by current authority or user answers, including resolved user input. Return all such gaps together; do not stop at the first. Return MISSING_INPUT only when the source contract clearly establishes a fact required for this candidate and that fact is not safely available from normalized authority, authoritative user answers (including resolved user input), or applicable generic product rules. Source text defines both whether a fact is required and the maximum semantic specificity of that requirement, including its subject. Every adaptation and MissingInput must preserve the source-established subject and scope: do not strengthen, broaden, split, merge, collectivize, or reassign a source requirement based on a richer domain or CRM model. Before emitting MissingInput, determine whether authoritative facts satisfy the source requirement at that scope using their provenance and subject association. The absence of a broader domain concept is not a missing input unless the source itself requires that broader concept. Each MISSING_INPUT may ask only for the minimum unresolved fact clearly established by the source; do not refine a generic, collective, party-level, role-neutral, or ownership-ambiguous requirement into participant-specific ownership or a residential, correspondence, billing, or other semantic type unless the source itself establishes that specificity. If a broader source-established fact remains unresolved, request it at that broader level without inventing narrower ownership or type. Preserve participant provenance: a fact associated with one participant cannot satisfy another participant's or a collective/shared requirement without explicit authority. When the source explicitly establishes separate participant-specific facts or a semantic type, request a missing fact at that specificity. Do not request data merely because source wording is awkward, possibly erroneous, incomplete-looking, internally imperfect, or because richer data would make the contract nicer. A suspicious fragment or possible accidental template text is not evidence by itself that a factual value is required. If ambiguity or a possible source defect does not establish a required fact, preserve the source wording unchanged; do not invent a value or requirement, fabricate a MissingInput for source cleanup, or silently delete or rewrite source content. Continue adaptation without unauthorized changes. If an established required fact is missing, request it through MISSING_INPUT. Never claim READY when your adaptation introduces or leaves a clearly required transaction fact unresolved. Do not request facts already sufficiently established, or treat a compatible conditional source term as a missing input. Each missing input must have an opaque ID, a concise user-facing label, and one generic answerKind from text, multiline, date, number, email, or phone. The ID is only for pairing a user answer with this requirement; do not encode or imply a CRM field, path, ontology, or mutation. Include subject only when its participantKey is explicitly present in normalized authority and relevant to the missing fact; never infer participant ownership or map a participant to a source-contract role. Omit subject when unsupported. The list is expected to be complete for discoverable gaps, but is not guaranteed exhaustive; a fresh full-context run must re-evaluate. Return CONFLICT_INPUT only for a material conflict not resolved by the source, authority, authoritative user answers, or product rules. Otherwise return READY with the minimal whole-block edits. Replace blocks to update existing text; insert only content actually authorized by the source or product rules. Do not invent legal clauses or alter base service scope. Return only the GenerationResponse protocol.`

export const GENERIC_CONTRACT_PRODUCT_RULES = [
  'contractValue is the authoritative total; do not add selected extras or charged travel on top. It is the authoritative final total and already includes wedding-specific extras and effective charged travel; do not add extras or charged travel on top of it.',
  'The selected source contract template already expresses the contractual base scope of the base package it is assigned to. Package names, labels, categories, base package items, and package-associated base deliverable metadata are transaction/package context; by themselves they do not supersede, reconstruct, enrich, redefine, or conflict with source-controlled base service identity, scope, deliverables, or obligations. They govern such a contractual fact only when an explicit product rule or authoritative user input establishes that they govern that fact.',
  'Use only explicit current extras. Wedding-specific purchased extras are authoritative current transaction facts distinct from base package metadata. Inspect each extra against the source; do not duplicate one already adequately represented. Incorporate an extra not already represented as an additional purchased item in a source-compatible contractual location, without redefining unrelated base service scope or inventing unsupported details. If a material fact required to represent an extra is genuinely absent from the source, current authority, user answers, or deterministic product-rule arithmetic, request it through the normal batch MISSING_INPUT mechanism.',
  'Keep wedding-specific purchased extras distinct from the source-defined base-package scope. When adding extras not already represented, integrate them as a distinct extras group or statement using a source-compatible presentation. Do not make them appear to be further numbered members of the source-defined base-scope list unless the source itself explicitly defines extras that way; do not invent bullets or numbering.',
  'Apply current commercial statuses and amounts as facts about this transaction; they do not by themselves supersede compatible general or conditional source terms. Included or non-charged travel is not a separate added amount.',
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

function validateOptionBInputWithDiagnostics(input: ContractGenerationInput): { issues: string[]; diagnostics: MechanicalFailureDiagnostic[] } {
  const issues = validateNormalizedDerivedFacts(input)
  const diagnostics: MechanicalFailureDiagnostic[] = issues.map(() => ({
    gateId: 'authority', reasonCode: 'derived_fact_mismatch', authorityType: 'normalized_authority',
  }))
  for (const { path, fact } of normalizedFacts(input)) {
    if (!fact.source.trim()) {
      issues.push(`Normalized authority fact has no provenance source: ${path}`)
      diagnostics.push({ gateId: 'authority', reasonCode: 'missing_provenance', authorityType: 'normalized_authority' })
    }
  }
  const amounts = [
    ['contractValue', input.commercial.contractValue.value],
    ['agreedDeposit', input.commercial.agreedDeposit.value],
    ['totalPaid', input.commercial.totalPaid.value],
    ['travelFeeAmount', input.commercial.travelFeeAmount.value],
  ] as const
  for (const [name, amount] of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      issues.push(`Normalized commercial amount ${name} is invalid.`)
      diagnostics.push({ gateId: 'authority', reasonCode: 'invalid_amount', authorityType: 'normalized_authority' })
    }
  }
  for (const extra of input.extras) {
    if (!Number.isSafeInteger(extra.quantity.value) || extra.quantity.value < 1 || !Number.isSafeInteger(extra.price.value) || extra.price.value < 0) {
      issues.push(`Normalized extra ${extra.id.value} has invalid quantity or price.`)
      diagnostics.push({ gateId: 'authority', reasonCode: 'invalid_extra_amount', authorityType: 'normalized_authority' })
    }
  }
  return { issues, diagnostics }
}

export function validateOptionBInput(input: ContractGenerationInput): string[] {
  return validateOptionBInputWithDiagnostics(input).issues
}
export const REVIEW_INSTRUCTIONS = `Review independently. Use the source contract as authority for clauses, scope, and structure; use current input and user answers as authority for transaction facts; apply supplied product rules only where relevant. Natural grammatical variation is allowed, including inflection needed by source-language grammar, while underlying identity and meaning remain unchanged. Do not fail because rendered text differs literally from CRM display text, and do not require quote, span, or occurrence provenance. Treat obviously ungrammatical insertion of a canonical value where the source context plainly requires inflection as a material candidate-quality issue; do not require one exact wording when a natural grammatical rendering is used. Verify that place names and formatted addresses are both preserved when both are authoritative and the source does not clearly require only one. Verify participant ownership and provenance: a participant-specific address or phone cannot satisfy another participant's or a collective/shared requirement without explicit authority for every required participant or explicit shared scope, and correspondence/contact address is not residential evidence by itself. Verify that added wedding-specific extras remain distinct from source-defined base scope and are not presented as continuation of its numbered list unless the source explicitly defines them that way. Compare each incomplete-looking candidate fragment with the source and authoritative input. FAIL when generation introduced or worsened the problem, or when the source clearly requires a transaction-specific fact and the READY candidate leaves it unresolved, whether the fact was available in authority and unused or unavailable and not requested through MISSING_INPUT. Do not FAIL solely because questionable, awkward, incomplete-looking, stale, or possibly defective wording already existed in the source, was preserved without unauthorized alteration, and is not established to require an additional authoritative fact. Treat that unchanged concern as SOURCE_TEMPLATE_ISSUE for review/audit purposes, not as a Generator defect. Do not repair it, delete it, invent data for it, or turn it into a fabricated MISSING_INPUT. Compare source, authority, rules, candidate, and mechanical diff for material correctness: preservation of unrelated clauses and service scope, correct current facts and payment terms, stale facts, unauthorized additions or removals, and unnecessary CRM enrichment. Focus only on material correctness. PASS only if no material issue exists; otherwise return FAIL with concise material findings. Do not edit or repair the candidate. For FAIL, return one or more findings, each with exactly one safe category from: source_mismatch (candidate materially changes source meaning/scope), omitted_required_content (required source content is missing), unsupported_addition (material content lacks authority), authoritative_fact_mismatch (candidate conflicts with authoritative current facts), product_rule_violation (a supplied generic product rule is violated), structural_issue (document structure materially impairs the candidate), other_material_issue (material concern not covered above). Each finding also has exactly one ruleId from the closed existing-rule taxonomy: ${REVIEWER_FINDING_RULE_IDS.join(', ')}. Select the single primary applicable existing rule family: contract_total (authoritative contract total and arithmetic), travel (charged, included, or non-charged travel), extras (explicit purchased extras, kept distinct from base scope and not duplicated), source_scope (source-defined base services and obligations), payment_amounts (authoritative deposit, installment, and other payment amounts), payment_timing (source timing for each obligation), crm_enrichment (unsupported CRM additions and participant/place provenance), transaction_facts (other current transaction facts), unsupported_invention (unauthorized contract content or obligations), source_preservation (unrelated source wording, clauses, and structure). These identifiers classify existing review findings only and do not add a review criterion. Do not derive or include identifiers from any wedding, user, template, source, candidate, or answer data. Each finding also has a concise free-text message for human review. Never put category-specific details or sensitive values in category or ruleId. Return only CandidateReviewResponse.`

export const CONFLICT_REVIEW_INSTRUCTIONS = `Verify only the conflict or conflicts explicitly claimed by the Generator, against the source contract, normalized current authority and provenance, accumulated user answers, and relevant product rules. For each claimed conflict, determine whether the relevant requirements genuinely cannot coexist, whether they govern the same contractual fact, whether established authority precedence already resolves the difference, whether required authority is actually missing rather than conflicting, and whether compatible source policy and current transaction facts can coexist. The selected source contract template already expresses the contractual base scope of the base package it is assigned to. For a specifically claimed package-versus-source-scope conflict, assess whether package names, labels, categories, base package items, or package-associated base deliverable metadata are explicitly authorized to govern that same contractual fact; absent such authority, they are transaction/package context and do not by themselves supersede, reconstruct, enrich, redefine, or conflict with source-controlled base scope. Wedding-specific purchased extras are distinct current transaction facts and do not by themselves redefine unrelated source base scope. A stale source transaction-specific value that corresponds to a current authoritative transaction fact is ordinarily replaced during adaptation; the difference alone is not a conflict. Return PASS only if every claimed conflict genuinely remains unresolved and requires user resolution. Return FAIL if any claimed conflict is resolved by established precedence, is based only on non-governing package metadata, is merely a stale source transaction-specific value, is actually missing authority, or can faithfully coexist. Do not search for additional or unrelated conflicts, omitted missing inputs, package or service-scope issues, or other contract problems beyond the Generator's claimed conflict(s). You must assess a specifically claimed package or service-scope conflict under the rules above. Do not re-plan the contract, propose BlockEdits, generate a candidate, rewrite the conflict list, repair the GenerationResponse, or make another Generator call. Do not include or expect hidden Generator reasoning. Return only ReviewResponse.`

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

function mechanicalSourceBlockType(block: SourceBlock | undefined): MechanicalSourceBlockType {
  if (!block) return 'other'
  if (block.kind === 'tableCell') return 'table_cell'
  return block.kind
}

function sourceOccurrence(block: SourceBlock, source: SourceBlock[]): number {
  const canonicalText = canonicalizeParagraphText(block.text)
  return source.filter((candidate) => candidate.part === block.part
    && canonicalizeParagraphText(candidate.text) === canonicalText).findIndex((candidate) => candidate.blockId === block.blockId)
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
async function validateOptionBCandidateDetailed(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  source: SourceDocument,
  candidate: SourceDocument,
  operations: BlockOperation[],
  editorOperationReportedSuccess?: boolean,
): Promise<{ issues: string[]; diagnostics: MechanicalFailureDiagnostic[] }> {
  const issues: string[] = []
  const diagnostics: MechanicalFailureDiagnostic[] = []
  const reject = (issue: string, gateId: MechanicalFailureDiagnostic['gateId'], reasonCode: MechanicalFailureDiagnostic['reasonCode'], editIndex?: number) => {
    issues.push(issue)
    diagnostics.push({ gateId, reasonCode, ...(editIndex === undefined ? {} : { editIndex }), editCount: operations.length })
  }
  let sourceZip: JSZip
  let candidateZip: JSZip
  try {
    [sourceZip, candidateZip] = await Promise.all([JSZip.loadAsync(sourceBytes), JSZip.loadAsync(candidateBytes)])
  } catch {
    reject('Cannot open source or candidate DOCX ZIP package', 'candidate_parse', 'invalid_package')
    return { issues, diagnostics }
  }
  const sourceParts = Object.keys(sourceZip.files).filter((part) => !sourceZip.files[part]?.dir).sort()
  const candidateParts = Object.keys(candidateZip.files).filter((part) => !candidateZip.files[part]?.dir).sort()
  if (!sourceParts.includes('[Content_Types].xml') || !sourceParts.includes('word/document.xml')) {
    reject('Source DOCX is missing a required package part.', 'package_structure', 'required_part_missing')
    return { issues, diagnostics }
  }
  if (!candidateParts.includes('[Content_Types].xml') || !candidateParts.includes('word/document.xml')) {
    reject('Candidate DOCX is missing a required package part.', 'package_structure', 'required_part_missing')
    return { issues, diagnostics }
  }

  const editablePart = (part: string) => /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(part)
  for (const part of sourceParts) {
    const beforeFile = sourceZip.file(part)
    const afterFile = candidateZip.file(part)
    if (!beforeFile || !editablePart(part)) continue
    if (!afterFile) {
      reject('Candidate is missing a source document part.', 'package_structure', 'required_part_missing')
      continue
    }
    const [before, after] = await Promise.all([beforeFile.async('string'), afterFile.async('string')])
    if (JSON.stringify(tableStructureSignatures(before)) !== JSON.stringify(tableStructureSignatures(after))) reject(`Table row/cell structure changed: ${part}`, 'package_structure', 'table_structure_changed')
    if (JSON.stringify(wordFieldInstructions(before)) !== JSON.stringify(wordFieldInstructions(after))) reject(`Word field instructions changed: ${part}`, 'package_structure', 'field_instruction_changed')
    if (JSON.stringify(wordFieldMarkers(before)) !== JSON.stringify(wordFieldMarkers(after))) reject(`Word field structure changed: ${part}`, 'package_structure', 'field_structure_changed')
  }

  // Compare the final logical text by part. Paragraph/run boundaries and blank
  // paragraphs are implementation details; order and authored content remain
  // protected. Expected text is built once from the original source and the
  // localized instructions, independent of the candidate's paragraph ordinals.
  const sourceById = new Map(source.blocks.map((block) => [block.blockId, block]))
  const before = new Map<string, BlockOperation[]>()
  const after = new Map<string, BlockOperation[]>()
  const replacements = new Map<string, Extract<BlockOperation, { operation: 'REPLACE_BLOCK_TEXT' }>>()
  const requestedDiagnostic = (editIndex: number, operation: BlockOperation, target: SourceBlock): MechanicalFailureDiagnostic => {
    const replacement = operation.operation === 'REPLACE_BLOCK_TEXT' ? operation.finalText : operation.operation === 'DELETE_BLOCK' ? '' : operation.finalText
    const operationType: MechanicalEditOperation = operation.operation === 'REPLACE_BLOCK_TEXT' ? 'replace'
      : operation.operation === 'INSERT_BLOCK_AFTER' ? 'insert_after' : 'other'
    const requested = canonicalizeParagraphText(replacement)
    const candidateBlock = candidate.blocks.find((block) => block.part === target.part && canonicalizeParagraphText(block.text) === requested)
    return {
      gateId: 'edit_application', reasonCode: 'requested_edit_missing', editIndex, editCount: operations.length,
      editOperation: operationType, sourceBlockType: mechanicalSourceBlockType(target),
      sourceBlockOrdinal: target.index, sourceOccurrence: sourceOccurrence(target, source.blocks),
      sourceCanonicalLength: canonicalizeParagraphText(target.text).length, requestedCanonicalLength: requested.length,
      ...(candidateBlock ? { candidateCanonicalLength: canonicalizeParagraphText(candidateBlock.text).length } : {}),
      sourceTargetFound: true, ...(editorOperationReportedSuccess === undefined ? {} : { editorOperationReportedSuccess }),
      candidateBlockOrdinal: candidateBlock?.index ?? null,
      expectedAtCandidateBlock: Boolean(candidateBlock),
      exactRequestedCanonicalFoundElsewhere: candidate.blocks.some((block) => canonicalizeParagraphText(block.text) === requested),
    }
  }
  for (const [editIndex, operation] of operations.entries()) {
    const targetId = operation.operation === 'REPLACE_BLOCK_TEXT' || operation.operation === 'DELETE_BLOCK' ? operation.blockId : operation.anchorBlockId
    const target = sourceById.get(targetId)
    if (!target) {
      reject('A requested source block could not be located.', 'source_target', 'target_not_found', editIndex)
      continue
    }
    if (operation.operation === 'DELETE_BLOCK') {
      reject('Option B does not permit deleting source blocks.', 'edit_application', 'deletion_not_permitted', editIndex)
      continue
    }
    if (operation.operation === 'REPLACE_BLOCK_TEXT') {
      if (replacements.has(targetId)) reject('Duplicate replacement target.', 'duplicate_target', 'duplicate_target', editIndex)
      else replacements.set(targetId, operation)
    } else {
      const style = sourceById.get(operation.styleSourceBlockId)
      if (!style || style.part !== target.part) {
        reject('An insertion style source could not be located in its source part.', 'source_target', 'target_not_found', editIndex)
        continue
      }
      const buckets = operation.operation === 'INSERT_BLOCK_BEFORE' ? before : after
      buckets.set(targetId, [...(buckets.get(targetId) ?? []), operation])
    }
  }
  const normalizeDocumentText = (texts: string[]) => texts
    .map((text) => canonicalizeParagraphText(text))
    .filter((text) => text.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = new Set([...source.blocks.map((block) => block.part), ...candidate.blocks.map((block) => block.part)])
  for (const part of parts) {
    const expected: string[] = []
    for (const block of source.blocks.filter((item) => item.part === part)) {
      for (const insertion of before.get(block.blockId) ?? []) {
        if (insertion.operation !== 'DELETE_BLOCK' && insertion.operation !== 'REPLACE_BLOCK_TEXT') expected.push(insertion.finalText)
      }
      expected.push(replacements.get(block.blockId)?.finalText ?? block.text)
      for (const insertion of after.get(block.blockId) ?? []) {
        if (insertion.operation !== 'DELETE_BLOCK' && insertion.operation !== 'REPLACE_BLOCK_TEXT') expected.push(insertion.finalText)
      }
    }
    const expectedText = normalizeDocumentText(expected)
    const actualText = normalizeDocumentText(candidate.blocks.filter((block) => block.part === part).map((block) => block.text))
    if (expectedText !== actualText) {
      const absent = [...operations.entries()].find(([, operation]) => {
        const targetId = operation.operation === 'REPLACE_BLOCK_TEXT' || operation.operation === 'DELETE_BLOCK' ? operation.blockId : operation.anchorBlockId
        const target = sourceById.get(targetId)
        if (!target || target.part !== part || operation.operation === 'DELETE_BLOCK') return false
        const text = canonicalizeParagraphText(operation.finalText)
        return !actualText.includes(text)
      })
      if (absent) {
        const [editIndex, operation] = absent
        if (operation.operation === 'DELETE_BLOCK') {
          reject('Option B does not permit deleting source blocks.', 'edit_application', 'deletion_not_permitted', editIndex)
        } else {
          const target = sourceById.get(operation.operation === 'REPLACE_BLOCK_TEXT' ? operation.blockId : operation.anchorBlockId)!
          reject('A requested change is not represented in the final document.', 'edit_application', 'requested_edit_missing', editIndex)
          diagnostics[diagnostics.length - 1] = requestedDiagnostic(editIndex, operation, target)
        }
      } else reject('Final document content differs from the authorized source-relative changes.', 'extra_change', 'unexpected_change')
    }
  }
  return { issues, diagnostics }
}

export async function validateOptionBCandidate(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  source: SourceDocument,
  candidate: SourceDocument,
  operations: BlockOperation[],
): Promise<string[]> {
  return (await validateOptionBCandidateDetailed(sourceBytes, candidateBytes, source, candidate, operations)).issues
}

/** Content-free result for callers that need only the deterministic gate classification. */
export async function diagnoseOptionBCandidate(
  sourceBytes: ArrayBuffer,
  candidateBytes: ArrayBuffer,
  source: SourceDocument,
  candidate: SourceDocument,
  operations: BlockOperation[],
): Promise<{ passed: true } | { passed: false; failure?: MechanicalFailureDiagnostic }> {
  const result = await validateOptionBCandidateDetailed(sourceBytes, candidateBytes, source, candidate, operations)
  return result.issues.length ? { passed: false, failure: result.diagnostics[0] } : { passed: true }
}

/** Apply one validated generation response to a copy of the source DOCX. */
export async function applyOptionBGenerationResponse(
  sourceBytes: ArrayBuffer,
  source: SourceDocument,
  input: ContractGenerationInput,
  sourceBlockIds: Map<string, string>,
  response: unknown,
): Promise<OptionBGenerationResult> {
  const participantKeys = new Set(input.parties.map((party) => party.sourceKey))
  for (const association of input.participantAssociations) participantKeys.add(association.participant)
  if (!isGenerationResponse(response, participantKeys)) return { status: 'FAILED', issues: ['Generation response does not match the strict Option B protocol.'] }
  if (response.status === 'MISSING_INPUT') return { status: 'MISSING_INPUT', missingInputs: response.missingInputs }
  if (response.status === 'CONFLICT_INPUT') return { status: 'CONFLICT_INPUT', conflicts: response.conflicts }

  const inputValidation = validateOptionBInputWithDiagnostics(input)
  if (inputValidation.issues.length) return { status: 'FAILED', issues: inputValidation.issues, mechanicalFailure: inputValidation.diagnostics[0] }
  const sourceBlocksById = new Map(source.blocks.map((block) => [block.blockId, block]))
  const seenReplacementTargets = new Set<string>()
  const operations: BlockOperation[] = []
  for (const [editIndex, edit] of response.edits.entries()) {
    const sourceBlockId = sourceBlockIds.get(edit.blockId)
    if (!sourceBlockId || !sourceBlocksById.has(sourceBlockId)) return {
      status: 'FAILED', issues: [`Unknown generation block ID: ${edit.blockId}`],
      mechanicalFailure: { gateId: 'source_target', reasonCode: 'target_not_found', editIndex, editCount: response.edits.length },
    }
    if (edit.kind === 'replace') {
      if (seenReplacementTargets.has(sourceBlockId)) return {
        status: 'FAILED', issues: [`Duplicate replacement target: ${edit.blockId}`],
        mechanicalFailure: { gateId: 'duplicate_target', reasonCode: 'duplicate_target', editIndex, editCount: response.edits.length },
      }
      seenReplacementTargets.add(sourceBlockId)
      operations.push({ operation: 'REPLACE_BLOCK_TEXT', blockId: sourceBlockId, finalText: edit.text })
    } else {
      operations.push({ operation: 'INSERT_BLOCK_AFTER', anchorBlockId: sourceBlockId, styleSourceBlockId: sourceBlockId, finalText: edit.text })
    }
  }

  let candidateBytes: ArrayBuffer
  try {
    candidateBytes = await applyBlockOperations(sourceBytes, operations)
  } catch (error) {
    return {
      status: 'FAILED', issues: [error instanceof Error ? error.message : 'Unable to safely apply block edits to the source DOCX.'],
      mechanicalFailure: { gateId: 'source_copy', reasonCode: 'application_failed', editCount: response.edits.length },
    }
  }
  let candidate: SourceDocument
  try {
    candidate = await readSource(candidateBytes, source.fileName)
  } catch (error) {
    return {
      status: 'FAILED', issues: [error instanceof Error ? error.message : 'Unable to safely apply block edits to the source DOCX.'],
      mechanicalFailure: { gateId: 'candidate_parse', reasonCode: 'candidate_unreadable', editCount: response.edits.length },
    }
  }
  const validation = await validateOptionBCandidateDetailed(sourceBytes, candidateBytes, source, candidate, operations, true)
  if (validation.issues.length) return { status: 'FAILED', issues: validation.issues, mechanicalFailure: validation.diagnostics[0] }
  return {
    status: 'READY', candidateBytes, candidate, edits: response.edits,
    changedBlocks: computeChangedBlockDiff(source.blocks, candidate.blocks, operations),
  }
}

export async function readSource(bytes: ArrayBuffer, fileName: string): Promise<SourceDocument> {
  return { fileName, blocks: await (await import('./blockDocxEditor.ts')).buildBlockIndex(bytes) }
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
