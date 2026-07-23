/**
 * Insert {{registry_id}} placeholders into a DOCX by replacing example text
 * inside word/document.xml. Best-effort for single-run values.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import type { TemplateSlot, TemplateSlotMap } from './types'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function placeholderFor(registryKey: string): string {
  // docxtemplater uses {key} by default; we use {{key}} and configure delimiter
  return `{{${registryKey}}}`
}

export interface PlaceholderInsertResult {
  bytes: ArrayBuffer
  slotMap: TemplateSlotMap
  insertedCount: number
}

/**
 * Copy DOCX and replace enabled slot exampleText with {{registryKey}}.
 * Slots without exampleText stay in the map but are not inserted.
 */
export async function insertPlaceholdersInDocx(
  sourceBytes: ArrayBuffer,
  slotMap: TemplateSlotMap,
): Promise<PlaceholderInsertResult> {
  // Own a copy so callers can keep using sourceBytes after this mutates/loads.
  const owned = cloneArrayBuffer(sourceBytes)
  const zip = await JSZip.loadAsync(owned)
  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    return {
      bytes: owned,
      slotMap,
      insertedCount: 0,
    }
  }

  let xml = await docFile.async('string')
  let insertedCount = 0
  const slots = slotMap.slots.map((slot) => ({ ...slot }))

  // Longer examples first to avoid partial overlaps
  const ordered = [...slots].sort(
    (a, b) =>
      (b.exampleText?.length ?? 0) - (a.exampleText?.length ?? 0),
  )

  for (const slot of ordered) {
    if (!slot.enabled || !slot.registryKey) continue
    const example = slot.exampleText?.trim()
    if (!example || example.length < 2) continue

    const needle = escapeXml(example)
    const placeholder = escapeXml(placeholderFor(slot.registryKey))
    if (!xml.includes(needle)) continue
    if (xml.includes(placeholder)) {
      slot.placeholderInserted = true
      continue
    }

    const next = xml.split(needle).join(placeholder)
    if (next !== xml) {
      xml = next
      slot.placeholderInserted = true
      insertedCount += 1
    }
  }

  zip.file('word/document.xml', xml)
  const out = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })

  return {
    bytes: out,
    slotMap: { ...slotMap, slots },
    insertedCount,
  }
}

/** Build data object for docxtemplater from resolved registry values. */
export function valuesForSlots(
  slotMap: TemplateSlotMap,
  resolved: Record<string, string>,
): Record<string, string> {
  const data: Record<string, string> = {}
  for (const slot of slotMap.slots) {
    if (!slot.enabled || !slot.registryKey) continue
    const key = slot.registryKey
    const value =
      resolved[key] ??
      resolved[key.replace(/\./g, '_')] ??
      ''
    data[key] = value
  }
  return data
}

export type { TemplateSlot }
