/**
 * Build template slots from AI analysis + physical SlotBinder.
 */

import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import {
  isCoupleFacingRegistryKey,
  isPackageFacingRegistryKey,
  isStudioFacingRegistryKey,
  registryPolishLabel,
  resolvePackageVariableId,
  resolveToRegistryKey,
} from '@/features/documents/ai/canonicalVariableIds'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import { getPackageVariableDef } from '@/features/documents/registry/packageVariables'
import { bindSlotsFromAnalysis } from './slotBinder'
import { paragraphFingerprint, type IndexedParagraph } from './extractDocxParagraphs'
import type {
  TemplateSlot,
  TemplateSlotMap,
  TemplateSlotSourceHint,
} from './types'

function sourceHintForKey(registryKey: string): TemplateSlotSourceHint {
  if (isStudioFacingRegistryKey(registryKey)) return 'company'
  if (isPackageFacingRegistryKey(registryKey)) return 'package'
  if (registryKey === 'package.name' || registryKey === 'package_name') {
    return 'couple'
  }
  const system = SystemVariableRegistry.get(registryKey)
  if (system?.category === 'wedding') return 'wedding'
  if (system?.category === 'package') return 'package'
  if (system?.category === 'company') return 'company'
  if (isCoupleFacingRegistryKey(registryKey)) return 'couple'
  return 'unknown'
}

function primaryId(raw: string): string | null {
  const system = SystemVariableRegistry.get(raw)
  if (system) return system.id
  const pkg = resolvePackageVariableId(raw) ?? getPackageVariableDef(raw)?.id
  if (pkg) return pkg
  const legacy = resolveToRegistryKey(raw)
  if (legacy) {
    return SystemVariableRegistry.get(legacy)?.id ?? legacy
  }
  return null
}

function labelFor(id: string): string {
  const system = SystemVariableRegistry.get(id)
  if (system) return system.label
  try {
    return registryPolishLabel(id)
  } catch {
    return id.replace(/_/g, ' ')
  }
}

/**
 * Infer example snippets from contract plain text for common slot types.
 */
export function inferExampleText(
  registryKey: string,
  plainText: string,
): string | null {
  const text = plainText.replace(/\s+/g, ' ').trim()
  if (!text) return null

  if (registryKey === 'wedding_date' || registryKey.includes('date')) {
    const m = text.match(
      /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})\b/,
    )
    return m?.[1] ?? null
  }
  if (registryKey.includes('phone') || registryKey.includes('tel')) {
    const m = text.match(/\b(?:\+?\d{2}\s*)?(?:\d[\s-]?){8,11}\d\b/)
    return m?.[0]?.trim() ?? null
  }
  if (registryKey.includes('email')) {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    return m?.[0] ?? null
  }
  if (
    registryKey === 'company_nip' ||
    registryKey === 'company_vat' ||
    registryKey.includes('nip')
  ) {
    const m = text.match(/\bNIP[:\s]*([0-9\s-]{10,13})\b/i)
    return m?.[1]?.replace(/\s+/g, '') ?? null
  }
  if (registryKey === 'company_regon' || registryKey.includes('regon')) {
    const m = text.match(/\bREGON[:\s]*([0-9]{9,14})\b/i)
    return m?.[1] ?? null
  }
  if (
    registryKey === 'company_bank_account' ||
    registryKey.includes('iban') ||
    registryKey.includes('bank')
  ) {
    const m = text.match(/\b(?:PL)?\s*((?:\d{2}\s*){10,13}\d{2})\b/)
    return m?.[1]?.replace(/\s+/g, ' ').trim() ?? null
  }
  if (
    registryKey === 'package_price' ||
    registryKey === 'deposit_amount' ||
    registryKey.includes('price') ||
    registryKey.includes('deposit')
  ) {
    const m = text.match(
      /\b(\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d{2})?)\s*(?:zł|PLN|zl)\b/i,
    )
    return m?.[0] ?? null
  }
  return null
}

function buildSemanticSlots(input: {
  ai: AiDocumentAnalysisResult
  plainText: string
}): TemplateSlot[] {
  const { ai, plainText } = input
  const seen = new Set<string>()
  const slots: TemplateSlot[] = []

  const pushId = (raw: string, forcedHint?: TemplateSlotSourceHint) => {
    const id = primaryId(raw)
    if (!id || seen.has(id)) return
    seen.add(id)
    const legacyOrId =
      SystemVariableRegistry.get(id)?.legacyKey ??
      getPackageVariableDef(id)?.registryKey ??
      id
    const example = plainText ? inferExampleText(id, plainText) : null
    slots.push({
      id: `slot-${id}`,
      registryKey: id,
      label: labelFor(id),
      sourceHint: forcedHint ?? sourceHintForKey(legacyOrId),
      occurrences: 1,
      exampleText: example,
      enabled: true,
      placeholderInserted: false,
      physicallyBound: false,
    })
  }

  for (const field of ai.fields) {
    if (field.registryKey) pushId(field.registryKey)
    else if (field.label) {
      const resolved = primaryId(field.label.replace(/\s+/g, '_'))
      if (resolved) pushId(resolved)
    }
  }

  for (const pkgId of ai.packageVariables ?? []) {
    pushId(pkgId, 'package')
  }

  return slots
}

/**
 * Try replace-binding using example / extracted value text inside paragraphs.
 */
function bindByExampleText(
  slots: TemplateSlot[],
  paragraphs: IndexedParagraph[],
): TemplateSlot[] {
  const claimed = new Map<number, Array<{ start: number; end: number }>>()
  const out: TemplateSlot[] = []

  for (const slot of slots) {
    if (slot.physicallyBound || !slot.registryKey) {
      out.push(slot)
      continue
    }
    const needle = slot.exampleText?.trim()
    if (!needle || needle.length < 2) {
      out.push(slot)
      continue
    }

    let found: TemplateSlot | null = null
    for (const para of paragraphs) {
      const idx = para.text.indexOf(needle)
      if (idx < 0) continue
      const range = { start: idx, end: idx + needle.length }
      const existing = claimed.get(para.index) ?? []
      if (existing.some((c) => c.start < range.end && range.start < c.end)) {
        continue
      }
      existing.push(range)
      claimed.set(para.index, existing)
      found = {
        ...slot,
        id: `slot-${slot.registryKey}-${para.index}-${idx}`,
        operation: 'replace',
        paragraphIndex: para.index,
        originalText: needle,
        allowedRange: range,
        startOffset: idx,
        endOffset: idx + needle.length,
        prefix: '',
        suffix: '',
        omissionMode: 'underscore',
        paragraphFingerprint: paragraphFingerprint(para.text),
        physicallyBound: true,
      }
      break
    }
    out.push(found ?? slot)
  }
  return out
}

export function buildSlotsFromAnalysis(input: {
  ai: AiDocumentAnalysisResult
  plainText?: string
  /** Indexed paragraphs from the same extractor used at generation time. */
  paragraphs?: IndexedParagraph[]
}): TemplateSlotMap {
  const { ai, plainText = '', paragraphs = [] } = input
  const semantic = buildSemanticSlots({ ai, plainText })

  const unmappedDynamics = ai.fields
    .filter((f) => !f.registryKey)
    .map((f) => f.label)
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return {
      version: 1,
      documentTitle: ai.documentType || undefined,
      slots: semantic,
      unmappedDynamics: [...new Set(unmappedDynamics)],
      unboundRegistryKeys: semantic
        .map((s) => s.registryKey)
        .filter((k): k is string => Boolean(k)),
    }
  }

  const bound = bindSlotsFromAnalysis({
    ai,
    paragraphs,
    semanticSlots: semantic,
  })

  // Merge: prefer physically bound; keep unbound semantic leftovers
  const byKey = new Map<string, TemplateSlot>()
  for (const s of bound.slots) {
    if (!s.registryKey) continue
    const prev = byKey.get(s.registryKey)
    if (!prev || (s.physicallyBound && !prev.physicallyBound)) {
      byKey.set(s.registryKey, s)
    }
  }

  let merged = [...byKey.values()]
  merged = bindByExampleText(merged, paragraphs)

  const unboundRegistryKeys = merged
    .filter((s) => s.registryKey && !s.physicallyBound)
    .map((s) => s.registryKey!)

  return {
    version: 1,
    documentTitle: ai.documentType || undefined,
    slots: merged,
    unmappedDynamics: [...new Set(unmappedDynamics)],
    unboundRegistryKeys: [...new Set(unboundRegistryKeys)],
  }
}
