/**
 * Phase C structural compatibility.
 *
 * Deterministic and local: it uses Phase B rows, exact anchors, and canonical
 * snapshot fields. It never calls AI and never rewrites complete legal clauses.
 */

import type {
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'
import { segmentCompanyPartyClause } from '@/features/documents/template/segmentCompanyClause'
import {
  CLIENT_VARIABLE_ROLES,
  resolveTemplateConfig,
  type ContractTemplateVariableConfig,
} from '@/features/ai-contract-lab/templateFieldPolicy'
import type {
  DocumentPartyStructure,
  DocumentPaymentSchedule,
  ExactSpan,
  LegalEntityType,
  MoneyValue,
  RelativeTemporalExpression,
  StructuralBlocker,
  StructuralCompatibilityInput,
  StructuralCompatibilityResult,
  StructuralEvidence,
  StructuralWarning,
} from '@/features/ai-contract-lab/phaseCStructuralTypes'

const PESEL_RE = /\b\d{11}\b/g
const EMAIL_RE =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_RE =
  /(?:\+48\s*)?(?:\d{3}[\s-]\d{3}[\s-]\d{3}|\d{3}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2})/g
const MONEY_RE =
  /\b(\d{1,3}(?:[ \u00a0\u202f.]\d{3})*|\d+)(?:[,.](\d{2}))?\s*(zł|PLN)/gi
const TIME_RANGE_RE =
  /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/

const PERSONAL_ROLES = CLIENT_VARIABLE_ROLES

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function canonicalMap(
  fields: ContractCanonicalField[] = [],
): Map<string, ContractCanonicalField> {
  return new Map(fields.map((field) => [field.key, field]))
}

function fieldText(
  fields: Map<string, ContractCanonicalField>,
  key: string,
): string | null {
  const field = fields.get(key)
  const value = field?.formattedValue ?? field?.value
  if (value == null || value === '') return null
  return String(value).trim() || null
}

function evidence(
  anchor: DocumentTextAnchor,
  sourceFragment = anchor.text,
  start?: number,
  end?: number,
): StructuralEvidence {
  return {
    anchorId: anchor.anchorId,
    sourceFragment,
    start,
    end,
  }
}

function addElement(
  structure: DocumentPartyStructure,
  anchor: DocumentTextAnchor,
  kind: DocumentPartyStructure['identityElements'][number]['kind'],
  value: string,
): void {
  const start = anchor.text.indexOf(value)
  if (start < 0) return
  const key = `${anchor.anchorId}:${kind}:${start}:${value}`
  if (
    structure.identityElements.some(
      (item) =>
        `${item.anchorId}:${item.kind}:${item.start}:${item.value}` === key,
    )
  ) {
    return
  }
  structure.identityElements.push({
    kind,
    value,
    anchorId: anchor.anchorId,
    start,
    end: start + value.length,
  })
}

function contractorIdentityAnchors(
  anchors: DocumentTextAnchor[],
  mappingRows: SemanticMappingRow[] = [],
): DocumentTextAnchor[] {
  const sorted = [...anchors].sort((a, b) => a.paragraphIndex - b.paragraphIndex)
  const between = sorted.findIndex((a) => /\bpomiędzy\s*:?/i.test(a.text))
  const couple = sorted.findIndex(
    (a, index) => index > between && /\ba\s+Parą\s+Młodą\b/i.test(a.text),
  )
  if (between >= 0 && couple > between) {
    return sorted
      .slice(between + 1, couple + 1)
      .filter((anchor) => anchor.text.trim())
  }

  const companyAnchorIds = new Set(
    mappingRows
      .filter((row) => {
        const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
        return (
          role.startsWith('company_') ||
          role === 'bank_account' ||
          row.mappedFieldKey?.startsWith('company.')
        )
      })
      .map((row) => row.anchorId),
  )
  const indices = sorted
    .filter((anchor) => companyAnchorIds.has(anchor.anchorId))
    .map((anchor) => anchor.paragraphIndex)
  if (indices.length === 0) {
    return sorted.filter((anchor) =>
      /spółk[ai]\s+cywiln|pod\s+firmą|prowadzącymi|zwanymi\s+dalej\s+["„]Wykonawc/i.test(
        anchor.text,
      ),
    )
  }
  const min = Math.min(...indices) - 3
  const max = Math.max(...indices) + 3
  return sorted.filter(
    (anchor) =>
      anchor.paragraphIndex >= min &&
      anchor.paragraphIndex <= max &&
      anchor.text.trim(),
  )
}

export function detectDocumentPartyStructure(input: {
  anchors: DocumentTextAnchor[]
  mappingRows?: SemanticMappingRow[]
}): DocumentPartyStructure {
  const identityAnchors = contractorIdentityAnchors(
    input.anchors,
    input.mappingRows,
  )
  const joined = identityAnchors.map((anchor) => anchor.text).join('\n')
  let entityType: LegalEntityType = 'unknown'
  if (/spółk[ai]\s+cywiln|\bs\.c\./i.test(joined)) {
    entityType = 'civil_partnership'
  } else if (/sp\.\s*z\s*o\.o\.|spółk[ai]\s+z\s+ograniczon/i.test(joined)) {
    entityType = 'limited_company'
  } else if (/sp\.\s*j\.|sp\.\s*k\.|spółk[ai]\s+(?:jawn|komandyt)/i.test(joined)) {
    entityType = 'partnership'
  }

  const grammaticalNumber =
    /\b(prowadzącymi|zwanymi|reprezentowanymi)\b/i.test(joined)
      ? 'plural'
      : /\b(prowadzącym|zwanym|reprezentowanym)\b/i.test(joined)
        ? 'singular'
        : 'unknown'

  const structure: DocumentPartyStructure = {
    entityType,
    naturalPersons: [],
    grammaticalNumber,
    sourceAnchors: identityAnchors.map((anchor) => anchor.anchorId),
    identityElements: [],
  }

  for (const anchor of identityAnchors) {
    const text = anchor.text
    const pesels = [...text.matchAll(new RegExp(PESEL_RE.source, 'g'))]
    const emails = [...text.matchAll(new RegExp(EMAIL_RE.source, 'gi'))]
    const phones = [...text.matchAll(new RegExp(PHONE_RE.source, 'g'))]

    if (pesels.length > 0) {
      const beforePesel = text
        .slice(0, pesels[0]!.index ?? 0)
        .replace(/^(?:oraz\s+)?/i, '')
        .replace(/[,:]\s*$/u, '')
        .trim()
      const person = beforePesel.match(
        /([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)$/u,
      )?.[1]
      structure.naturalPersons.push({
        fullName: person,
        pesel: pesels[0]![0],
        email: emails[0]?.[0],
        phone: phones[0]?.[0],
        sourceAnchor: anchor.anchorId,
      })
      if (person) addElement(structure, anchor, 'person_name', person)
    }
    for (const match of pesels) addElement(structure, anchor, 'pesel', match[0])
    for (const match of emails) addElement(structure, anchor, 'email', match[0])
    for (const match of phones) addElement(structure, anchor, 'phone', match[0])

    const firm = /\bpod\s+firmą\s+/i.exec(text)
    if (firm?.index != null) {
      const segmented = segmentCompanyPartyClause(
        text,
        firm.index,
        firm[0].length,
      )
      if (segmented.companyName) {
        structure.companyName = segmented.companyName.text
        addElement(
          structure,
          anchor,
          'company_name',
          segmented.companyName.text,
        )
      }
      if (segmented.legalForm) {
        addElement(structure, anchor, 'legal_form', segmented.legalForm)
      }
      if (segmented.address) {
        addElement(structure, anchor, 'address', segmented.address.text)
      }
      for (const representative of segmented.representatives) {
        addElement(
          structure,
          anchor,
          'person_name',
          representative.text,
        )
      }
    }

    const nip = /\bNIP\s*:\s*([0-9 -]{10,14})/i.exec(text)?.[1]?.trim()
    if (nip) {
      structure.taxId = nip.replace(/\D/g, '')
      addElement(structure, anchor, 'tax_id', nip)
    }
    const regon =
      /\bREGON\s*:\s*([0-9 -]{9,14})/i.exec(text)?.[1]?.trim()
    if (regon) {
      structure.registrationNumber = regon.replace(/\D/g, '')
      addElement(structure, anchor, 'registration_number', regon)
    }
    const grammar =
      /\b(prowadzącymi|zwanymi|reprezentowanymi|prowadzącym|zwanym|reprezentowanym)\b/i.exec(
        text,
      )?.[1]
    if (grammar) addElement(structure, anchor, 'grammar', grammar)
  }

  if (
    structure.entityType === 'unknown' &&
    structure.naturalPersons.length === 1 &&
    structure.grammaticalNumber === 'singular'
  ) {
    structure.entityType = 'individual'
  }
  return structure
}

function rowCoversElement(
  row: LabReplacementRow,
  element: DocumentPartyStructure['identityElements'][number],
): boolean {
  if (row.anchorId !== element.anchorId) return false
  if (row.spanStart != null && row.spanEnd != null) {
    return row.spanStart <= element.start && row.spanEnd >= element.end
  }
  return (
    row.originalText.includes(element.value) ||
    element.value.includes(row.originalText)
  )
}

function companyIdentityRows(rows: LabReplacementRow[]): LabReplacementRow[] {
  return rows.filter((row) => {
    const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
    return (
      role.startsWith('company_') ||
      role === 'bank_account' ||
      row.canonicalFieldKey?.startsWith('company.')
    )
  })
}

function validateIdentityStructure(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
): void {
  const structure = detectDocumentPartyStructure(input)
  const identityRows = companyIdentityRows(input.rows)
  const changingRows = identityRows.filter(
    (row) => row.decision === 'approved' || row.decision === 'pending',
  )
  if (structure.sourceAnchors.length === 0 || changingRows.length === 0) return

  if (
    input.canonicalEntityType &&
    input.canonicalEntityType !== 'unknown' &&
    structure.entityType !== 'unknown' &&
    structure.entityType !== input.canonicalEntityType
  ) {
    blockers.push({
      code: 'legal_entity_structure_mismatch',
      message:
        'The template contractor identity structure is incompatible with the canonical business entity. Value-only patches would leave stale legal identities or invalid grammatical wording.',
      anchors: structure.sourceAnchors,
      semanticRoles: unique(identityRows.map((row) => row.semanticRole)),
      patchGroup: 'company_identity',
      manualResolutionPossible: true,
      metadata: {
        documentEntityType: structure.entityType,
        canonicalEntityType: input.canonicalEntityType,
        staleIdentityFields: structure.identityElements.map((item) => ({
          kind: item.kind,
          value: item.value,
          anchorId: item.anchorId,
        })),
      },
    })
  } else if (
    (!input.canonicalEntityType || input.canonicalEntityType === 'unknown') &&
    structure.entityType !== 'unknown'
  ) {
    blockers.push({
      code: 'unresolved_required_business_value',
      message:
        'Canonical business legal entity type is unavailable, so the contractor identity structure cannot be validated safely.',
      anchors: structure.sourceAnchors,
      semanticRoles: unique(identityRows.map((row) => row.semanticRole)),
      patchGroup: 'company_identity',
      manualResolutionPossible: false,
      metadata: {
        requiredValue: 'canonical legal entity type',
        documentEntityType: structure.entityType,
      },
    })
  }

  const explicitlyPreserved = identityRows.filter(
    (row) => row.decision === 'rejected',
  )
  const stale = structure.identityElements.filter((element) => {
    if (
      element.kind === 'company_name' ||
      element.kind === 'address' ||
      element.kind === 'tax_id' ||
      element.kind === 'registration_number'
    ) {
      return false
    }
    return ![...changingRows, ...explicitlyPreserved].some((row) =>
      rowCoversElement(row, element),
    )
  })

  if (stale.length > 0) {
    blockers.push({
      code: 'unsafe_identity_block_patch',
      message:
        'Only part of the contractor identity would be changed. Original natural-person identities, contact details, legal form, or grammatical wording would remain.',
      anchors: unique(stale.map((item) => item.anchorId)),
      semanticRoles: unique(identityRows.map((row) => row.semanticRole)),
      patchGroup: 'company_identity',
      manualResolutionPossible: true,
      evidence: stale.map((item) => ({
        anchorId: item.anchorId,
        sourceFragment: item.value,
        start: item.start,
        end: item.end,
      })),
      metadata: {
        staleIdentityFields: stale.map((item) => ({
          kind: item.kind,
          value: item.value,
          anchorId: item.anchorId,
        })),
      },
    })
  }
}

function validateMissingClientData(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
): void {
  const rows = input.mappingRows ?? []
  for (const row of rows) {
    const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
    if (!PERSONAL_ROLES.has(role)) continue
    if (!row.documentValue?.trim() && !row.sourceText?.trim()) continue
    if (row.canonicalValue?.trim() || row.derivedValue?.trim()) continue

    blockers.push({
      code: 'missing_canonical_client_data',
      message:
        'Document contains client/couple personal data, but no canonical replacement value is available.',
      anchors: [row.anchorId],
      semanticRoles: [role],
      patchGroup: 'personal_data',
      manualResolutionPossible: true,
      evidence: [
        {
          anchorId: row.anchorId,
          sourceFragment: row.documentValue || row.sourceText,
        },
      ],
      metadata: {
        mappedFieldKey: row.mappedFieldKey,
        requiredPartyIdentity: /name|address|pesel|identity_document/.test(role),
        blockerAlias: 'missing_required_client_data',
      },
    })
  }
}

function temporalUnit(raw: string):
  | RelativeTemporalExpression['unit']
  | null {
  if (/dni\w*\s+robocz|dzień\s+robocz/i.test(raw)) return 'business_days'
  if (/\b(?:dni|dzień|dnia|dn\.)\b/i.test(raw)) return 'calendar_days'
  if (/\btygod/i.test(raw)) return 'weeks'
  if (/\bmiesi/i.test(raw)) return 'months'
  if (/\b(?:lat|lata|rok|roku)\b/i.test(raw)) return 'years'
  return null
}

export function parseRelativeTemporalExpression(input: {
  anchor: DocumentTextAnchor
  referenceRole?: string
}): RelativeTemporalExpression | null {
  const text = input.anchor.text
  const match =
    /(\d+)\s+(dni\w*\s+robocz\w*|dni|dzień|dnia|tygodni\w*|miesi(?:ąc|ące|ęcy)|lat|lata|rok(?:u)?)\s*(?:od|po|przed)?\s*(?:dnia|daty)?\s*([^.,;]*)/i.exec(
      text,
    )
  if (!match?.[0] || match.index == null) return null
  const unit = temporalUnit(`${match[1]} ${match[2]}`)
  if (!unit) return null
  const numericOffset = match[0].indexOf(match[1]!)
  const unitOffset = match[0].indexOf(match[2]!)
  const relation: RelativeTemporalExpression['relation'] =
    /\bprzed\b/i.test(match[0])
      ? 'before'
      : /\bpo\b/i.test(match[0])
        ? 'after'
        : 'from'
  const reference =
    input.referenceRole ??
    (/ślub|wesel/i.test(match[3] ?? '') ? 'wedding_date' : 'unknown')
  const fullText = match[0].trim()
  const trimStart = match[0].indexOf(fullText)
  const fullStart = match.index + trimStart
  return {
    amount: Number(match[1]),
    unit,
    relation,
    referenceRole: reference,
    fullExpressionSpan: {
      anchorId: input.anchor.anchorId,
      start: fullStart,
      end: fullStart + fullText.length,
      exactSourceText: fullText,
    },
    numericSpan: {
      anchorId: input.anchor.anchorId,
      start: match.index + numericOffset,
      end: match.index + numericOffset + match[1]!.length,
      exactSourceText: match[1]!,
    },
    unitSpan: {
      anchorId: input.anchor.anchorId,
      start: match.index + unitOffset,
      end: match.index + unitOffset + match[2]!.length,
      exactSourceText: match[2]!,
    },
  }
}

function validateTemporalChanges(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
  config: ContractTemplateVariableConfig,
): void {
  if (config.deliveryTermMode !== 'variable') return
  const fields = canonicalMap(input.canonicalFields)
  for (const row of input.rows) {
    const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
    if (
      role !== 'delivery_deadline' &&
      role !== 'deposit_due_date' &&
      role !== 'preview_deadline'
    ) {
      continue
    }
    if (row.decision === 'rejected' || row.decision === 'unchanged') continue
    const anchor = input.anchors.find((item) => item.anchorId === row.anchorId)
    if (!anchor) continue
    const oldExpression = parseRelativeTemporalExpression({
      anchor,
      referenceRole: role === 'deposit_due_date' ? 'contract_date' : 'wedding_date',
    })
    if (!oldExpression) continue

    const canonicalText =
      role === 'delivery_deadline'
        ? fieldText(fields, 'package.delivery_term') ?? row.proposedValue
        : row.proposedValue
    const newUnit = temporalUnit(canonicalText)
    if (!newUnit || newUnit === oldExpression.unit) continue

    const coversFullExpression =
      row.spanStart != null &&
      row.spanEnd != null &&
      oldExpression.fullExpressionSpan != null &&
      row.spanStart <= oldExpression.fullExpressionSpan.start &&
      row.spanEnd >= oldExpression.fullExpressionSpan.end &&
      temporalUnit(row.originalText) != null
    if (coversFullExpression) continue

    blockers.push({
      code: 'unsafe_variable_temporal_patch',
      message:
        'Relative temporal unit changed, but only the numeric source span is patchable.',
      anchors: [row.anchorId],
      semanticRoles: [role],
      patchGroup: 'temporal',
      manualResolutionPossible: true,
      evidence: [
        evidence(
          anchor,
          oldExpression.fullExpressionSpan?.exactSourceText ?? row.originalText,
          oldExpression.fullExpressionSpan?.start,
          oldExpression.fullExpressionSpan?.end,
        ),
      ],
      metadata: {
        oldExpression,
        canonicalExpression: canonicalText,
        canonicalUnit: newUnit,
        selectedPatchSpan: {
          start: row.spanStart,
          end: row.spanEnd,
          text: row.originalText,
        },
        legacyCode: 'unsafe_temporal_unit_change',
      },
    })
  }
}

function clockMinutes(hour: string, minute: string): number {
  return Number(hour) * 60 + Number(minute)
}

export function parseCoverageRange(anchor: DocumentTextAnchor): {
  startTime: string
  endTime: string
  durationHours: number
  span: ExactSpan
} | null {
  const match = TIME_RANGE_RE.exec(anchor.text)
  if (!match?.[0] || match.index == null) return null
  const start = clockMinutes(match[1]!, match[2]!)
  let end = clockMinutes(match[3]!, match[4]!)
  if (end <= start) end += 24 * 60
  return {
    startTime: `${match[1]!.padStart(2, '0')}:${match[2]}`,
    endTime: `${match[3]!.padStart(2, '0')}:${match[4]}`,
    durationHours: (end - start) / 60,
    span: {
      anchorId: anchor.anchorId,
      start: match.index,
      end: match.index + match[0].length,
      exactSourceText: match[0],
    },
  }
}

function validateCoverage(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
  warnings: StructuralWarning[],
  config: ContractTemplateVariableConfig,
): void {
  // Only validate when package time fields are variable AND a coverage change is proposed.
  if (config.packageFields?.workingTime === false) return
  if (config.packageFields?.coverageHours === false) return

  const coverageChange = input.rows.some((row) => {
    const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
    return (
      (row.decision === 'approved' || row.decision === 'pending') &&
      (role === 'package_duration' ||
        role === 'coverage_hours' ||
        role === 'working_hours' ||
        role === 'coverage_start_time' ||
        role === 'coverage_end_time')
    )
  })
  if (!coverageChange) return

  const fields = canonicalMap(input.canonicalFields)
  const targetRaw = fieldText(fields, 'package.coverage_hours')
  const target = targetRaw == null ? null : Number(targetRaw.replace(',', '.'))
  const ranges = input.anchors
    .map((anchor) => ({ anchor, range: parseCoverageRange(anchor) }))
    .filter(
      (
        item,
      ): item is {
        anchor: DocumentTextAnchor
        range: NonNullable<ReturnType<typeof parseCoverageRange>>
      } => item.range != null,
    )
  if (ranges.length === 0) return

  for (const { anchor, range } of ranges) {
    if (target == null || !Number.isFinite(target)) {
      warnings.push({
        code: 'package_time_configuration_incomplete',
        message:
          'Coverage hours would change, but no matching canonical start/end time range is available.',
        anchors: [anchor.anchorId],
        semanticRoles: ['package_duration'],
        patchGroup: 'coverage',
        evidence: [evidence(anchor, range.span.exactSourceText)],
      })
      continue
    }
    if (Math.abs(target - range.durationHours) > 0.001) {
      blockers.push({
        code: 'package_time_configuration_incomplete',
        message:
          'Coverage hours and the explicit start/end time range do not match. Provide a matching time range or confirm the package configuration.',
        anchors: [anchor.anchorId],
        semanticRoles: ['package_duration', 'coverage_start_time', 'coverage_end_time'],
        patchGroup: 'coverage',
        manualResolutionPossible: true,
        evidence: [
          evidence(
            anchor,
            range.span.exactSourceText,
            range.span.start,
            range.span.end,
          ),
        ],
        metadata: {
          canonicalCoverageHours: target,
          documentRangeHours: range.durationHours,
          startTime: range.startTime,
          endTime: range.endTime,
          legacyCode: 'coverage_group_inconsistency',
        },
      })
    }
  }
}

function moneyFromMatch(match: RegExpExecArray): MoneyValue {
  const whole = match[0]
  const integer = match[1]!.replace(/[ \u00a0\u202f.]/g, '')
  const fraction = match[2] ?? '00'
  return {
    amount: Number(`${integer}.${fraction}`),
    currency: 'PLN',
    sourceText: whole,
  }
}

function moneyValues(text: string): Array<{ money: MoneyValue; start: number; end: number }> {
  const out: Array<{ money: MoneyValue; start: number; end: number }> = []
  const re = new RegExp(MONEY_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    out.push({
      money: moneyFromMatch(match),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return out
}

export function parseDocumentPaymentSchedule(
  anchors: DocumentTextAnchor[],
): DocumentPaymentSchedule {
  const schedule: DocumentPaymentSchedule = { entries: [] }
  for (const anchor of anchors) {
    const text = anchor.text
    if (/kar[ay]\s+umown|50%\s+ustalonego\s+wynagrodzenia/i.test(text)) {
      continue
    }
    const values = moneyValues(text)
    if (values.length === 0) continue

    if (
      /wynagrodzen.*\bwynosi\s*:/i.test(text) ||
      /łączn\w*\s+(?:kwot|wynagrodzen|wartość)/i.test(text)
    ) {
      schedule.total = values[0]!.money
      continue
    }
    if (!/\brat[ayę]\b/i.test(text)) continue

    const method: DocumentPaymentSchedule['entries'][number]['method'] =
      /gotówk\w*.*(?:lub|albo).*przelew|przelew\w*.*(?:lub|albo).*gotówk/i.test(
        text,
      )
        ? 'cash_or_transfer'
        : /gotówk/i.test(text)
          ? 'cash'
          : /przelew/i.test(text)
            ? 'bank_transfer'
            : 'unknown'
    const trigger: DocumentPaymentSchedule['entries'][number]['trigger'] =
      /w dniu (?:ślubu|wesela)|dzień (?:ślubu|wesela)/i.test(text)
        ? 'wedding_day'
        : /przy odebraniu|po odbiorze|przy odbiorze|dostarczen/i.test(text)
          ? 'delivery'
          : /podpisani|zawarci/i.test(text)
            ? 'contract_signing'
            : 'unknown'
    const value = values[0]!
    schedule.entries.push({
      amount: value.money,
      trigger,
      method,
      label: /\b(pierwsza|druga|trzecia|czwarta)\s+rata\b/i.exec(text)?.[0],
      sourceAnchor: anchor.anchorId,
      sourceSpan: {
        anchorId: anchor.anchorId,
        start: value.start,
        end: value.end,
        exactSourceText: value.money.sourceText,
      },
    })
  }
  return schedule
}

function validatePaymentSchedule(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
  config: ContractTemplateVariableConfig,
): void {
  // Fixed payment clauses are template-owner invariants — never block.
  if (config.paymentMode !== 'variable') return

  const schedule = parseDocumentPaymentSchedule(input.anchors)
  const scheduleMarker = input.anchors.find((anchor) =>
    /płatne\s+jest\s+w\s+\w+\s+ratach|płatn\w*\s+w\s+\d+\s+ratach/i.test(
      anchor.text,
    ),
  )
  if (!scheduleMarker && schedule.entries.length < 2) return

  const fields = canonicalMap(input.canonicalFields)
  const canonicalTotalRaw = fieldText(fields, 'package.contract_value')
  const canonicalTotal =
    canonicalTotalRaw == null
      ? null
      : Number(canonicalTotalRaw.replace(/zł|PLN/gi, '').replace(/\s/g, '').replace(',', '.'))
  const sum = schedule.entries.reduce(
    (total, entry) => total + (entry.amount?.amount ?? 0),
    0,
  )
  const documentTotal = schedule.total?.amount ?? null
  const arithmeticPass =
    documentTotal != null && Math.abs(sum - documentTotal) < 0.001
  const changedTotal =
    canonicalTotal != null &&
    documentTotal != null &&
    Math.abs(canonicalTotal - documentTotal) > 0.001

  blockers.push({
    code: 'payment_schedule_structure_mismatch',
    message:
      'The document contains a multi-installment payment schedule that cannot be represented by isolated deposit and remaining-amount patches.',
    anchors: unique([
      ...(scheduleMarker ? [scheduleMarker.anchorId] : []),
      ...schedule.entries.map((entry) => entry.sourceAnchor),
    ]),
    semanticRoles: ['contract_value', 'deposit_amount', 'remaining_amount'],
    patchGroup: 'payment_schedule',
    manualResolutionPossible: true,
    evidence: [
      ...(scheduleMarker ? [evidence(scheduleMarker)] : []),
      ...schedule.entries.flatMap((entry) => {
        const anchor = input.anchors.find(
          (item) => item.anchorId === entry.sourceAnchor,
        )
        return anchor ? [evidence(anchor)] : []
      }),
    ],
    metadata: {
      schedule,
      installmentSum: sum,
      documentTotal,
      canonicalTotal,
      arithmeticPass,
      changedTotalLeavesStaleInstallments: changedTotal,
      automaticDepositMappingAllowed: false,
    },
  })
}

function validateLegalPenaltyIsolation(
  input: StructuralCompatibilityInput,
  blockers: StructuralBlocker[],
): void {
  const penaltyAnchors = input.anchors.filter((anchor) =>
    /kar[ay]\s+umown|50%\s+ustalonego\s+wynagrodzenia/i.test(anchor.text),
  )
  for (const anchor of penaltyAnchors) {
    const unsafeRows = input.rows.filter((row) => {
      if (row.anchorId !== anchor.anchorId) return false
      const role = normalizeSemanticRole(row.semanticRole) ?? row.semanticRole
      return (
        row.decision === 'approved' &&
        (role === 'contract_value' ||
          role === 'deposit_amount' ||
          role === 'remaining_amount')
      )
    })
    if (unsafeRows.length === 0) continue
    blockers.push({
      code: 'payment_schedule_structure_mismatch',
      message:
        'A legal penalty reference was classified as a payable contract amount and cannot be patched automatically.',
      anchors: [anchor.anchorId],
      semanticRoles: unsafeRows.map((row) => row.semanticRole),
      patchGroup: 'payment_schedule',
      manualResolutionPossible: true,
      evidence: [evidence(anchor)],
      metadata: { legalReferencePolicy: 'no_automatic_patch' },
    })
  }
}

export function runStructuralCompatibilityAudit(
  input: StructuralCompatibilityInput,
): StructuralCompatibilityResult {
  const blockers: StructuralBlocker[] = []
  const warnings: StructuralWarning[] = []
  const config = resolveTemplateConfig(input.templateConfig)

  // Company / legal-entity conversion is isolated behind templateMigrationMode.
  if (config.templateMigrationMode === true) {
    validateIdentityStructure(input, blockers)
  }

  validateMissingClientData(input, blockers)
  validateTemporalChanges(input, blockers, config)
  validateCoverage(input, blockers, warnings, config)
  validatePaymentSchedule(input, blockers, config)
  validateLegalPenaltyIsolation(input, blockers)

  for (const review of input.sharedLocationReviews ?? []) {
    blockers.push({
      code: 'shared_location_requires_decision',
      message: review.message,
      anchors: [review.anchorId],
      semanticRoles: review.semanticRoles,
      patchGroup: 'locations',
      manualResolutionPossible: true,
      evidence: [
        {
          anchorId: review.anchorId,
          sourceFragment: review.sourceValue,
        },
      ],
      metadata: { reviewCode: review.code },
    })
  }

  for (const conflict of input.patchConflicts ?? []) {
    // Location shared-span conflicts are handled as review items above when possible.
    const locationConflict = conflict.semanticRoles.every((role) =>
      /location|church|civil_office/i.test(role),
    )
    if (locationConflict) {
      blockers.push({
        code: 'shared_location_requires_decision',
        message:
          'Szablon ma jedno wspólne pole lokalizacji, ale zlecenie zawiera trzy różne miejsca.',
        anchors: [conflict.anchorId],
        semanticRoles: conflict.semanticRoles,
        patchGroup: 'locations',
        manualResolutionPossible: true,
        evidence: [
          {
            anchorId: conflict.anchorId,
            sourceFragment: conflict.sourceValue,
            start: conflict.start,
            end: conflict.end,
          },
        ],
        metadata: {
          physicalKey: conflict.physicalKey,
          proposedValues: conflict.proposedValues,
          replacementIds: conflict.replacementIds,
        },
      })
      continue
    }

    blockers.push({
      code:
        conflict.code === 'shared_source_span_conflict'
          ? 'conflicting_physical_patch'
          : 'duplicate_physical_patch',
      message:
        conflict.code === 'shared_source_span_conflict'
          ? 'One document value represents multiple semantic fields, but the canonical target values are different.'
          : 'Multiple resolver candidates overlap the same physical source span and no unique safe winner exists.',
      anchors: [conflict.anchorId],
      semanticRoles: conflict.semanticRoles,
      patchGroup: 'patch_conflicts',
      manualResolutionPossible: true,
      evidence: [
        {
          anchorId: conflict.anchorId,
          sourceFragment: conflict.sourceValue,
          start: conflict.start,
          end: conflict.end,
        },
      ],
      metadata: {
        physicalKey: conflict.physicalKey,
        proposedValues: conflict.proposedValues,
        replacementIds: conflict.replacementIds,
        legacyCode: conflict.code,
      },
    })
  }

  return {
    status:
      blockers.length > 0 ? 'FAIL' : warnings.length > 0 ? 'REVIEW' : 'PASS',
    blockers,
    warnings,
    patchConflicts: input.patchConflicts ?? [],
  }
}

