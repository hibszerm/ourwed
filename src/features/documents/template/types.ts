/**
 * Template-first contract slots.
 * A variable is only valid with both semantic identity and physical location.
 */

export type TemplateSlotSourceHint =
  | 'couple'
  | 'company'
  | 'package'
  | 'wedding'
  | 'unknown'

/**
 * How this slot mutates the master document during generation.
 * - replace: old example text → resolved value
 * - insert: empty span between anchors → resolved value
 * - composite: multiple registry values + separator as one span
 */
export type ContractSlotOperation = 'replace' | 'insert' | 'composite'

export type OmissionMode =
  | 'empty'
  | 'underscore'
  | 'keep_original'
  | 'remove_clause'

export interface TemplateSlotRange {
  start: number
  end: number
}

export interface TemplateSlot {
  /** Stable slot id within this template version. */
  id: string
  /** Canonical primary registry id when known. */
  registryKey: string | null
  label: string
  sourceHint: TemplateSlotSourceHint
  /** How many times this value appears in the source document. */
  occurrences: number
  /** Example text found in the contract (used for placeholder insertion only). */
  exampleText?: string | null
  /** Surrounding context for review UI. */
  sampleContext?: string | null
  enabled: boolean
  /** True when {{registryKey}} was written into template DOCX. */
  placeholderInserted?: boolean

  /** Validation / generation operation (defaults inferred at validate-time). */
  operation?: ContractSlotOperation
  /** Paragraph index in source document.xml order (including empty paras). */
  paragraphIndex?: number | null
  /** Exact original span for replace operations. */
  originalText?: string | null
  /** Stable text immediately before an insert/composite span. */
  leftAnchor?: string | null
  /** Stable text immediately after an insert/composite span. */
  rightAnchor?: string | null
  /** Character range within the paragraph (inclusive start, exclusive end). */
  allowedRange?: TemplateSlotRange | null
  /** Alias of allowedRange.start for clarity in persisted JSON. */
  startOffset?: number | null
  /** Alias of allowedRange.end for clarity in persisted JSON. */
  endOffset?: number | null
  /** Inserted before the resolved value (owned by the slot, not AI). */
  prefix?: string | null
  /** Appended after the resolved value (owned by the slot, not AI). */
  suffix?: string | null
  /** Behavior when the resolved value is omitted / empty. */
  omissionMode?: OmissionMode | null
  /** Fingerprint of original paragraph text for recovery. */
  paragraphFingerprint?: string | null
  /** True when physical location was bound during import. */
  physicallyBound?: boolean
  /** For composite: registry keys that form the value. */
  componentKeys?: string[]
  /** For composite: separator between components (e.g. " i "). */
  separator?: string | null
}

export interface TemplateSlotMap {
  version: 1
  documentTitle?: string
  slots: TemplateSlot[]
  unmappedDynamics: string[]
  staticNotes?: string[]
  /** Registry keys detected semantically but not physically bound. */
  unboundRegistryKeys?: string[]
}

export function emptySlotMap(): TemplateSlotMap {
  return {
    version: 1,
    slots: [],
    unmappedDynamics: [],
    unboundRegistryKeys: [],
  }
}

function asOperation(value: unknown): ContractSlotOperation | undefined {
  if (value === 'replace' || value === 'insert' || value === 'composite') {
    return value
  }
  return undefined
}

function asOmission(value: unknown): OmissionMode | null | undefined {
  if (value == null) return null
  if (
    value === 'empty' ||
    value === 'underscore' ||
    value === 'keep_original' ||
    value === 'remove_clause'
  ) {
    return value
  }
  return undefined
}

function asRange(value: unknown): TemplateSlotRange | null | undefined {
  if (value == null) return null
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const start = typeof row.start === 'number' ? row.start : Number(row.start)
  const end = typeof row.end === 'number' ? row.end : Number(row.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }
  return { start: Math.floor(start), end: Math.floor(end) }
}

export function parseSlotMap(raw: unknown): TemplateSlotMap {
  if (!raw || typeof raw !== 'object') return emptySlotMap()
  const obj = raw as Record<string, unknown>
  const slotsRaw = Array.isArray(obj.slots) ? obj.slots : []
  const slots: TemplateSlot[] = []
  for (const item of slotsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id) continue
    const registryKey =
      typeof row.registryKey === 'string' && row.registryKey.trim()
        ? row.registryKey.trim()
        : null
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : registryKey ?? id
    const sourceHint = asSourceHint(row.sourceHint)
    const occurrences =
      typeof row.occurrences === 'number' && row.occurrences > 0
        ? Math.floor(row.occurrences)
        : 1
    const componentKeys = Array.isArray(row.componentKeys)
      ? row.componentKeys.filter(
          (k): k is string => typeof k === 'string' && Boolean(k.trim()),
        )
      : undefined
    const paragraphIndex =
      typeof row.paragraphIndex === 'number' && row.paragraphIndex >= 0
        ? Math.floor(row.paragraphIndex)
        : row.paragraphIndex === null
          ? null
          : undefined

    const allowedRange = asRange(row.allowedRange)
    const startOffset =
      typeof row.startOffset === 'number'
        ? Math.floor(row.startOffset)
        : allowedRange?.start ?? null
    const endOffset =
      typeof row.endOffset === 'number'
        ? Math.floor(row.endOffset)
        : allowedRange?.end ?? null
    const range =
      allowedRange ??
      (startOffset != null && endOffset != null
        ? { start: startOffset, end: endOffset }
        : null)

    slots.push({
      id,
      registryKey,
      label,
      sourceHint,
      occurrences,
      exampleText:
        typeof row.exampleText === 'string' ? row.exampleText : null,
      sampleContext:
        typeof row.sampleContext === 'string' ? row.sampleContext : null,
      enabled: row.enabled !== false,
      placeholderInserted: row.placeholderInserted === true,
      operation: asOperation(row.operation),
      paragraphIndex,
      originalText:
        typeof row.originalText === 'string' ? row.originalText : null,
      leftAnchor: typeof row.leftAnchor === 'string' ? row.leftAnchor : null,
      rightAnchor: typeof row.rightAnchor === 'string' ? row.rightAnchor : null,
      allowedRange: range,
      startOffset,
      endOffset,
      prefix: typeof row.prefix === 'string' ? row.prefix : null,
      suffix: typeof row.suffix === 'string' ? row.suffix : null,
      omissionMode: asOmission(row.omissionMode),
      paragraphFingerprint:
        typeof row.paragraphFingerprint === 'string'
          ? row.paragraphFingerprint
          : null,
      physicallyBound:
        row.physicallyBound === true ||
        (paragraphIndex != null &&
          Boolean(
            row.leftAnchor ||
              row.rightAnchor ||
              range ||
              (typeof row.originalText === 'string' &&
                row.originalText.length > 0),
          )),
      componentKeys,
      separator: typeof row.separator === 'string' ? row.separator : null,
    })
  }
  const unmapped = Array.isArray(obj.unmappedDynamics)
    ? obj.unmappedDynamics.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : []
  const staticNotes = Array.isArray(obj.staticNotes)
    ? obj.staticNotes.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : undefined
  const unboundRegistryKeys = Array.isArray(obj.unboundRegistryKeys)
    ? obj.unboundRegistryKeys.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : undefined
  return {
    version: 1,
    documentTitle:
      typeof obj.documentTitle === 'string' ? obj.documentTitle : undefined,
    slots,
    unmappedDynamics: unmapped,
    staticNotes,
    unboundRegistryKeys,
  }
}

function asSourceHint(value: unknown): TemplateSlotSourceHint {
  if (
    value === 'couple' ||
    value === 'company' ||
    value === 'package' ||
    value === 'wedding' ||
    value === 'unknown'
  ) {
    return value
  }
  return 'unknown'
}

/** Whether a slot has a usable physical binding. */
export function isSlotPhysicallyBound(slot: TemplateSlot): boolean {
  if (!slot.enabled || !slot.registryKey) return false
  if (slot.physicallyBound === false) return false
  if (slot.paragraphIndex == null || slot.paragraphIndex < 0) return false
  if (slot.operation === 'insert') {
    return Boolean(
      (slot.leftAnchor && slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  if (slot.operation === 'replace') {
    return Boolean(
      slot.originalText != null ||
        (slot.leftAnchor && slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  if (slot.operation === 'composite') {
    return Boolean(
      (slot.leftAnchor || slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  // Unknown operation — require anchors or offsets
  return Boolean(
    (slot.leftAnchor && slot.rightAnchor) ||
      (slot.startOffset != null && slot.endOffset != null) ||
      slot.allowedRange ||
      slot.originalText,
  )
}
