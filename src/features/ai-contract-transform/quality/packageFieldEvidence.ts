/**
 * Golden Fix 2 — grounded selected-package name surfaces.
 *
 * Package name ≠ service-scope deliverables. Discovery is structural:
 * exact "pakiet <Name>" / labeled form|table cells — not a synonym dictionary.
 */

import type { TransformDocumentBlock } from '../types'

export type SourcePackageEvidence = {
  blockId: string
  sourceText: string
  /** Exact package name surface in SOURCE (e.g. "Klasyczny Reportaż"). */
  sourcePackageName: string
  representation: 'table_cell' | 'prose' | 'form_line'
}

const PACKAGE_LABEL =
  /nazwa\s+pakietu|wybrany\s+pakiet|pakiet\s*:/i

/**
 * Extract selected-package name after structural "pakiet " marker.
 * Stops before colon / "obejmuje" / amount / comma-heavy deliverable lists.
 */
export function extractPackageNameAfterMarker(text: string): string | null {
  const m = text.match(
    /pakiet\s+([A-ZĄĆĘŁŃÓŚŹŻ][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]+){0,4})/,
  )
  if (!m?.[1]) return null
  let name = m[1].trim()
  // Trim trailing deliverable conjunctions accidentally captured
  name = name.replace(
    /\s+(?:obejmuje|zawiera|to|w|za|do|na|oraz|i)$/i,
    '',
  )
  if (name.length < 3) return null
  return name
}

function isCatalogueExampleBlock(text: string): boolean {
  // Optional-service catalogue with multiple priced options — not the selected package.
  const priced = (text.match(/\d[\d\s\u00a0]*(?:[,.]\d{2})?\s*zł/gi) ?? []).length
  if (priced >= 2 && /za\s+\d|albo|lub\s+/i.test(text)) return true
  return false
}

export function discoverFilledPackageEvidence(
  blocks: TransformDocumentBlock[],
): SourcePackageEvidence[] {
  const out: SourcePackageEvidence[] = []
  const seen = new Set<string>()

  for (const b of blocks) {
    const text = (b.text ?? '').trim()
    if (!text) continue
    if (isCatalogueExampleBlock(text)) continue

    const label = b.tableContext?.rowLabelText ?? ''
    const labeled =
      PACKAGE_LABEL.test(label) ||
      PACKAGE_LABEL.test(text) ||
      /nazwa\s+pakietu/i.test(label)

    let sourcePackageName: string | null = null
    let representation: SourcePackageEvidence['representation'] = 'prose'

    if (b.kind === 'tableCell' && labeled) {
      const cell = text.replace(/^pakiet\s*:?\s*/i, '').trim()
      if (cell.length >= 3 && !/^[\d\s,.\-–—]+$/.test(cell)) {
        sourcePackageName = extractPackageNameAfterMarker(`pakiet ${cell}`) ?? cell
        representation = 'table_cell'
      }
    }

    if (!sourcePackageName && /^([^:\n]{2,60}):\s*(.+)$/.test(text) && PACKAGE_LABEL.test(text)) {
      const rest = text.replace(/^[^:]+:\s*/, '').trim()
      sourcePackageName =
        extractPackageNameAfterMarker(`pakiet ${rest}`) ??
        (rest.length >= 3 ? rest : null)
      representation = 'form_line'
    }

    if (!sourcePackageName) {
      sourcePackageName = extractPackageNameAfterMarker(text)
      representation =
        b.kind === 'tableCell'
          ? 'table_cell'
          : /^[^.\n]{2,60}:\s*/.test(text)
            ? 'form_line'
            : 'prose'
    }

    if (!sourcePackageName) continue
    const key = `${b.blockId}::${sourcePackageName}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      blockId: b.blockId,
      sourceText: text,
      sourcePackageName,
      representation,
    })
  }

  return out
}

/**
 * Replace exact grounded package name surface with canonical package.
 * Does not rewrite surrounding deliverables / hours / legal scope.
 */
export function applyCanonicalPackageName(
  text: string,
  sourcePackageName: string,
  canonicalPackageName: string,
): string {
  const src = sourcePackageName.trim()
  const canon = canonicalPackageName.trim()
  if (!src || !canon || src === canon) return text
  if (!text.includes(src)) return text
  // Idempotent when already canonical
  if (text.includes(canon) && !text.includes(src)) return text
  // Replace all occurrences of this exact grounded name in the block only
  return text.split(src).join(canon)
}
