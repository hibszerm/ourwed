/**
 * Classify raw text edits against the transformation dataset and protected data.
 */

import { isPersonCountAgreementEdit } from './clientAgreement'
import type { RawTextEdit } from './blockDiffEngine'
import {
  hasPossibleLocationGrammarIssue,
  replacementExplainedByLocationDataset,
} from './locationInsertionPolicy'
import { collectDatasetTargetStrings } from './transformationDataset'
import type {
  ChangeClassification,
  ChangeSeverity,
  ContractTextChange,
  ContractTransformationDataset,
  ProtectedContractData,
} from './types'

const NUMBER_RE = /\d[\d\s]*[,.]?\d*\s*(?:zł|PLN|%|dni|godzin)?|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi

function normalize(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function fieldCategory(field: string): ChangeClassification {
  if (field.startsWith('clients.')) return 'allowed_client_data'
  if (field.startsWith('dates.')) return 'allowed_date'
  if (field.startsWith('locations.')) return 'allowed_location'
  if (field.startsWith('finances.')) return 'allowed_finance'
  return 'allowed_client_data'
}

function matchesProtected(
  text: string,
  protectedData: ProtectedContractData,
): boolean {
  const n = normalize(text)
  if (!n || n.length < 6) return false
  return protectedData.exactProtectedValues.some((v) => {
    const pv = normalize(v)
    if (!pv || pv.length < 6) return false
    return n.includes(pv) || pv.includes(n)
  })
}

function significantTokens(text: string): string[] {
  const glue = new Set([
    'z',
    'ze',
    'w',
    'we',
    'i',
    'oraz',
    'zam',
    'zam.',
    'tel',
    'tel.',
    'ul',
    'ul.',
    'dnia',
    'r',
    'r.',
    'pod',
    'adresem',
    'dalej',
  ])
  return normalize(text)
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:]+|[,.;:]+$/g, ''))
    .filter((t) => t.length >= 3 && !glue.has(t))
}

function stemsMatch(a: string, b: string): boolean {
  const stemLen = Math.min(5, a.length, b.length)
  if (stemLen < 3) return a === b
  return a.startsWith(b.slice(0, stemLen)) || b.startsWith(a.slice(0, stemLen))
}

function softIncludes(haystack: string, needle: string): boolean {
  const h = normalize(haystack)
  const n = normalize(needle)
  if (!n) return false
  if (h.includes(n) || n.includes(h)) return true
  const needles = significantTokens(needle)
  const hays = significantTokens(haystack)
  if (needles.length === 0) return false
  if (needles.every((tok) => hays.some((ht) => stemsMatch(ht, tok)))) {
    return true
  }
  if (hays.length > 0) {
    const hit = hays.filter((ht) => needles.some((tok) => stemsMatch(ht, tok)))
    return hit.length >= Math.max(1, Math.ceil(hays.length * 0.6))
  }
  return false
}

function findDatasetMatch(
  replacement: string,
  dataset: ContractTransformationDataset,
): string | undefined {
  const targets = collectDatasetTargetStrings(dataset)
  const compact = normalize(replacement).replace(/\s/g, '')
  if (!compact) return undefined
  const weakNumericOnly = /^\d{1,3}$/.test(compact)

  let best: { field: string; len: number } | undefined
  for (const t of targets) {
    if (!t.value.trim()) continue
    if (weakNumericOnly) {
      const valueNums = normalize(t.value).match(/\d+/g) ?? []
      if (!valueNums.some((n) => n === compact && n.length >= compact.length)) {
        continue
      }
      if (t.field.startsWith('clients.address') || t.field.startsWith('locations.')) {
        continue
      }
    }
    if (softIncludes(replacement, t.value) || softIncludes(t.value, replacement)) {
      const sig = significantTokens(replacement)
      if (sig.length === 0 && !weakNumericOnly) continue
      if (
        sig.length > 0 &&
        !sig.some((tok) => tok.length >= 4) &&
        !/^\d{4,}/.test(compact) &&
        !t.field.includes('phone')
      ) {
        continue
      }
      if (!best || t.value.length > best.len) {
        best = { field: t.field, len: t.value.length }
      }
    }
  }
  return best?.field
}

function findAllDatasetMatches(
  replacement: string,
  dataset: ContractTransformationDataset,
): string[] {
  const targets = collectDatasetTargetStrings(dataset)
  const fields: string[] = []
  for (const t of targets) {
    if (softIncludes(replacement, t.value)) fields.push(t.field)
  }
  return fields
}

/**
 * True when every non-trivial token in the replacement is explainable by dataset
 * values, short grammatical glue, or personCount agreement forms.
 */
export function replacementFullyExplainedByDataset(
  replacement: string,
  dataset: ContractTransformationDataset,
): boolean {
  const fields = findAllDatasetMatches(replacement, dataset)
  if (fields.length === 0) return false
  let remainder = normalize(replacement)
  const targets = collectDatasetTargetStrings(dataset)
    .map((t) => normalize(t.value))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  for (const tv of targets) {
    if (remainder.includes(tv)) {
      remainder = remainder.replace(tv, ' ')
    }
  }
  const leftover = remainder
    .replace(/[.,;:()\-/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const glue = new Set([
    'z',
    'ze',
    'w',
    'we',
    'i',
    'oraz',
    'zam',
    'tel',
    'ul',
    'dnia',
    'r',
    'słownie',
    'wysokości',
    'kwota',
    'pozostała',
    'pod',
    'adresem',
    'dalej',
    'para',
    'mloda',
    'młoda',
    'zwana',
    'zwaną',
    'zwanym',
    'zwani',
    'zwane',
    'nazywana',
    'nazywaną',
    'nazywanym',
    'nazywani',
    'zleceniodawca',
    'zleceniodawcą',
  ])
  return leftover.every((tok) => glue.has(tok) || tok.length <= 2)
}

/**
 * Source+replacement jointly explained: every changed fragment maps to dataset
 * or agreement; separators (zam., tel., commas) may stay.
 */
export function multiFieldReplacementExplained(input: {
  sourceText: string
  replacementText: string
  dataset: ContractTransformationDataset
}): boolean {
  if (replacementFullyExplainedByDataset(input.replacementText, input.dataset)) {
    return true
  }
  const fields = findAllDatasetMatches(input.replacementText, input.dataset)
  const hasClient =
    fields.some((f) => f.startsWith('clients.')) ||
    fields.some((f) => f.startsWith('locations.')) ||
    fields.some((f) => f.startsWith('dates.')) ||
    fields.some((f) => f.startsWith('finances.'))
  return hasClient && fields.length >= 2
}

export function isLocalGrammaticalEnvelope(input: {
  sourceText: string
  replacementText: string
  matchedTarget: string
}): boolean {
  const src = input.sourceText.trim()
  const rep = input.replacementText.trim()
  const target = input.matchedTarget.trim()
  if (!target) return false
  if (normalize(rep).includes(normalize(target))) {
    const tokensSrc = src.split(/\s+/).filter(Boolean)
    const tokensRep = rep.split(/\s+/).filter(Boolean)
    const delta = Math.abs(tokensSrc.length - tokensRep.length)
    if (tokensRep.length <= 12 && delta <= 4) return true
    if (tokensSrc.length <= 8 && tokensRep.length <= 10) return true
  }
  return false
}

function looksLikeSentenceRewrite(source: string, replacement: string): boolean {
  const srcTokens = source.trim().split(/\s+/).filter(Boolean)
  const repTokens = replacement.trim().split(/\s+/).filter(Boolean)
  if (srcTokens.length <= 6 && repTokens.length >= 10) return true
  if (repTokens.length >= 12 && repTokens.length > srcTokens.length * 2) {
    return true
  }
  if (srcTokens.length >= 8 && repTokens.length >= 8) {
    const shared = srcTokens.filter((t) =>
      repTokens.some((r) => normalize(r) === normalize(t)),
    ).length
    const ratio = shared / Math.max(srcTokens.length, 1)
    return ratio < 0.45
  }
  return false
}

function hasUnexpectedNumberChange(
  sourceText: string,
  replacementText: string,
  dataset: ContractTransformationDataset,
): boolean {
  const srcNums = sourceText.match(NUMBER_RE) ?? []
  const repNums = replacementText.match(NUMBER_RE) ?? []
  const srcBare = sourceText.match(/\d[\d\s]*/g) ?? []
  const repBare = replacementText.match(/\d[\d\s]*/g) ?? []
  const allSrc = [...srcNums, ...srcBare]
  const allRep = [...repNums, ...repBare]
  if (allSrc.length === 0 && allRep.length === 0) return false

  const allowed = new Set(
    collectDatasetTargetStrings(dataset).map((t) => normalize(t.value)),
  )
  for (const n of allRep) {
    const nn = normalize(n).replace(/\s/g, '')
    if (!nn) continue
    const wasInSource = allSrc.some(
      (s) => normalize(s).replace(/\s/g, '') === nn,
    )
    if (wasInSource) continue
    const explained = [...allowed].some((a) => {
      const ac = a.replace(/\s/g, '')
      return ac.includes(nn) && nn.length >= 3
    })
    if (!explained) return true
  }
  return false
}

export function classifyRawEdit(input: {
  edit: RawTextEdit
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
  mode: 'full_ai' | 'guarded'
  sourceBlockText?: string
  transformedBlockText?: string
  /** When set, table ownership gates protected-value matching. */
  sourceBlock?: import('./types').TransformDocumentBlock
}): ContractTextChange {
  const { edit, dataset, protectedData, mode } = input
  const severityForUnexpected: ChangeSeverity =
    mode === 'guarded' ? 'blocking' : 'warning'

  const ownership = input.sourceBlock?.tableContext?.ownershipFamily
  const skipProtectedMatch =
    ownership === 'customer' ||
    ownership === 'wedding_date' ||
    ownership === 'wedding_location'

  const matchHaystack = (() => {
    if (
      input.transformedBlockText &&
      edit.sourceStart > 0 &&
      input.sourceBlockText?.[edit.sourceStart - 1] ===
        input.transformedBlockText[edit.sourceStart - 1]
    ) {
      return (
        input.transformedBlockText.slice(
          Math.max(0, edit.sourceStart - 1),
          edit.sourceStart,
        ) + edit.replacementText
      )
    }
    return edit.replacementText
  })()

  if (
    !skipProtectedMatch &&
    (matchesProtected(edit.sourceText, protectedData) ||
      matchesProtected(edit.replacementText, protectedData) ||
      matchesProtected(matchHaystack, protectedData))
  ) {
    const touchedProtected = protectedData.exactProtectedValues.some((v) => {
      const pv = normalize(v)
      if (pv.length < 6) return false
      const inSource =
        normalize(edit.sourceText).includes(pv) ||
        (input.sourceBlockText
          ? normalize(input.sourceBlockText).includes(pv)
          : false)
      const inTarget =
        normalize(edit.replacementText).includes(pv) ||
        (input.transformedBlockText
          ? normalize(input.transformedBlockText).includes(pv)
          : false)
      return inSource && !inTarget
    })
    if (touchedProtected) {
      return {
        ...edit,
        classification: 'protected_value_change',
        severity: mode === 'guarded' ? 'blocking' : 'warning',
      }
    }
  }

  if (isPersonCountAgreementEdit(edit.sourceText, edit.replacementText)) {
    return {
      ...edit,
      classification: 'allowed_grammatical_adjustment',
      severity: 'info',
      matchedDatasetField: 'clients.personCount',
    }
  }

  if (hasUnexpectedNumberChange(edit.sourceText, edit.replacementText, dataset)) {
    const fieldEarly = findDatasetMatch(matchHaystack, dataset)
    if (!fieldEarly) {
      return {
        ...edit,
        classification: 'unexpected_number_change',
        severity: severityForUnexpected,
      }
    }
  }

  if (
    hasPossibleLocationGrammarIssue(edit.replacementText) ||
    (input.transformedBlockText &&
      hasPossibleLocationGrammarIssue(input.transformedBlockText) &&
      edit.replacementText.length > 0)
  ) {
    const locField =
      findDatasetMatch(matchHaystack, dataset) ??
      findDatasetMatch(edit.replacementText, dataset)
    if (
      locField?.startsWith('locations.') ||
      /przy\s+ul/i.test(edit.replacementText) ||
      (input.transformedBlockText &&
        /przy\s+ul/i.test(input.transformedBlockText) &&
        softIncludes(edit.replacementText, edit.replacementText))
    ) {
      return {
        ...edit,
        classification: 'possible_location_grammar_issue',
        severity: 'warning',
        matchedDatasetField: locField,
      }
    }
  }

  const matchedField =
    findDatasetMatch(matchHaystack, dataset) ??
    findDatasetMatch(edit.replacementText, dataset) ??
    (replacementFullyExplainedByDataset(matchHaystack, dataset)
      ? findAllDatasetMatches(matchHaystack, dataset)[0]
      : undefined)

  if (matchedField) {
    if (looksLikeSentenceRewrite(edit.sourceText, edit.replacementText)) {
      if (
        multiFieldReplacementExplained({
          sourceText: edit.sourceText,
          replacementText: edit.replacementText,
          dataset,
        })
      ) {
        return {
          ...edit,
          classification: fieldCategory(matchedField),
          severity: 'info',
          matchedDatasetField: matchedField,
        }
      }

      if (
        matchedField.startsWith('locations.') &&
        replacementExplainedByLocationDataset(edit.replacementText, dataset)
      ) {
        return {
          ...edit,
          classification: 'allowed_location',
          severity: 'warning',
          matchedDatasetField: matchedField,
        }
      }

      return {
        ...edit,
        classification: 'sentence_structure_change',
        severity: mode === 'guarded' ? 'blocking' : 'warning',
        matchedDatasetField: matchedField,
      }
    }
    const targets = collectDatasetTargetStrings(dataset)
    const matchedValue =
      targets.find((t) => t.field === matchedField)?.value ?? edit.replacementText
    if (
      isLocalGrammaticalEnvelope({
        sourceText: edit.sourceText,
        replacementText: edit.replacementText,
        matchedTarget: matchedValue,
      }) ||
      normalize(edit.replacementText) === normalize(matchedValue)
    ) {
      if (normalize(edit.replacementText) !== normalize(matchedValue)) {
        return {
          ...edit,
          classification: 'allowed_grammatical_adjustment',
          severity: 'info',
          matchedDatasetField: matchedField,
        }
      }
      return {
        ...edit,
        classification: fieldCategory(matchedField),
        severity: 'info',
        matchedDatasetField: matchedField,
      }
    }
    return {
      ...edit,
      classification: fieldCategory(matchedField),
      severity: 'info',
      matchedDatasetField: matchedField,
    }
  }

  if (
    edit.sourceText.length <= 3 &&
    edit.replacementText.length <= 3 &&
    /^[\s,.;:–—-]*$/.test(edit.sourceText) &&
    /^[\s,.;:–—-]*$/.test(edit.replacementText)
  ) {
    return {
      ...edit,
      classification: 'allowed_grammatical_adjustment',
      severity: 'info',
    }
  }

  if (
    looksLikeSentenceRewrite(edit.sourceText, edit.replacementText) &&
    replacementExplainedByLocationDataset(edit.replacementText, dataset)
  ) {
    return {
      ...edit,
      classification: 'allowed_location',
      severity: 'warning',
      matchedDatasetField: findAllDatasetMatches(edit.replacementText, dataset).find(
        (f) => f.startsWith('locations.'),
      ),
    }
  }

  if (looksLikeSentenceRewrite(edit.sourceText, edit.replacementText)) {
    return {
      ...edit,
      classification: 'sentence_structure_change',
      severity: severityForUnexpected,
    }
  }

  return {
    ...edit,
    classification: 'unexpected_text_change',
    severity: severityForUnexpected,
  }
}

export function classifyBlockDiff(input: {
  sourceText: string
  transformedText: string
  blockId: string
  paragraphIndex: number
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
  mode: 'full_ai' | 'guarded'
  rawEdits: RawTextEdit[]
  sourceBlock?: import('./types').TransformDocumentBlock
}): import('./types').ContractBlockDiff {
  const changes = input.rawEdits.map((edit) =>
    classifyRawEdit({
      edit,
      dataset: input.dataset,
      protectedData: input.protectedData,
      mode: input.mode,
      sourceBlockText: input.sourceText,
      transformedBlockText: input.transformedText,
      sourceBlock: input.sourceBlock,
    }),
  )
  return {
    blockId: input.blockId,
    paragraphIndex: input.paragraphIndex,
    sourceText: input.sourceText,
    transformedText: input.transformedText,
    changes,
  }
}

export function isAllowedChange(c: ContractTextChange): boolean {
  return (
    c.classification === 'allowed_client_data' ||
    c.classification === 'allowed_date' ||
    c.classification === 'allowed_location' ||
    c.classification === 'allowed_finance' ||
    c.classification === 'allowed_grammatical_adjustment'
  )
}
