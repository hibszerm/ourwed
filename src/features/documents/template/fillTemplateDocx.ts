/**
 * Deterministic DOCX fill — no LLM.
 * Replaces {{registry_id}} tokens in word/document.xml.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import type { TemplateSlotMap } from './types'
import { valuesForSlots } from './insertPlaceholders'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Fill a templated DOCX (with {{id}} placeholders) using resolved values.
 * Uses simple string replace — no OpenAI.
 */
export async function fillTemplateDocx(
  templateBytes: ArrayBuffer,
  slotMap: TemplateSlotMap,
  resolved: Record<string, string>,
): Promise<ArrayBuffer> {
  const data = valuesForSlots(slotMap, resolved)
  const owned = cloneArrayBuffer(templateBytes)
  const zip = await JSZip.loadAsync(owned)
  const docFile = zip.file('word/document.xml')
  if (!docFile) return owned

  let xml = await docFile.async('string')

  // Also fill any {{key}} present in XML even if not in slot map
  const allKeys = new Set([
    ...Object.keys(data),
    ...slotMap.slots
      .map((s) => s.registryKey)
      .filter((k): k is string => Boolean(k)),
  ])

  for (const key of allKeys) {
    const raw = data[key] ?? resolved[key] ?? ''
    const token = `{{${key}}}`
    const escapedToken = escapeXml(token)
    const value = escapeXml(raw)
    if (xml.includes(token)) {
      xml = xml.split(token).join(value)
    }
    if (xml.includes(escapedToken)) {
      xml = xml.split(escapedToken).join(value)
    }
  }

  zip.file('word/document.xml', xml)
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })
}
