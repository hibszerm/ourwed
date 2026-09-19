/**
 * Phase 2G — safely strip duplicated bullet lists when every item maps to a
 * collection label from trusted references. Fail closed → keep original message.
 */

import {
  parseSafeMarkdown,
  type SafeBlock,
  type SafeInline,
  visibleTextFromBlocks,
} from './parseSafeMarkdown'

function plain(nodes: SafeInline[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.value : plain(n.children)))
    .join('')
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLabel(label: string): string {
  return label
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemMatchesLabel(itemPlain: string, label: string): boolean {
  const l = normalizeLabel(label)
  if (!l || l.length < 3) return false
  // Strip leading date crumbs like "17.09.2026 — "
  const cleaned = itemPlain.replace(/^\d{1,2}[./]\d{1,2}([./]\d{2,4})?\s*[—–:-]?\s*/, '')
  return cleaned.includes(l) || itemPlain.includes(l)
}

/** Standalone entity-type section headings the model may emit before lists. */
function isCollectionSectionHeading(text: string): boolean {
  const t = normalizeLabel(text)
  return (
    t === 'wesela' ||
    t === 'wesele' ||
    t === 'sesja' ||
    t === 'sesje' ||
    t === 'sluby' ||
    t === 'slub' ||
    t === 'zlecenia' ||
    t === 'zlecenie'
  )
}

/**
 * If message contains a list whose every item matches a collection label,
 * remove that list block and return rebuilt SafeText source... actually return
 * filtered message string reconstructed from remaining blocks as plain paragraphs.
 *
 * Phase 2H.2: also strip bare Wesela/Sesja section headings and single-item
 * lists that duplicate a trusted collection label.
 */
export function messageWithoutDuplicateCollectionList(
  message: string,
  labels: string[],
): { text: string; suppressed: boolean } {
  if (labels.length < 2 || !message.trim()) {
    return { text: message, suppressed: false }
  }
  const blocks = parseSafeMarkdown(message)
  const normLabels = labels.map(normalizeLabel).filter((l) => l.length >= 3)
  if (normLabels.length < 2) return { text: message, suppressed: false }

  let suppressed = false
  const kept: SafeBlock[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const p = plain(block.children)
      if (isCollectionSectionHeading(p)) {
        suppressed = true
        continue
      }
      kept.push(block)
      continue
    }
    if (block.type === 'unordered_list' || block.type === 'ordered_list') {
      const plains = block.items.map(plain)
      const allMatch =
        plains.length >= 1 &&
        plains.every((p) => normLabels.some((l) => itemMatchesLabel(p, l)))
      if (allMatch && (plains.length >= 2 || plains.length === 1)) {
        suppressed = true
        continue
      }
    }
    kept.push(block)
  }

  if (!suppressed) return { text: message, suppressed: false }

  // Rebuild a conservative markdown-ish text from kept blocks
  const parts: string[] = []
  for (const b of kept) {
    if (b.type === 'paragraph') {
      parts.push(visibleTextFromBlocks([b]))
    } else {
      const lines = b.items.map((item, i) => {
        const t = visibleTextFromBlocks([
          { type: 'paragraph', children: item },
        ])
        return b.type === 'ordered_list' ? `${i + 1}. ${t}` : `- ${t}`
      })
      parts.push(lines.join('\n'))
    }
  }
  const text = parts.join('\n\n').trim()
  return { text: text || message, suppressed: Boolean(text) }
}
