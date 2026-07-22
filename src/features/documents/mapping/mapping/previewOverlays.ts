/**
 * Effective preview overlays — configuration layer over the source document.
 * Priority: placeholders → manual mappings → accepted suggestions → pending heuristics.
 */

import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { DetectedField, ManualDocumentMapping } from '../types'

export interface PreviewOverlay {
  id: string
  start: number
  end: number
  label: string
  variableKey: string | null
  /** Replace source span with a chip (mapped). Soft highlight keeps original text. */
  mode: 'chip' | 'soft'
  kind: 'placeholder' | 'manual' | 'suggestion'
  active?: boolean
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function labelForKey(key: string | null, fallback: string): string {
  if (key) {
    const fromRegistry = getVariableDef(key)?.labelPl
    if (fromRegistry) return fromRegistry
  }
  if (fallback?.trim() && !fallback.includes('.')) return fallback.trim()
  return 'Informacja'
}

/**
 * Build non-overlapping overlays for the document preview.
 */
export function buildPreviewOverlays(input: {
  fields: DetectedField[]
  manualMappings: ManualDocumentMapping[]
  activeFieldId?: string | null
  activeMappingId?: string | null
}): PreviewOverlay[] {
  const occupied: { start: number; end: number }[] = []
  const overlays: PreviewOverlay[] = []

  const tryAdd = (overlay: PreviewOverlay) => {
    const range = { start: overlay.start, end: overlay.end }
    if (range.start >= range.end) return
    if (occupied.some((o) => overlaps(o, range))) return
    occupied.push(range)
    overlays.push(overlay)
  }

  // 1. AI / placeholder fields with offsets
  for (const field of input.fields) {
    if (field.origin === 'heuristic' || field.origin === 'manual') continue
    if (field.status === 'ignored' || !field.offsets) continue
    const key = field.mappedKey ?? field.suggestedKey
    const connected = field.status === 'connected' && Boolean(field.mappedKey)
    tryAdd({
      id: field.id,
      start: field.offsets.start,
      end: field.offsets.end,
      label: labelForKey(key, field.label),
      variableKey: key,
      mode: connected ? 'chip' : 'soft',
      kind: field.origin === 'ai' ? 'suggestion' : 'placeholder',
      active: input.activeFieldId === field.id,
    })
  }

  // 2. Manual guided mappings
  for (const m of input.manualMappings) {
    tryAdd({
      id: m.id,
      start: m.offsets.start,
      end: m.offsets.end,
      label: labelForKey(m.variableKey, m.selectedText),
      variableKey: m.variableKey,
      mode: 'chip',
      kind: 'manual',
      active: input.activeMappingId === m.id,
    })
  }

  // 3. Accepted heuristic suggestions
  for (const field of input.fields) {
    if (field.origin !== 'heuristic') continue
    if (field.status !== 'connected' || !field.mappedKey || !field.offsets) continue
    tryAdd({
      id: field.id,
      start: field.offsets.start,
      end: field.offsets.end,
      label: labelForKey(field.mappedKey, field.label),
      variableKey: field.mappedKey,
      mode: 'chip',
      kind: 'suggestion',
      active: input.activeFieldId === field.id,
    })
  }

  // 4. Pending heuristics (soft highlight only)
  for (const field of input.fields) {
    if (field.origin !== 'heuristic') continue
    if (field.status !== 'needs_configuration' || !field.offsets) continue
    tryAdd({
      id: field.id,
      start: field.offsets.start,
      end: field.offsets.end,
      label: field.label,
      variableKey: field.suggestedKey,
      mode: 'soft',
      kind: 'suggestion',
      active: input.activeFieldId === field.id,
    })
  }

  return overlays.sort((a, b) => a.start - b.start)
}

export function isBlankishText(text: string): boolean {
  const t = text.replace(/\u00a0/g, ' ').trim()
  if (!t) return true
  return /^[.\u2026_\-–—\s]+$/.test(t)
}

export function blockPlainText(
  block: { children: { type: string; text?: string }[] },
): string {
  return block.children
    .map((c) => (c.type === 'text' ? (c.text ?? '') : '\n'))
    .join('')
}
