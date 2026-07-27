/**
 * Table-aware package-contract analysis.
 *
 * Classifies Word tables by header semantics and emits physical candidates
 * from cell coordinates. Does not invent registry keys; maps only to the
 * authoritative allowlist / immutable package-fact catalogs.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import { MONEY_AMOUNT_RE } from './contractMoneyClassification'
import type {
  DocxExtractedTable,
  IndexedParagraph,
} from './extractDocxParagraphs'
import {
  bindingIdForLocator,
  physicalLocatorFromOrigin,
  type DocxPhysicalLocator,
} from './docxPhysicalLocator'
import {
  isPackageContractAllowedDynamicKey,
  isPackageContractImmutableKey,
} from './packageContractAllowlist'
import type { ContractCandidate } from './candidateDetection'
import type { TemplateSlot } from './types'

export type PackageValueClassification =
  | 'dynamic_wedding_data'
  | 'immutable_package_fact'
  | 'unsupported_or_ambiguous'

export type InferredTableType =
  | 'event_schedule'
  | 'payment_schedule'
  | 'package_content'
  | 'unknown'

export interface TableCandidateTraceRow {
  rowIndex: number
  semanticLabel: string | null
  valueCells: Array<{ cellIndex: number; text: string }>
  detectedCandidates: Array<{
    key: string
    text: string
    classification: PackageValueClassification
    locator: DocxPhysicalLocator
  }>
  rejectedCandidates: Array<{
    key: string | null
    text: string
    reason: string
  }>
}

export interface TableCandidateTrace {
  tableIndex: number
  headerRow: string[]
  inferredTableType: InferredTableType
  rows: TableCandidateTraceRow[]
}

export interface PackageTableAnalysisResult {
  candidates: ContractCandidate[]
  traces: TableCandidateTrace[]
  classifications: Array<{
    key: string | null
    text: string
    classification: PackageValueClassification
    reason: string
    locator?: DocxPhysicalLocator
  }>
}

function normalizeHeaderToken(raw: string): string {
  return canonicalizeParagraphText(raw)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[/\u2044\u2215]/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[.,;:!?()[\]"'„”«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headerMatches(token: string, needles: string[]): boolean {
  return needles.some((n) => token === n || token.includes(n))
}

function classifyTableType(headerCells: string[]): InferredTableType {
  const tokens = headerCells.map(normalizeHeaderToken).filter(Boolean)
  const joined = tokens.join(' | ')

  const eventHits =
    (headerMatches(joined, ['etap']) ? 1 : 0) +
    (headerMatches(joined, ['miejsce', 'miejsce/opis', 'opis']) ? 1 : 0) +
    (headerMatches(joined, [
      'ramy czasowe',
      'godzina',
      'czas',
      'ramy czas',
    ])
      ? 1
      : 0)

  const paymentHits =
    (headerMatches(joined, ['rata', 'płatność', 'platnosc']) ? 1 : 0) +
    (headerMatches(joined, [
      'termin płatności',
      'termin platnosci',
      'termin',
    ])
      ? 1
      : 0) +
    (headerMatches(joined, ['kwota', 'wartość', 'wartosc']) ? 1 : 0)

  const packageHits = headerMatches(joined, [
    'zawartość',
    'zawartosc',
    'pakiet',
    'usługa',
    'usluga',
    'w pakiecie',
    'obejmuje',
  ])
    ? 2
    : 0

  if (eventHits >= 2 && eventHits >= paymentHits) return 'event_schedule'
  if (paymentHits >= 2 && paymentHits >= eventHits) return 'payment_schedule'
  if (packageHits >= 2) return 'package_content'
  return 'unknown'
}

type EventCol = 'stage' | 'place' | 'time' | 'other'
type PaymentCol = 'label' | 'due' | 'amount' | 'other'

function mapEventColumns(headerCells: string[]): EventCol[] {
  return headerCells.map((h) => {
    const t = normalizeHeaderToken(h)
    if (headerMatches(t, ['etap'])) return 'stage'
    if (headerMatches(t, ['miejsce', 'miejsce/opis', 'opis'])) return 'place'
    if (headerMatches(t, ['ramy czasowe', 'godzina', 'czas', 'ramy czas'])) {
      return 'time'
    }
    return 'other'
  })
}

function mapPaymentColumns(headerCells: string[]): PaymentCol[] {
  return headerCells.map((h) => {
    const t = normalizeHeaderToken(h)
    if (headerMatches(t, ['rata', 'płatność', 'platnosc'])) return 'label'
    if (
      headerMatches(t, ['termin płatności', 'termin platnosci']) ||
      t === 'termin'
    ) {
      return 'due'
    }
    if (headerMatches(t, ['kwota', 'wartość', 'wartosc'])) return 'amount'
    return 'other'
  })
}

type EventStage = 'preparation' | 'ceremony' | 'reception'

function classifyEventStage(label: string): EventStage | null {
  const t = normalizeHeaderToken(label)
  if (/^przygotowa/.test(t)) return 'preparation'
  if (/^ceremon/.test(t) || /^ślub/.test(t) || /^slub/.test(t)) return 'ceremony'
  if (
    /przyj[eę]cie/.test(t) ||
    /^wesel/.test(t) ||
    /^przyjęcie/.test(t) ||
    /^przyjecie/.test(t)
  ) {
    return 'reception'
  }
  return null
}

type PaymentRowKind = 'deposit' | 'installment' | 'final' | 'unknown'

function classifyPaymentRow(label: string): PaymentRowKind {
  const t = normalizeHeaderToken(label)
  if (/\bzadatek\b|\bzaliczk/.test(t) || /^i\s*rata$/.test(t) || /^1\s*rata/.test(t)) {
    return 'deposit'
  }
  if (
    /trzeci[aą]\s*rat|iii\s*rata|3\s*rata|ostatni[aą]\s*rat|końcow|koncow/.test(
      t,
    )
  ) {
    return 'final'
  }
  if (
    /drug[aą]\s*rat|ii\s*rata|2\s*rata|kolejn[aą]\s*rat|\brata\b/.test(t)
  ) {
    return 'installment'
  }
  return 'unknown'
}

function cellText(paras: IndexedParagraph[], globalIndex: number): string {
  return canonicalizeParagraphText(paras[globalIndex]?.text ?? '')
}

function findDateSpan(
  text: string,
): { start: number; end: number; text: string } | null {
  const m =
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/.exec(text) ??
    /(\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4})/i.exec(text)
  if (!m || m.index == null) return null
  return { start: m.index, end: m.index + m[1]!.length, text: m[1]! }
}

function findMoneySpan(
  text: string,
): { start: number; end: number; text: string; amount: number } | null {
  const re = new RegExp(MONEY_AMOUNT_RE.source, 'i')
  const m = re.exec(text)
  if (!m || m.index == null) return null
  const raw = m[0]!.replace(/\u00a0/g, ' ')
  const digits = raw
    .replace(/\s*(?:zł|zl|PLN)\s*$/i, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
  const amount = Number.parseFloat(digits)
  return {
    start: m.index,
    end: m.index + m[0]!.length,
    text: raw,
    amount: Number.isFinite(amount) ? amount : NaN,
  }
}

function findClockSpans(
  text: string,
): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = []
  const re = /(\d{1,2}[.:]\d{2})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[1]!.length, text: m[1]! })
  }
  return out
}

function findCoverageHoursSpan(
  text: string,
): { start: number; end: number; text: string } | null {
  const m =
    /maks\.?\s*(\d+)\s*h\b/i.exec(text) ??
    /(\d+)\s*h\s*pracy/i.exec(text) ??
    /(\d+)\s*godzin/i.exec(text)
  if (!m || m.index == null) return null
  const token = m[1]!
  const start = text.indexOf(token, m.index)
  return { start, end: start + token.length, text: token }
}

function makeCandidate(input: {
  paragraphs: IndexedParagraph[]
  globalParagraphIndex: number
  start: number
  end: number
  proposedKey: string
  reason: string
  confidence: number
  classification: PackageValueClassification
  decision?: ContractCandidate['decision']
}): ContractCandidate {
  const para = input.paragraphs[input.globalParagraphIndex]
  const text = canonicalizeParagraphText(para?.text ?? '')
  const span = text.slice(input.start, input.end)
  const origin = para?.origin
  const locator = physicalLocatorFromOrigin(
    origin,
    input.globalParagraphIndex,
    input.start,
    input.end,
  )
  const variableClassification: ContractCandidate['variableClassification'] =
    input.classification === 'dynamic_wedding_data'
      ? 'dynamic_candidate'
      : input.classification === 'immutable_package_fact'
        ? 'template_constant'
        : 'ignored_non_variable'

  return {
    paragraphIndex: input.globalParagraphIndex,
    paragraphText: text,
    startOffset: input.start,
    endOffset: input.end,
    text: span,
    proposedKey: input.proposedKey,
    confidence: input.confidence,
    evidenceType: 'explicit_label',
    evidenceText: input.reason,
    operation: 'replace',
    sourceHint: 'package',
    decision:
      input.decision ??
      (input.classification === 'dynamic_wedding_data'
        ? 'accepted'
        : input.classification === 'immutable_package_fact'
          ? 'accepted'
          : 'rejected'),
    reason: input.reason,
    variableClassification,
    leftAnchor: text.slice(Math.max(0, input.start - 24), input.start) || undefined,
    rightAnchor:
      text.slice(input.end, Math.min(text.length, input.end + 16)) || undefined,
    tableIndex: locator.kind === 'tableCell' ? locator.tableIndex : undefined,
    rowIndex: locator.kind === 'tableCell' ? locator.rowIndex : undefined,
    cellIndex: locator.kind === 'tableCell' ? locator.cellIndex : undefined,
    cellParagraphIndex:
      locator.kind === 'tableCell' ? locator.paragraphIndex : undefined,
    packageValueClassification: input.classification,
    physicalLocator: locator,
  }
}

function firstGlobalPara(
  table: DocxExtractedTable,
  rowIndex: number,
  cellIndex: number,
): number | null {
  const cell = table.rows[rowIndex]?.cells[cellIndex]
  const p = cell?.paragraphs[0]
  return p ? p.globalParagraphIndex : null
}

function analyzeEventTable(
  table: DocxExtractedTable,
  paragraphs: IndexedParagraph[],
  headerRowIndex: number,
  headerCells: string[],
): { candidates: ContractCandidate[]; trace: TableCandidateTrace; classifications: PackageTableAnalysisResult['classifications'] } {
  const cols = mapEventColumns(headerCells)
  const placeCol = cols.indexOf('place')
  const timeCol = cols.indexOf('time')
  const stageCol = cols.indexOf('stage')
  const candidates: ContractCandidate[] = []
  const classifications: PackageTableAnalysisResult['classifications'] = []
  const rows: TableCandidateTraceRow[] = []

  for (const row of table.rows) {
    if (row.rowIndex === headerRowIndex) continue
    const stageText =
      stageCol >= 0
        ? row.cells[stageCol]?.normalizedText ??
          row.cells[0]?.normalizedText ??
          ''
        : row.cells[0]?.normalizedText ?? ''
    const stage = classifyEventStage(stageText)
    const valueCells = row.cells.map((c) => ({
      cellIndex: c.cellIndex,
      text: c.normalizedText,
    }))
    const detected: TableCandidateTraceRow['detectedCandidates'] = []
    const rejected: TableCandidateTraceRow['rejectedCandidates'] = []

    if (!stage) {
      rejected.push({
        key: null,
        text: stageText,
        reason: 'unrecognized_event_stage_label',
      })
      rows.push({
        rowIndex: row.rowIndex,
        semanticLabel: stageText || null,
        valueCells,
        detectedCandidates: detected,
        rejectedCandidates: rejected,
      })
      continue
    }

    if (placeCol >= 0) {
      const gIdx = firstGlobalPara(table, row.rowIndex, placeCol)
      if (gIdx != null) {
        const text = cellText(paragraphs, gIdx)
        const trimmed = text.trim()
        if (trimmed.length >= 2) {
          const start = text.indexOf(trimmed)
          const end = start + trimmed.length
          const key =
            stage === 'preparation'
              ? 'preparation_location'
              : stage === 'ceremony'
                ? 'ceremony_location'
                : 'reception_location'
          const c = makeCandidate({
            paragraphs,
            globalParagraphIndex: gIdx,
            start,
            end,
            proposedKey: key,
            reason: `Event table ${stage} place cell`,
            confidence: 0.94,
            classification: 'dynamic_wedding_data',
          })
          candidates.push(c)
          const locator = physicalLocatorFromOrigin(
            paragraphs[gIdx]?.origin,
            gIdx,
            start,
            end,
          )
          detected.push({
            key,
            text: trimmed,
            classification: 'dynamic_wedding_data',
            locator,
          })
          classifications.push({
            key,
            text: trimmed,
            classification: 'dynamic_wedding_data',
            reason: 'event_table_location',
            locator,
          })
        }
      }
    }

    if (timeCol >= 0) {
      const gIdx = firstGlobalPara(table, row.rowIndex, timeCol)
      if (gIdx != null) {
        const text = cellText(paragraphs, gIdx)
        const clocks = findClockSpans(text)
        const hours = findCoverageHoursSpan(text)

        // Non-overlapping spans only.
        const used: Array<{ start: number; end: number }> = []
        const overlaps = (s: number, e: number) =>
          used.some((u) => s < u.end && e > u.start)

        if (stage === 'preparation' && clocks[0]) {
          const span = clocks[0]
          if (!overlaps(span.start, span.end)) {
            used.push(span)
            const key = 'coverage_start_time'
            const c = makeCandidate({
              paragraphs,
              globalParagraphIndex: gIdx,
              start: span.start,
              end: span.end,
              proposedKey: key,
              reason: 'Event table preparation start time',
              confidence: 0.9,
              classification: 'immutable_package_fact',
            })
            candidates.push(c)
            const locator = physicalLocatorFromOrigin(
              paragraphs[gIdx]?.origin,
              gIdx,
              span.start,
              span.end,
            )
            detected.push({
              key,
              text: span.text,
              classification: 'immutable_package_fact',
              locator,
            })
            classifications.push({
              key,
              text: span.text,
              classification: 'immutable_package_fact',
              reason: 'event_time_immutable_package_fact',
              locator,
            })
          }
        } else if (stage === 'ceremony') {
          // Prefer one canonical range owner (start) + end as alias semantic
          // without overlapping physical bindings when both clocks exist.
          if (clocks.length >= 2) {
            const startSpan = clocks[0]!
            const endSpan = clocks[1]!
            if (!overlaps(startSpan.start, startSpan.end)) {
              used.push(startSpan)
              const c = makeCandidate({
                paragraphs,
                globalParagraphIndex: gIdx,
                start: startSpan.start,
                end: startSpan.end,
                proposedKey: 'coverage_start_time',
                reason: 'Event table ceremony start (canonical range owner)',
                confidence: 0.88,
                classification: 'immutable_package_fact',
              })
              candidates.push(c)
              const locator = physicalLocatorFromOrigin(
                paragraphs[gIdx]?.origin,
                gIdx,
                startSpan.start,
                startSpan.end,
              )
              detected.push({
                key: 'coverage_start_time',
                text: startSpan.text,
                classification: 'immutable_package_fact',
                locator,
              })
              classifications.push({
                key: 'coverage_start_time',
                text: startSpan.text,
                classification: 'immutable_package_fact',
                reason: 'ceremony_range_start_immutable',
                locator,
              })
            }
            if (!overlaps(endSpan.start, endSpan.end)) {
              used.push(endSpan)
              const c = makeCandidate({
                paragraphs,
                globalParagraphIndex: gIdx,
                start: endSpan.start,
                end: endSpan.end,
                proposedKey: 'coverage_end_time',
                reason: 'Event table ceremony end time',
                confidence: 0.88,
                classification: 'immutable_package_fact',
              })
              candidates.push(c)
              const locator = physicalLocatorFromOrigin(
                paragraphs[gIdx]?.origin,
                gIdx,
                endSpan.start,
                endSpan.end,
              )
              detected.push({
                key: 'coverage_end_time',
                text: endSpan.text,
                classification: 'immutable_package_fact',
                locator,
              })
              classifications.push({
                key: 'coverage_end_time',
                text: endSpan.text,
                classification: 'immutable_package_fact',
                reason: 'ceremony_range_end_immutable',
                locator,
              })
            }
          } else if (clocks[0]) {
            const span = clocks[0]
            if (!overlaps(span.start, span.end)) {
              used.push(span)
              const c = makeCandidate({
                paragraphs,
                globalParagraphIndex: gIdx,
                start: span.start,
                end: span.end,
                proposedKey: 'coverage_start_time',
                reason: 'Event table ceremony time',
                confidence: 0.86,
                classification: 'immutable_package_fact',
              })
              candidates.push(c)
            }
          }
        } else if (stage === 'reception') {
          if (clocks[0]) {
            const span = clocks[0]
            if (!overlaps(span.start, span.end)) {
              used.push(span)
              const c = makeCandidate({
                paragraphs,
                globalParagraphIndex: gIdx,
                start: span.start,
                end: span.end,
                proposedKey: 'coverage_end_time',
                reason: 'Event table reception end time',
                confidence: 0.9,
                classification: 'immutable_package_fact',
              })
              candidates.push(c)
              const locator = physicalLocatorFromOrigin(
                paragraphs[gIdx]?.origin,
                gIdx,
                span.start,
                span.end,
              )
              detected.push({
                key: 'coverage_end_time',
                text: span.text,
                classification: 'immutable_package_fact',
                locator,
              })
              classifications.push({
                key: 'coverage_end_time',
                text: span.text,
                classification: 'immutable_package_fact',
                reason: 'reception_end_immutable',
                locator,
              })
            }
          }
          if (hours && !overlaps(hours.start, hours.end)) {
            used.push(hours)
            const c = makeCandidate({
              paragraphs,
              globalParagraphIndex: gIdx,
              start: hours.start,
              end: hours.end,
              proposedKey: 'coverage_hours',
              reason: 'Event table coverage hours limit',
              confidence: 0.9,
              classification: 'immutable_package_fact',
            })
            candidates.push(c)
            const locator = physicalLocatorFromOrigin(
              paragraphs[gIdx]?.origin,
              gIdx,
              hours.start,
              hours.end,
            )
            detected.push({
              key: 'coverage_hours',
              text: hours.text,
              classification: 'immutable_package_fact',
              locator,
            })
            classifications.push({
              key: 'coverage_hours',
              text: hours.text,
              classification: 'immutable_package_fact',
              reason: 'coverage_hours_immutable_package_fact',
              locator,
            })
          }
        }
      }
    }

    rows.push({
      rowIndex: row.rowIndex,
      semanticLabel: stage,
      valueCells,
      detectedCandidates: detected,
      rejectedCandidates: rejected,
    })
  }

  return {
    candidates,
    classifications,
    trace: {
      tableIndex: table.tableIndex,
      headerRow: headerCells,
      inferredTableType: 'event_schedule',
      rows,
    },
  }
}

function analyzePaymentTable(
  table: DocxExtractedTable,
  paragraphs: IndexedParagraph[],
  headerRowIndex: number,
  headerCells: string[],
): { candidates: ContractCandidate[]; trace: TableCandidateTrace; classifications: PackageTableAnalysisResult['classifications'] } {
  const cols = mapPaymentColumns(headerCells)
  const labelCol = cols.indexOf('label')
  const dueCol = cols.indexOf('due')
  const amountCol = cols.indexOf('amount')
  const candidates: ContractCandidate[] = []
  const classifications: PackageTableAnalysisResult['classifications'] = []
  const rows: TableCandidateTraceRow[] = []

  type AmountHit = {
    rowIndex: number
    kind: PaymentRowKind
    gIdx: number
    start: number
    end: number
    text: string
    amount: number
  }
  const amountHits: AmountHit[] = []

  for (const row of table.rows) {
    if (row.rowIndex === headerRowIndex) continue
    const labelText =
      labelCol >= 0
        ? row.cells[labelCol]?.normalizedText ?? ''
        : row.cells[0]?.normalizedText ?? ''
    const kind = classifyPaymentRow(labelText)
    const valueCells = row.cells.map((c) => ({
      cellIndex: c.cellIndex,
      text: c.normalizedText,
    }))
    const detected: TableCandidateTraceRow['detectedCandidates'] = []
    const rejected: TableCandidateTraceRow['rejectedCandidates'] = []

    if (amountCol >= 0) {
      const gIdx = firstGlobalPara(table, row.rowIndex, amountCol)
      if (gIdx != null) {
        const text = cellText(paragraphs, gIdx)
        const money = findMoneySpan(text)
        if (money && Number.isFinite(money.amount)) {
          amountHits.push({
            rowIndex: row.rowIndex,
            kind,
            gIdx,
            start: money.start,
            end: money.end,
            text: money.text,
            amount: money.amount,
          })
        } else if (text.trim()) {
          rejected.push({
            key: null,
            text: text.trim(),
            reason: 'no_money_span_in_amount_cell',
          })
        }
      }
    }

    if (dueCol >= 0) {
      const gIdx = firstGlobalPara(table, row.rowIndex, dueCol)
      if (gIdx != null) {
        const text = cellText(paragraphs, gIdx)
        const date = findDateSpan(text)
        const weddingRelative =
          /w\s+dniu\s+ślubu|w\s+dniu\s+slubu|najpóźniej\s+w\s+dniu/i.test(text)

        if (date) {
          const key =
            kind === 'deposit'
              ? 'deposit_due_date'
              : kind === 'final'
                ? 'final_payment_due_date'
                : 'payment_due_date'
          const classification: PackageValueClassification =
            isPackageContractAllowedDynamicKey(key)
              ? 'dynamic_wedding_data'
              : 'unsupported_or_ambiguous'
          if (classification === 'dynamic_wedding_data') {
            const c = makeCandidate({
              paragraphs,
              globalParagraphIndex: gIdx,
              start: date.start,
              end: date.end,
              proposedKey: key,
              reason: `Payment table due date (${kind})`,
              confidence: 0.92,
              classification,
            })
            candidates.push(c)
            const locator = physicalLocatorFromOrigin(
              paragraphs[gIdx]?.origin,
              gIdx,
              date.start,
              date.end,
            )
            detected.push({
              key,
              text: date.text,
              classification,
              locator,
            })
            classifications.push({
              key,
              text: date.text,
              classification,
              reason: 'payment_table_explicit_date',
              locator,
            })
          }
        } else if (weddingRelative) {
          rejected.push({
            key: 'final_payment_due_date',
            text: text.trim(),
            reason: 'wedding_relative_deadline_no_replaceable_date_span',
          })
          classifications.push({
            key: null,
            text: text.trim(),
            classification: 'unsupported_or_ambiguous',
            reason: 'wedding_relative_deadline_immutable_prose',
          })
        } else if (/dni\s+od\s+zawarcia|terminie\s+\d+\s+dni/i.test(text)) {
          rejected.push({
            key: 'deposit_due_date',
            text: text.trim(),
            reason: 'relative_deadline_no_replaceable_date_span',
          })
          classifications.push({
            key: null,
            text: text.trim(),
            classification: 'unsupported_or_ambiguous',
            reason: 'relative_deposit_deadline_immutable_prose',
          })
        }
      }
    }

    rows.push({
      rowIndex: row.rowIndex,
      semanticLabel: kind === 'unknown' ? labelText || null : kind,
      valueCells,
      detectedCandidates: detected,
      rejectedCandidates: rejected,
    })
  }

  const deposit = amountHits.find((h) => h.kind === 'deposit')
  const nonDeposit = amountHits.filter((h) => h.kind !== 'deposit')
  const depositAmount = deposit?.amount ?? null

  // Find contract value from body paragraphs for arithmetic (optional).
  let contractValue: number | null = null
  for (const p of paragraphs) {
    if (p.origin?.kind === 'tableCell') continue
    const t = canonicalizeParagraphText(p.text)
    if (!/łączn[ea]\s+wynagrodzen|wynagrodzen\w*\s+w\s+wysokości/i.test(t)) {
      continue
    }
    const money = findMoneySpan(t)
    if (money && Number.isFinite(money.amount)) {
      contractValue = money.amount
      break
    }
  }

  const remainingTotal =
    contractValue != null && depositAmount != null
      ? Math.round(contractValue - depositAmount)
      : null

  if (deposit) {
    const c = makeCandidate({
      paragraphs,
      globalParagraphIndex: deposit.gIdx,
      start: deposit.start,
      end: deposit.end,
      proposedKey: 'agreed_deposit_formatted',
      reason: 'Payment table deposit amount',
      confidence: 0.95,
      classification: 'dynamic_wedding_data',
    })
    candidates.push(c)
    const locator = physicalLocatorFromOrigin(
      paragraphs[deposit.gIdx]?.origin,
      deposit.gIdx,
      deposit.start,
      deposit.end,
    )
    const rowTrace = rows.find((r) => r.rowIndex === deposit.rowIndex)
    rowTrace?.detectedCandidates.push({
      key: 'agreed_deposit_formatted',
      text: deposit.text,
      classification: 'dynamic_wedding_data',
      locator,
    })
    classifications.push({
      key: 'agreed_deposit_formatted',
      text: deposit.text,
      classification: 'dynamic_wedding_data',
      reason: 'payment_table_deposit',
      locator,
    })
  }

  if (nonDeposit.length === 1) {
    const hit = nonDeposit[0]!
    const c = makeCandidate({
      paragraphs,
      globalParagraphIndex: hit.gIdx,
      start: hit.start,
      end: hit.end,
      proposedKey: 'remaining_after_deposit_formatted',
      reason: 'Payment table single remaining installment',
      confidence: 0.93,
      classification: 'dynamic_wedding_data',
    })
    candidates.push(c)
    const locator = physicalLocatorFromOrigin(
      paragraphs[hit.gIdx]?.origin,
      hit.gIdx,
      hit.start,
      hit.end,
    )
    rows
      .find((r) => r.rowIndex === hit.rowIndex)
      ?.detectedCandidates.push({
        key: 'remaining_after_deposit_formatted',
        text: hit.text,
        classification: 'dynamic_wedding_data',
        locator,
      })
    classifications.push({
      key: 'remaining_after_deposit_formatted',
      text: hit.text,
      classification: 'dynamic_wedding_data',
      reason: 'payment_table_single_remaining',
      locator,
    })
  } else if (nonDeposit.length > 1) {
    const exact =
      remainingTotal != null
        ? nonDeposit.find((h) => Math.abs(h.amount - remainingTotal) < 0.02)
        : null
    if (exact) {
      const c = makeCandidate({
        paragraphs,
        globalParagraphIndex: exact.gIdx,
        start: exact.start,
        end: exact.end,
        proposedKey: 'remaining_after_deposit_formatted',
        reason: 'Payment table installment matching remaining total',
        confidence: 0.9,
        classification: 'dynamic_wedding_data',
      })
      candidates.push(c)
      const locator = physicalLocatorFromOrigin(
        paragraphs[exact.gIdx]?.origin,
        exact.gIdx,
        exact.start,
        exact.end,
      )
      rows
        .find((r) => r.rowIndex === exact.rowIndex)
        ?.detectedCandidates.push({
          key: 'remaining_after_deposit_formatted',
          text: exact.text,
          classification: 'dynamic_wedding_data',
          locator,
        })
      classifications.push({
        key: 'remaining_after_deposit_formatted',
        text: exact.text,
        classification: 'dynamic_wedding_data',
        reason: 'payment_table_remaining_arithmetic_match',
        locator,
      })
      for (const hit of nonDeposit) {
        if (hit === exact) continue
        rows
          .find((r) => r.rowIndex === hit.rowIndex)
          ?.rejectedCandidates.push({
            key: 'remaining_after_deposit_formatted',
            text: hit.text,
            reason: 'split_installment_no_registry_key',
          })
        classifications.push({
          key: null,
          text: hit.text,
          classification: 'unsupported_or_ambiguous',
          reason: 'split_installment_no_registry_key',
        })
      }
    } else {
      // Prefer final installment as remaining when amounts are split and no
      // single cell equals remaining — still unsupported for generation safety.
      for (const hit of nonDeposit) {
        rows
          .find((r) => r.rowIndex === hit.rowIndex)
          ?.rejectedCandidates.push({
            key: 'remaining_after_deposit_formatted',
            text: hit.text,
            reason: 'multi_installment_schedule_unsupported_as_single_remaining',
          })
        classifications.push({
          key: null,
          text: hit.text,
          classification: 'unsupported_or_ambiguous',
          reason: 'multi_installment_schedule_unsupported_as_single_remaining',
        })
      }
    }
  }

  return {
    candidates,
    classifications,
    trace: {
      tableIndex: table.tableIndex,
      headerRow: headerCells,
      inferredTableType: 'payment_schedule',
      rows,
    },
  }
}

function analyzePackageContentTable(
  table: DocxExtractedTable,
  headerCells: string[],
): { candidates: ContractCandidate[]; trace: TableCandidateTrace; classifications: PackageTableAnalysisResult['classifications'] } {
  const classifications: PackageTableAnalysisResult['classifications'] = []
  const rows: TableCandidateTraceRow[] = []
  for (const row of table.rows) {
    const valueCells = row.cells.map((c) => ({
      cellIndex: c.cellIndex,
      text: c.normalizedText,
    }))
    for (const cell of row.cells) {
      if (!cell.normalizedText) continue
      classifications.push({
        key: 'package_contents',
        text: cell.normalizedText,
        classification: 'immutable_package_fact',
        reason: 'package_content_table_cell',
      })
    }
    rows.push({
      rowIndex: row.rowIndex,
      semanticLabel: 'package_content',
      valueCells,
      detectedCandidates: [],
      rejectedCandidates: [
        {
          key: 'package_contents',
          text: valueCells.map((v) => v.text).join(' | '),
          reason: 'immutable_package_content_not_generation_input',
        },
      ],
    })
  }
  return {
    candidates: [],
    classifications,
    trace: {
      tableIndex: table.tableIndex,
      headerRow: headerCells,
      inferredTableType: 'package_content',
      rows,
    },
  }
}

/**
 * Analyze extracted tables and emit contract candidates + DEV traces.
 */
export function analyzePackageContractTables(input: {
  paragraphs: IndexedParagraph[]
  tables: DocxExtractedTable[]
}): PackageTableAnalysisResult {
  const candidates: ContractCandidate[] = []
  const traces: TableCandidateTrace[] = []
  const classifications: PackageTableAnalysisResult['classifications'] = []

  for (const table of input.tables) {
    if (table.rows.length === 0) continue
    const headerRowIndex = 0
    const headerCells = table.rows[headerRowIndex]!.cells.map(
      (c) => c.normalizedText,
    )
    const inferred = classifyTableType(headerCells)

    if (inferred === 'event_schedule') {
      const r = analyzeEventTable(
        table,
        input.paragraphs,
        headerRowIndex,
        headerCells,
      )
      candidates.push(...r.candidates)
      traces.push(r.trace)
      classifications.push(...r.classifications)
    } else if (inferred === 'payment_schedule') {
      const r = analyzePaymentTable(
        table,
        input.paragraphs,
        headerRowIndex,
        headerCells,
      )
      candidates.push(...r.candidates)
      traces.push(r.trace)
      classifications.push(...r.classifications)
    } else if (inferred === 'package_content') {
      const r = analyzePackageContentTable(table, headerCells)
      traces.push(r.trace)
      classifications.push(...r.classifications)
    } else {
      traces.push({
        tableIndex: table.tableIndex,
        headerRow: headerCells,
        inferredTableType: 'unknown',
        rows: table.rows.map((row) => ({
          rowIndex: row.rowIndex,
          semanticLabel: null,
          valueCells: row.cells.map((c) => ({
            cellIndex: c.cellIndex,
            text: c.normalizedText,
          })),
          detectedCandidates: [],
          rejectedCandidates: [
            {
              key: null,
              text: '',
              reason: 'unclassified_table',
            },
          ],
        })),
      })
    }
  }

  if (typeof console !== 'undefined' && console.info) {
    for (const trace of traces) {
      console.info('[package-contract-table-candidate-trace]', trace)
    }
  }

  return { candidates, traces, classifications }
}

/** Attach table coordinates into slot ids when present on candidates. */
export function enrichSlotIdFromTableCandidate(
  candidate: ContractCandidate & {
    physicalLocator?: DocxPhysicalLocator
    tableIndex?: number
  },
  baseId: string,
): string {
  if (candidate.physicalLocator) {
    return bindingIdForLocator(candidate.proposedKey, candidate.physicalLocator)
  }
  return baseId
}

export function slotFromTableAwareCandidate(
  c: ContractCandidate & {
    physicalLocator?: DocxPhysicalLocator
    packageValueClassification?: PackageValueClassification
    tableIndex?: number
    rowIndex?: number
    cellIndex?: number
    cellParagraphIndex?: number
  },
  base: TemplateSlot,
): TemplateSlot {
  const id = c.physicalLocator
    ? bindingIdForLocator(c.proposedKey, c.physicalLocator)
    : base.id
  return {
    ...base,
    id,
    tableIndex: c.tableIndex ?? null,
    rowIndex: c.rowIndex ?? null,
    cellIndex: c.cellIndex ?? null,
    cellParagraphIndex: c.cellParagraphIndex ?? null,
    detectionReason:
      c.packageValueClassification === 'immutable_package_fact'
        ? `immutable_package_fact: ${c.reason}`
        : base.detectionReason,
  }
}

export function logPackageContractBindingSummary(input: {
  detectedKeys: string[]
  persistedKeys: string[]
  filteredKeys: string[]
  rejectionReasons: Array<{ key: string; reason: string }>
}) {
  console.info('[package-contract-binding-summary]', input)
}

export function classifyDetectedKey(key: string): PackageValueClassification {
  if (isPackageContractAllowedDynamicKey(key)) return 'dynamic_wedding_data'
  if (isPackageContractImmutableKey(key)) return 'immutable_package_fact'
  return 'unsupported_or_ambiguous'
}
