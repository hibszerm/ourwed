/**
 * CG1 DOCX structural inspection helpers (deterministic).
 */

import { extractDocxDocumentModel } from '@/features/documents/template/extractDocxParagraphs'
import { classifyAdditionalServicesPlacement } from '../additionalServicesPlacement'
import {
  findPaymentStartIndex,
  findSignatureStartIndex,
  isSignatureBlock,
} from '../packageDeliverablesDetection'
import { normalizeForMatch } from '../quality/normalize'
import type { TransformDocumentBlock } from '../types'
import { indexDocxForTransform } from '../indexDocxForTransform'

const FORBIDDEN_EXTRAS_NEIGHBORHOOD =
  /rodo|dane\s+osobowe|odstapienie|prawa\s+autorsk|odpowiedzialnosc|sila\s+wyzsza|spory|podpis/i

export type DocxStructuralSnapshot = {
  paragraphCount: number
  nonEmptyParagraphCount: number
  tableCount: number
  texts: string[]
  hasPageBreakHint: boolean
  signatureStartIndex: number
  paymentStartIndex: number
}

export async function snapshotDocx(
  bytes: ArrayBuffer,
): Promise<DocxStructuralSnapshot> {
  const model = await extractDocxDocumentModel(bytes)
  const texts = model.paragraphs.map((p) => p.text)
  const xmlZipHint = texts.some((t) => /page/i.test(t))
  const blocks = await indexDocxForTransform(bytes)
  return {
    paragraphCount: model.paragraphs.length,
    nonEmptyParagraphCount: texts.filter((t) => t.trim()).length,
    tableCount: model.tables.length,
    texts,
    hasPageBreakHint: xmlZipHint,
    signatureStartIndex: findSignatureStartIndex(blocks),
    paymentStartIndex: findPaymentStartIndex(blocks),
  }
}

export type ExtrasPlacementAnalysis = {
  extrasPresent: boolean
  extrasComplete: boolean
  extrasDuplicated: boolean
  extrasLocation:
    | 'explicit_extras_section'
    | 'scope_section'
    | 'commercial_table'
    | 'compensation_section'
    | 'new_semantic_section'
    | 'incorrect_legal_section'
    | 'signature_area'
    | 'unknown'
    | 'not_applicable'
    | 'missing'
  placementMode: string
  placementValid: boolean
  contextBefore: string | null
  contextAfter: string | null
  why: string
  foundNames: string[]
  missingNames: string[]
}

function mapModeToLocation(
  mode: string,
): ExtrasPlacementAnalysis['extrasLocation'] {
  switch (mode) {
    case 'existing_section':
      return 'explicit_extras_section'
    case 'package_deliverables':
    case 'package_scope':
      return 'scope_section'
    case 'before_payment':
      return 'compensation_section'
    case 'safe_placement_not_found':
    case 'skipped':
      return 'missing'
    default:
      return 'unknown'
  }
}

export function analyzeExtrasPlacement(input: {
  blocks: Array<{ blockId: string; text: string }>
  expectedNames: string[]
  placementMode?: string
  targetBlockId?: string
}): ExtrasPlacementAnalysis {
  const { blocks, expectedNames } = input
  if (expectedNames.length === 0) {
    // Template may already contain an empty "Usługi dodatkowe" heading — that is OK.
    // Fail only if synthetic extra *service names* appear when none were requested.
    const syntheticServiceHints =
      /dodatkowy\s+operator|film\s+w\s+wersji\s+rozszerzonej|ujecia?\s+z\s+drona|ekspresowy\s+montaz/i
    const invented = blocks.some((b) =>
      syntheticServiceHints.test(normalizeForMatch(b.text)),
    )
    return {
      extrasPresent: false,
      extrasComplete: true,
      extrasDuplicated: false,
      extrasLocation: 'not_applicable',
      placementMode: input.placementMode ?? 'skipped',
      placementValid: !invented,
      contextBefore: null,
      contextAfter: null,
      why: invented
        ? 'invented_extras_when_none_expected'
        : 'no_extras_expected',
      foundNames: [],
      missingNames: [],
    }
  }

  const foundNames: string[] = []
  const missingNames: string[] = []
  for (const name of expectedNames) {
    const n = normalizeForMatch(name)
    const hits = blocks.filter((b) => normalizeForMatch(b.text).includes(n))
    if (hits.length === 0) missingNames.push(name)
    else foundNames.push(name)
  }

  const placement =
    input.placementMode != null
      ? null
      : classifyAdditionalServicesPlacement(
          input.blocks as TransformDocumentBlock[],
        )
  const mode = input.placementMode ?? placement?.mode ?? 'unknown'
  const targetId =
    input.targetBlockId ??
    (placement && 'targetBlockId' in placement
      ? placement.targetBlockId
      : undefined)

  let idx = targetId
    ? blocks.findIndex((b) => b.blockId === targetId)
    : -1
  if (idx < 0 && foundNames.length > 0) {
    const n = normalizeForMatch(foundNames[0]!)
    idx = blocks.findIndex((b) => normalizeForMatch(b.text).includes(n))
  }

  const contextBefore = idx > 0 ? blocks[idx - 1]!.text.slice(0, 120) : null
  const contextAfter =
    idx >= 0 && idx + 1 < blocks.length
      ? blocks[idx + 1]!.text.slice(0, 120)
      : null

  const asDocBlocks: TransformDocumentBlock[] = blocks.map((b, i) => ({
    blockId: b.blockId,
    paragraphIndex: i,
    text: b.text,
    kind: 'paragraph',
  }))
  const sigStart = findSignatureStartIndex(asDocBlocks)
  const inSignature =
    idx >= sigStart || (idx >= 0 && isSignatureBlock(asDocBlocks[idx]!))
  const badNeighborhood =
    (contextBefore && FORBIDDEN_EXTRAS_NEIGHBORHOOD.test(normalizeForMatch(contextBefore))) ||
    (contextAfter && FORBIDDEN_EXTRAS_NEIGHBORHOOD.test(normalizeForMatch(contextAfter))) ||
    (idx >= 0 &&
      FORBIDDEN_EXTRAS_NEIGHBORHOOD.test(normalizeForMatch(blocks[idx]!.text)) &&
      mode !== 'existing_section')

  const duplicated = expectedNames.some((name) => {
    const n = normalizeForMatch(name)
    return blocks.filter((b) => normalizeForMatch(b.text).includes(n)).length > 1
  })

  const extrasPresent = foundNames.length > 0
  const extrasComplete = missingNames.length === 0
  let placementValid = true
  let why = 'ok'
  let location = mapModeToLocation(mode)

  if (!extrasPresent && mode === 'safe_placement_not_found') {
    placementValid = true
    why = 'safe_skip_no_anchor'
    location = 'missing'
  } else if (!extrasComplete) {
    placementValid = false
    why = 'incomplete_extras'
    location = extrasPresent ? location : 'missing'
  } else if (inSignature) {
    placementValid = false
    why = 'in_signature_area'
    location = 'signature_area'
  } else if (badNeighborhood && mode !== 'existing_section') {
    placementValid = false
    why = 'forbidden_legal_neighborhood'
    location = 'incorrect_legal_section'
  } else if (duplicated) {
    placementValid = false
    why = 'duplicated_extra_names'
  }

  return {
    extrasPresent,
    extrasComplete,
    extrasDuplicated: duplicated,
    extrasLocation: location,
    placementMode: mode,
    placementValid,
    contextBefore,
    contextAfter,
    why,
    foundNames,
    missingNames,
  }
}

export async function reopenParses(bytes: ArrayBuffer): Promise<boolean> {
  try {
    const model = await extractDocxDocumentModel(bytes)
    return model.paragraphs.length > 0
  } catch {
    return false
  }
}
