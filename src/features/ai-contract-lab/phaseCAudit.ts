/**
 * Phase C — Document Ready Patch Validation.
 * Deterministic. Not AI. Runs after Phase B approval, before DOCX apply.
 */

import type {
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { validateLocalContext } from '@/features/ai-contract-lab/phaseCLocalContext'
import { validateLocationGrammar } from '@/features/ai-contract-lab/phaseCLocationGrammar'
import {
  findAmountInWordsSpans,
  formatAmountInWordsLikeSource,
  parseMoneyNumber,
  polishAmountInWords,
} from '@/features/ai-contract-lab/polishAmountInWords'
import { comparePackageItemSemantically } from '@/features/ai-contract-lab/phaseCPackageSemantic'
import { buildDisplayValue } from '@/features/ai-contract-lab/phaseCDisplayValues'
import { buildPhysicalPatchPlan } from '@/features/ai-contract-lab/phaseCPhysicalPatchPlan'
import { runStructuralCompatibilityAudit } from '@/features/ai-contract-lab/phaseCStructuralCompatibility'
import type {
  LegalEntityType,
  StructuralCompatibilityResult,
} from '@/features/ai-contract-lab/phaseCStructuralTypes'
import { reconcileSharedLocationPatches } from '@/features/ai-contract-lab/sharedLocationPolicy'
import {
  resolveTemplateConfig,
  type ContractTemplateVariableConfig,
} from '@/features/ai-contract-lab/templateFieldPolicy'
import {
  toContractTemplateVariableConfig,
  type ContractTemplateConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'

export type PatchGroupKind =
  | 'contract_value'
  | 'remaining_amount'
  | 'deposit'
  | 'wedding_date'
  | 'company_identity'
  | 'package'
  | 'location'
  | 'bank_account'
  | 'other'

export type PatchGroupStatus = 'VALID' | 'REVIEW' | 'BLOCKED'

export type PatchGroupMember = {
  replacementId: string
  role: 'numeric' | 'words' | 'primary' | 'derived' | 'item' | 'other'
  originalText: string
  proposedValue: string
  displayValue: string | null
  anchorId: string
  fieldKey: string | null
}

export type PatchGroup = {
  id: string
  kind: PatchGroupKind
  members: PatchGroupMember[]
  status: PatchGroupStatus
  reasons: string[]
  /** Linked amount-in-words patches discovered by Phase C (not yet in plan). */
  suggestedLinkedPatches: Array<{
    anchorId: string
    originalText: string
    proposedValue: string
    reason: string
    linkedToReplacementId: string
  }>
}

export type PhaseCAuditResult = {
  groups: PatchGroup[]
  qualityScore: number
  blockers: string[]
  warnings: string[]
  audit: 'PASS' | 'FAIL'
  /** Rows that must be downgraded to pending/REVIEW. */
  downgradeReplacementIds: string[]
  /** Extra patches Phase C wants added (amount in words). */
  linkedPatches: PatchGroup['suggestedLinkedPatches']
  structuralCompatibility: StructuralCompatibilityResult
  /** Approved rows after physical span reconciliation. */
  reconciledRows: LabReplacementRow[]
}

function groupKindForRow(row: LabReplacementRow): PatchGroupKind {
  const key = (row.canonicalFieldKey ?? '').toLowerCase()
  const role = row.semanticRole.toLowerCase()
  if (
    key.includes('contract_value') ||
    role.includes('package_price') ||
    role.includes('contract_value') ||
    role.includes('wartość')
  ) {
    return 'contract_value'
  }
  if (key.includes('remaining') || role.includes('remaining')) {
    return 'remaining_amount'
  }
  if (key.includes('deposit') || role.includes('zadatk') || role.includes('deposit')) {
    return 'deposit'
  }
  if (
    key.includes('wedding.date') ||
    key.includes('delivery') ||
    key.includes('final_payment') ||
    key.includes('payment_due') ||
    key.includes('preview') ||
    key.includes('execution') ||
    role.includes('wedding') ||
    role.includes('delivery') ||
    role.includes('payment') ||
    role.includes('execution') ||
    role.includes('zawarcia')
  ) {
    return 'wedding_date'
  }
  if (
    key.includes('company') ||
    key.includes('nip') ||
    key.includes('regon') ||
    role.includes('firm') ||
    role.includes('company')
  ) {
    return 'company_identity'
  }
  if (key.includes('bank') || role.includes('konta') || role.includes('bank')) {
    return 'bank_account'
  }
  if (
    key.includes('location') ||
    role.includes('lokaliz') ||
    role.includes('ceremon') ||
    role.includes('przyję') ||
    role.includes('przygotow')
  ) {
    return 'location'
  }
  if (
    key.includes('package') ||
    role.includes('pakiet') ||
    role.includes('package') ||
    role.includes('zawartość') ||
    role.includes('nadgodzin') ||
    role.includes('godzin')
  ) {
    return 'package'
  }
  return 'other'
}

function isMoneyField(row: LabReplacementRow): boolean {
  const key = (row.canonicalFieldKey ?? '').toLowerCase()
  return (
    key.includes('value') ||
    key.includes('deposit') ||
    key.includes('remaining') ||
    key.includes('price') ||
    key.includes('amount') ||
    key.includes('overtime') ||
    /zł|pln|\d/.test(row.proposedValue)
  )
}

function isLocationField(row: LabReplacementRow): boolean {
  return groupKindForRow(row) === 'location'
}

/**
 * Build patch groups from approved (or pending) replacement rows.
 */
export function buildPatchGroups(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
}): PatchGroup[] {
  const active = input.rows.filter(
    (r) => r.decision === 'approved' || r.decision === 'pending',
  )
  const buckets = new Map<PatchGroupKind, LabReplacementRow[]>()
  for (const row of active) {
    if (row.decision === 'rejected' || row.decision === 'unchanged') continue
    if (row.spanStatus === 'ambiguous' || row.spanStatus === 'not_found') continue
    const kind = groupKindForRow(row)
    const list = buckets.get(kind) ?? []
    list.push(row)
    buckets.set(kind, list)
  }

  const groups: PatchGroup[] = []
  for (const [kind, rows] of buckets) {
    const members: PatchGroupMember[] = rows.map((r) => {
      const loc = isLocationField(r)
      const prepared =
        loc &&
        /^(pod adresem|w |we |na |przy |do |Rezydenc|ul\.|ulica)/i.test(
          r.proposedValue.trim(),
        )
          ? r.proposedValue.trim()
          : null
      return {
        replacementId: r.replacementId,
        role: isMoneyField(r) ? 'numeric' : 'primary',
        originalText: r.originalText,
        proposedValue: r.proposedValue,
        displayValue: buildDisplayValue({
          kind: isMoneyField(r)
            ? 'money'
            : loc
              ? 'location'
              : 'text',
          canonicalValue: r.proposedValue,
          sourceSpan: r.originalText,
          contractDisplay: prepared,
        }),
        anchorId: r.anchorId,
        fieldKey: r.canonicalFieldKey,
      }
    })

    groups.push({
      id: `group:${kind}`,
      kind,
      members,
      status: 'VALID',
      reasons: [],
      suggestedLinkedPatches: [],
    })
  }
  return groups
}

function wordsMatchAmount(wordsBody: string, amount: number): boolean {
  const expected = polishAmountInWords(amount)
    .replace(/\s+złotych$/i, '')
    .toLowerCase()
  const body = wordsBody.toLowerCase().replace(/\s+złotych$/i, '').trim()
  return body === expected || body.includes(expected) || expected.includes(body)
}

/**
 * Find amount-in-words spans linked to a numeric money change.
 * Prefer: same anchor containing the numeric original → group anchors →
 * anchors that contain both the old numeric text and a słownie span.
 */
function findLinkedAmountInWordsSpans(input: {
  member: PatchGroupMember
  groupKind: PatchGroupKind
  anchors: DocumentTextAnchor[]
  allRows: LabReplacementRow[]
}): Array<{
  anchorId: string
  span: ReturnType<typeof findAmountInWordsSpans>[number]
}> {
  const out: Array<{
    anchorId: string
    span: ReturnType<typeof findAmountInWordsSpans>[number]
  }> = []
  const seen = new Set<string>()

  const push = (anchorId: string, span: (typeof out)[number]['span']) => {
    const key = `${anchorId}:${span.start}:${span.end}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ anchorId, span })
  }

  const sameAnchor = input.anchors.find((a) => a.anchorId === input.member.anchorId)
  if (sameAnchor) {
    for (const span of findAmountInWordsSpans(sameAnchor.text)) {
      push(sameAnchor.anchorId, span)
    }
  }
  if (out.length > 0) return out

  const groupAnchorIds = new Set<string>()
  for (const row of input.allRows) {
    if (groupKindForRow(row) === input.groupKind) groupAnchorIds.add(row.anchorId)
  }
  for (const aid of groupAnchorIds) {
    const anchor = input.anchors.find((a) => a.anchorId === aid)
    if (!anchor) continue
    for (const span of findAmountInWordsSpans(anchor.text)) {
      push(aid, span)
    }
  }
  if (out.length > 0) return out

  const oldNum = input.member.originalText.trim()
  for (const anchor of input.anchors) {
    if (!oldNum || !anchor.text.includes(oldNum)) continue
    for (const span of findAmountInWordsSpans(anchor.text)) {
      push(anchor.anchorId, span)
    }
  }
  return out
}

function validateMoneyGroup(
  group: PatchGroup,
  anchors: DocumentTextAnchor[],
  allRows: LabReplacementRow[],
): void {
  const numericMembers = group.members.filter((m) => {
    const n = parseMoneyNumber(m.proposedValue) ?? parseMoneyNumber(m.originalText)
    return n != null && /zł|pln|\d/.test(m.originalText + m.proposedValue)
  })

  for (const m of numericMembers) {
    const amount =
      parseMoneyNumber(m.proposedValue) ?? parseMoneyNumber(m.originalText)
    if (amount == null) continue

    const oldAmount = parseMoneyNumber(m.originalText)
    if (oldAmount != null && oldAmount === amount) continue

    const linked = findLinkedAmountInWordsSpans({
      member: m,
      groupKind: group.kind,
      anchors,
      allRows,
    })

    if (linked.length === 0) {
      // No textual amount in document for this money — OK (not every clause has słownie).
      continue
    }

    for (const { anchorId, span } of linked) {
      const expected = formatAmountInWordsLikeSource({
        amount,
        sourceSpan: span.exactSourceText,
      })
      const already = allRows.find(
        (r) =>
          r.anchorId === anchorId &&
          r.originalText === span.exactSourceText &&
          (r.decision === 'approved' || r.decision === 'pending'),
      )
      if (already) {
        if (
          already.proposedValue !== expected &&
          !wordsMatchAmount(already.proposedValue, amount)
        ) {
          group.status = 'BLOCKED'
          group.reasons.push(
            `Amount-in-words mismatch for ${amount}: expected „${expected}”`,
          )
        }
        continue
      }

      if (wordsMatchAmount(span.wordsBody, amount)) {
        continue
      }

      group.suggestedLinkedPatches.push({
        anchorId,
        originalText: span.exactSourceText,
        proposedValue: expected,
        reason: `Linked textual amount for ${group.kind}`,
        linkedToReplacementId: m.replacementId,
      })
      group.status = group.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW'
      group.reasons.push('linked textual amount missing')
    }
  }
}

function parseLooseDate(value: string): Date | null {
  const t = value.trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const pl = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (pl) {
    const d = new Date(Number(pl[3]), Number(pl[2]) - 1, Number(pl[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function validateWeddingDateGroup(group: PatchGroup): void {
  const dates = group.members
    .map((m) => ({
      m,
      d: parseLooseDate(m.proposedValue) ?? parseLooseDate(m.originalText),
    }))
    .filter((x): x is { m: PatchGroupMember; d: Date } => x.d != null)

  if (dates.length < 2) return

  const wedding = dates.find(
    (x) =>
      (x.m.fieldKey ?? '').includes('wedding.date') ||
      /wedding|ślub/i.test(x.m.fieldKey ?? ''),
  )
  if (!wedding) return

  for (const other of dates) {
    if (other.m.replacementId === wedding.m.replacementId) continue
    const key = (other.m.fieldKey ?? '').toLowerCase()
    if (key.includes('delivery') || key.includes('final_payment') || key.includes('preview')) {
      if (other.d.getTime() < wedding.d.getTime()) {
        group.status = 'BLOCKED'
        group.reasons.push(
          `date dependency mismatch: ${other.m.fieldKey} before wedding date`,
        )
      }
    }
  }
}

function validateLocationGroup(group: PatchGroup, rows: LabReplacementRow[]): void {
  for (const m of group.members) {
    const row = rows.find((r) => r.replacementId === m.replacementId)
    const before =
      row?.prefixContext ??
      (row?.contextSnippet?.split(row.originalText)[0] ?? '')
    const contractDisplay = m.displayValue
    const grammar = validateLocationGrammar({
      beforeContext: before,
      replacementText: contractDisplay ?? m.proposedValue,
      contractDisplay,
    })
    if (!grammar.ok) {
      group.status = 'REVIEW'
      group.reasons.push(
        `${m.replacementId}: ${grammar.reason ?? 'Location display unavailable'}`,
      )
    }
  }
}

function validateLocalContexts(
  group: PatchGroup,
  rows: LabReplacementRow[],
): void {
  for (const m of group.members) {
    const row = rows.find((r) => r.replacementId === m.replacementId)
    const before = row?.prefixContext ?? ''
    const after = row?.suffixContext ?? ''
    const local = validateLocalContext({
      before,
      oldValue: m.originalText,
      newValue: m.displayValue ?? m.proposedValue,
      after,
    })
    if (!local.ok) {
      group.status = 'BLOCKED'
      group.reasons.push(
        `${m.replacementId}: ${local.reason ?? 'local context invalid'}`,
      )
    }
  }
}

/**
 * Run Phase C validation over approved plan rows.
 */
export function runPhaseCDocumentReadyAudit(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
  mappingRows?: SemanticMappingRow[]
  canonicalFields?: ContractCanonicalField[]
  canonicalEntityType?: LegalEntityType
  templateConfig?: Partial<ContractTemplateVariableConfig> | null
  fieldConfiguration?: ContractTemplateConfiguration | null
  /** Optional package content document items for semantic re-check. */
  packageDocumentItems?: Array<{ text: string }>
  packageCanonicalItems?: string[]
}): PhaseCAuditResult {
  const fromSaved = input.fieldConfiguration
    ? toContractTemplateVariableConfig(input.fieldConfiguration)
    : null
  const templateConfig = resolveTemplateConfig({
    ...fromSaved,
    ...input.templateConfig,
  })
  const shared = reconcileSharedLocationPatches({
    rows: input.rows,
    anchors: input.anchors,
    policy: input.fieldConfiguration?.sharedLocationPolicy,
  })
  const physicalPlan = buildPhysicalPatchPlan({
    rows: shared.rows,
    anchors: input.anchors,
  })
  const structuralCompatibility = runStructuralCompatibilityAudit({
    rows: shared.rows,
    mappingRows: input.mappingRows,
    anchors: input.anchors,
    canonicalFields: input.canonicalFields,
    canonicalEntityType: input.canonicalEntityType,
    patchConflicts: physicalPlan.conflicts,
    templateConfig,
    sharedLocationReviews: shared.reviewItems,
  })
  const auditRows = physicalPlan.rows
  const groups = buildPatchGroups({ rows: auditRows, anchors: input.anchors })
  const downgrade = new Set<string>()
  const linked: PhaseCAuditResult['linkedPatches'] = []
  const blockers: string[] = []
  const warnings: string[] = []

  for (const group of groups) {
    validateLocalContexts(group, auditRows)

    if (
      group.kind === 'contract_value' ||
      group.kind === 'remaining_amount' ||
      group.kind === 'deposit'
    ) {
      validateMoneyGroup(group, input.anchors, auditRows)
    }
    if (group.kind === 'wedding_date') {
      validateWeddingDateGroup(group)
    }
    if (group.kind === 'location') {
      validateLocationGroup(group, auditRows)
    }
    if (group.kind === 'package' && input.packageCanonicalItems) {
      for (const item of input.packageDocumentItems ?? []) {
        const cmp = comparePackageItemSemantically({
          documentText: item.text,
          canonicalItems: input.packageCanonicalItems,
        })
        if (cmp.status === 'DOCUMENT_ONLY') {
          warnings.push(`Package item DOCUMENT_ONLY: ${item.text}`)
        }
        if (cmp.status === 'REVIEW') {
          warnings.push(`Package item needs review: ${item.text}`)
        }
      }
    }

    if (group.status === 'REVIEW' || group.status === 'BLOCKED') {
      for (const m of group.members) downgrade.add(m.replacementId)
      for (const s of group.suggestedLinkedPatches) linked.push(s)
      for (const r of group.reasons) {
        if (group.status === 'BLOCKED') blockers.push(`[${group.kind}] ${r}`)
        else warnings.push(`[${group.kind}] ${r}`)
      }
    }
  }

  for (const structuralBlocker of structuralCompatibility.blockers) {
    blockers.push(
      `[structure:${structuralBlocker.code}] ${structuralBlocker.message}`,
    )
    const affected = input.rows.filter(
      (row) =>
        structuralBlocker.anchors.includes(row.anchorId) ||
        structuralBlocker.semanticRoles.includes(row.semanticRole),
    )
    for (const row of affected) downgrade.add(row.replacementId)
  }
  for (const structuralWarning of structuralCompatibility.warnings) {
    warnings.push(
      `[structure:${structuralWarning.code}] ${structuralWarning.message}`,
    )
  }

  // Quality score
  let score = 100
  score -= blockers.length * 15
  score -= warnings.length * 5
  score -= linked.length * 8
  score -= groups.filter((g) => g.status === 'REVIEW').length * 6
  score = Math.max(0, Math.min(100, score))

  // Linked textual amount missing is a hard blocker for generation
  if (linked.length > 0) {
    blockers.push(
      'numeric/text amount mismatch — linked textual amount must be patched',
    )
  }

  const hardFail =
    structuralCompatibility.status !== 'PASS' ||
    linked.length > 0 ||
    groups.some((g) => g.status === 'BLOCKED') ||
    blockers.length > 0 ||
    groups.some((g) => g.status === 'REVIEW' && g.kind === 'location')

  if (groups.some((g) => g.status === 'REVIEW' && g.kind === 'location')) {
    blockers.push('Location display unavailable — contract display form required')
  }

  const audit: 'PASS' | 'FAIL' =
    !hardFail && score >= 95 ? 'PASS' : 'FAIL'

  return {
    groups,
    qualityScore: score,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    audit: hardFail || score < 65 ? 'FAIL' : audit,
    downgradeReplacementIds: [...downgrade],
    linkedPatches: linked,
    structuralCompatibility,
    reconciledRows: auditRows,
  }
}

/**
 * Apply Phase C outcomes: downgrade failing rows to pending, inject linked
 * amount-in-words patches as approved (deterministic) rows.
 */
export function applyPhaseCToRows(input: {
  rows: LabReplacementRow[]
  audit: PhaseCAuditResult
  anchors?: DocumentTextAnchor[]
}): LabReplacementRow[] {
  const downgrade = new Set(input.audit.downgradeReplacementIds)
  const next = input.rows.map((r) => {
    if (!downgrade.has(r.replacementId)) return r
    if (r.decision === 'approved') {
      return {
        ...r,
        decision: 'pending' as const,
        reason: `${r.reason} · Phase C: document-ready review required`,
        requiresUserReview: true,
      }
    }
    return r
  })

  const existing = new Set(
    next.map((r) => `${r.anchorId}::${r.originalText}`),
  )
  for (const patch of input.audit.linkedPatches) {
    const key = `${patch.anchorId}::${patch.originalText}`
    if (existing.has(key)) continue
    existing.add(key)
    const anchor = input.anchors?.find((a) => a.anchorId === patch.anchorId)
    const start = anchor?.text.indexOf(patch.originalText) ?? -1
    next.push({
      replacementId: `phase-c-words:${patch.linkedToReplacementId}:${patch.anchorId}`,
      anchorId: patch.anchorId,
      originalText: patch.originalText,
      canonicalFieldKey: null,
      proposedValue: patch.proposedValue,
      semanticRole: 'amount_in_words',
      reason: `Phase C: ${patch.reason}`,
      confidence: 1,
      confidenceLabel: 'Wysoka',
      source: 'wedding',
      decision: 'approved',
      manualValue: null,
      missingId: null,
      requiresUserReview: false,
      contextSnippet: anchor
        ? `«${anchor.text.slice(0, 160)}${anchor.text.length > 160 ? '…' : ''}»`
        : null,
      spanStatus: start >= 0 ? 'exact' : 'not_found',
      spanMessage: null,
      aiProposedSourceText: patch.originalText,
      spanCandidates: [],
      spanStart: start >= 0 ? start : null,
      spanEnd: start >= 0 ? start + patch.originalText.length : null,
      prefixContext: null,
      suffixContext: null,
    })
  }
  return next
}

/** Whether generation may proceed. */
export function phaseCAllowsGeneration(audit: PhaseCAuditResult): boolean {
  return (
    audit.structuralCompatibility.status === 'PASS' &&
    audit.audit === 'PASS' &&
    audit.qualityScore >= 95 &&
    audit.blockers.length === 0 &&
    audit.linkedPatches.length === 0
  )
}
