import {
  applyDocxParagraphEdits,
  type DocxParagraphEdit,
} from '@/features/documents/template/docxParagraphEditor'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import type {
  ApprovedContractPatch,
  ContractIntegrityReport,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { normalizeComparableText } from '@/features/ai-contract-lab/validateAiReplacementPlan'

/** Deterministic DOCX patch — AI is not involved. */
export async function applyApprovedReplacementPlan(
  sourceBytes: ArrayBuffer,
  patches: ApprovedContractPatch[],
): Promise<ArrayBuffer> {
  const paragraphs = await extractDocxParagraphsIncludingEmpty(sourceBytes)
  const byIndex = new Map(paragraphs.map((p) => [p.index, p.text]))

  for (const patch of patches) {
    const text = byIndex.get(patch.paragraphIndex)
    if (text == null) {
      throw new Error(`Brak akapitu ${patch.paragraphIndex}`)
    }
    const slice = text.slice(patch.spanStart, patch.spanEnd)
    if (slice !== patch.expectedOriginalText) {
      throw new Error(
        `Tekst źródłowy nie zgadza się dla ${patch.patchId} (dokument mógł ulec zmianie).`,
      )
    }
  }

  const edits: DocxParagraphEdit[] = patches.map((p) => ({
    index: p.paragraphIndex,
    text: '',
    span: {
      start: p.spanStart,
      end: p.spanEnd,
      replacement: p.replacementText,
    },
  }))

  return applyDocxParagraphEdits(sourceBytes, edits)
}

export async function compareDocxIntegrity(input: {
  sourceBytes: ArrayBuffer
  generatedBytes: ArrayBuffer
  patches: ApprovedContractPatch[]
}): Promise<ContractIntegrityReport> {
  const sourceParas = await extractDocxParagraphsIncludingEmpty(
    input.sourceBytes,
  )
  const generatedParas = await extractDocxParagraphsIncludingEmpty(
    input.generatedBytes,
  )

  const structuralChanges: ContractIntegrityReport['structuralChanges'] = []
  const unauthorized: ContractIntegrityReport['unauthorizedTextChanges'] = []
  const warnings: ContractIntegrityReport['warnings'] = []

  if (sourceParas.length !== generatedParas.length) {
    structuralChanges.push({
      code: 'paragraph_count_mismatch',
      message: `Liczba akapitów: źródło ${sourceParas.length}, wynik ${generatedParas.length}`,
    })
  }

  const expectedByPara = new Map<number, string>()
  for (const [index, text] of sourceParas.map((p) => [p.index, p.text] as const)) {
    expectedByPara.set(index, text)
  }

  // Apply patches in memory to build expected texts
  const patchesByPara = new Map<number, ApprovedContractPatch[]>()
  for (const p of input.patches) {
    const list = patchesByPara.get(p.paragraphIndex) ?? []
    list.push(p)
    patchesByPara.set(p.paragraphIndex, list)
  }
  for (const [index, list] of patchesByPara) {
    let text = expectedByPara.get(index) ?? ''
    const sorted = [...list].sort((a, b) => b.spanStart - a.spanStart)
    for (const p of sorted) {
      text =
        text.slice(0, p.spanStart) + p.replacementText + text.slice(p.spanEnd)
    }
    expectedByPara.set(index, text)
  }

  const len = Math.min(sourceParas.length, generatedParas.length)
  let actualTextChangeCount = 0
  for (let i = 0; i < len; i++) {
    const src = sourceParas[i]!
    const gen = generatedParas[i]!
    if (normalizeComparableText(src.text) !== normalizeComparableText(gen.text)) {
      actualTextChangeCount += 1
      const expected = expectedByPara.get(src.index) ?? src.text
      if (
        normalizeComparableText(expected) !== normalizeComparableText(gen.text)
      ) {
        unauthorized.push({
          paragraphIndex: src.index,
          before: src.text.slice(0, 200),
          after: gen.text.slice(0, 200),
        })
      }
    }
  }

  // Source immutability: caller must keep original bytes untouched
  void cloneArrayBuffer

  const passed =
    structuralChanges.length === 0 && unauthorized.length === 0

  if (!passed) {
    warnings.push({
      code: 'download_blocked',
      message: 'Pobranie zablokowane — wykryto niezatwierdzone zmiany.',
    })
  }

  return {
    passed,
    approvedChangeCount: input.patches.length,
    actualTextChangeCount,
    unauthorizedTextChanges: unauthorized,
    structuralChanges,
    formattingChanges: [],
    warnings,
    legalTextUnchanged: passed,
  }
}
