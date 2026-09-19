/**
 * Controlled markdown → React nodes. Fail-closed.
 * Never emits HTML strings; never creates anchor elements from model text.
 */

export type SafeInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: SafeInline[] }

export type SafeBlock =
  | { type: 'paragraph'; children: SafeInline[] }
  | { type: 'unordered_list'; items: SafeInline[][] }
  | { type: 'ordered_list'; items: SafeInline[][] }

/** Strip HTML tags to plain text (no execution). */
export function stripHtmlTags(input: string): string {
  return input.replace(/<\/?[a-zA-Z][^>]*>/g, '')
}

/**
 * Neutralize markdown links / images to plain text (label only).
 * `[label](url)` → `label`; `![alt](url)` → `alt`
 */
export function neutralizeMarkdownLinks(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

function parseInlines(raw: string): SafeInline[] {
  const text = neutralizeMarkdownLinks(stripHtmlTags(raw))
  const nodes: SafeInline[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push({ type: 'text', value: text.slice(last, match.index) })
    }
    nodes.push({
      type: 'strong',
      children: [{ type: 'text', value: match[1] ?? '' }],
    })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    nodes.push({ type: 'text', value: text.slice(last) })
  }
  if (nodes.length === 0) {
    nodes.push({ type: 'text', value: '' })
  }
  return nodes
}

function isUnorderedItem(line: string): boolean {
  return /^[-*]\s+/.test(line)
}

function isOrderedItem(line: string): boolean {
  return /^\d+[.)]\s+/.test(line)
}

function stripListMarker(line: string): string {
  return line.replace(/^([-*]|\d+[.)])\s+/, '')
}

/**
 * Parse a minimal markdown subset into a safe AST.
 * Unsupported constructs are treated as plain text.
 */
export function parseSafeMarkdown(input: string): SafeBlock[] {
  const normalized = input.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const blocks: SafeBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      i += 1
      continue
    }

    if (isUnorderedItem(line)) {
      const items: SafeInline[][] = []
      while (i < lines.length && isUnorderedItem(lines[i] ?? '')) {
        items.push(parseInlines(stripListMarker(lines[i] ?? '')))
        i += 1
      }
      blocks.push({ type: 'unordered_list', items })
      continue
    }

    if (isOrderedItem(line)) {
      const items: SafeInline[][] = []
      while (i < lines.length && isOrderedItem(lines[i] ?? '')) {
        items.push(parseInlines(stripListMarker(lines[i] ?? '')))
        i += 1
      }
      blocks.push({ type: 'ordered_list', items })
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !isUnorderedItem(lines[i] ?? '') &&
      !isOrderedItem(lines[i] ?? '')
    ) {
      paraLines.push(lines[i] ?? '')
      i += 1
    }
    // Soft line breaks within a paragraph → space (or keep \n for <br> via split)
    const joined = paraLines.join('\n')
    blocks.push({ type: 'paragraph', children: parseInlines(joined) })
  }

  return blocks
}

/** True if rendered visible text still contains raw ** markers (should be false after parse). */
export function visibleTextFromBlocks(blocks: SafeBlock[]): string {
  const walk = (nodes: SafeInline[]): string =>
    nodes
      .map((n) => (n.type === 'text' ? n.value : walk(n.children)))
      .join('')
  return blocks
    .map((b) => {
      if (b.type === 'paragraph') return walk(b.children)
      return b.items.map(walk).join('\n')
    })
    .join('\n')
}
