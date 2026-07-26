/**
 * Client-side semantic gate for AI missing-field proposals.
 * AI classification is advisory — never trust it alone.
 */

import type {
  AiContractAnalysisResult,
  ContractCanonicalField,
  DocumentTextAnchor,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  resolveExactSourceSpan,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'

function normalizeComparableText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function valuesAreEquivalent(a: string, b: string): boolean {
  return normalizeComparableText(a) === normalizeComparableText(b)
}

export type DocumentValueClassification =
  | 'replacement'
  | 'manual_missing'
  | 'ambiguous_mapping'
  | 'document_only_value'
  | 'ignored'

export type MissingTargetEvidence = {
  anchorId: string
  exactText?: string | null
  prefixContext?: string | null
  suffixContext?: string | null
  semanticLabel: string
}

export type ClassificationCounters = {
  keptManualMissing: number
  promotedReplacements: number
  promotedAmbiguities: number
  ignoredMissing: number
  rejectedGeneric: number
  rejectedNoTarget: number
}

const GENERIC_LABEL_RE =
  /adresy\s+lokalizacji\s+z\s+katalogu|dopasowanie|dane\s+pary|brak\s+zgodno[sś]ci|sprawd[zź]\s+telefon|reconcile|zgodno[sś][cć]\s+z\s+katalogiem|adresy\s+z\s+katalogu/i

const PERSON_ROLE_MSG =
  'AI nie potrafiło jednoznacznie przypisać tego fragmentu do Panny lub Pana Młodego. Wybierz właściwe pole.'

const LOCATION_KEYS = new Set([
  'location.ceremony',
  'location.reception',
  'location.bride_preparation',
  'location.groom_preparation',
  'wedding.ceremony_location',
  'wedding.reception_location',
])

const BRIDE_NAME_KEYS = ['bride.full_name', 'bride.first_name', 'bride.last_name']
const GROOM_NAME_KEYS = ['groom.full_name', 'groom.first_name', 'groom.last_name']

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function phonesEquivalent(a: string, b: string): boolean {
  const da = digitsOnly(a)
  const db = digitsOnly(b)
  if (!da || !db) return false
  if (da === db) return true
  // PL: ignore leading country code 48
  const strip = (d: string) => (d.startsWith('48') && d.length > 9 ? d.slice(2) : d)
  return strip(da) === strip(db)
}

/** Find phone-like contiguous spans in anchor text. */
export function findPhoneLikeSpans(anchorText: string): string[] {
  const spans: string[] = []
  const re =
    /(?:\+?\d[\d\s./-]{6,}\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(anchorText)) != null) {
    const raw = m[0]!.trim()
    if (digitsOnly(raw).length >= 7) spans.push(raw)
  }
  return spans
}

export function isGenericReconciliationLabel(label: string, reason = ''): boolean {
  return GENERIC_LABEL_RE.test(label) || GENERIC_LABEL_RE.test(reason)
}

function fieldAvailable(
  field: ContractCanonicalField | undefined,
): field is ContractCanonicalField & { formattedValue: string } {
  return field != null && field.formattedValue != null && field.formattedValue.trim() !== ''
}

function resolveFieldKey(
  m: AiContractAnalysisResult['missingFields'][number],
): string | null {
  const extended = m as AiContractAnalysisResult['missingFields'][number] & {
    fieldKey?: string | null
  }
  return extended.fieldKey ?? m.suggestedCanonicalFieldKey ?? null
}

function getEvidence(
  m: AiContractAnalysisResult['missingFields'][number],
): MissingTargetEvidence | null {
  const extended = m as AiContractAnalysisResult['missingFields'][number] & {
    targetEvidence?: MissingTargetEvidence | null
  }
  if (extended.targetEvidence?.anchorId) return extended.targetEvidence
  if (m.affectedAnchorIds[0]) {
    return {
      anchorId: m.affectedAnchorIds[0]!,
      semanticLabel: m.semanticRole || m.label,
      exactText: null,
      prefixContext: null,
      suffixContext: null,
    }
  }
  return null
}

function isLocationField(key: string | null): boolean {
  if (!key) return false
  return LOCATION_KEYS.has(key) || key.startsWith('location.')
}

function isPhoneField(key: string | null, dataType: string): boolean {
  if (dataType.toLowerCase() === 'phone') return true
  return Boolean(key && (key.endsWith('.phone') || key.includes('phone')))
}

function isGroomNameField(key: string | null, label: string): boolean {
  if (key && GROOM_NAME_KEYS.includes(key)) return true
  if (key && /email|phone|address|tel/.test(key)) return false
  if (/e-?mail|telefon|adres/i.test(label)) return false
  return /pana\s*młodego|pan\s*młody|groom\.(full_)?name|imi[eę].*pan/i.test(
    label,
  )
}

function isBrideNameField(key: string | null): boolean {
  return Boolean(key && BRIDE_NAME_KEYS.includes(key))
}

function anchorContainsCanonicalName(
  anchorText: string,
  fields: ContractCanonicalField[],
  keys: string[],
): boolean {
  for (const key of keys) {
    const f = fields.find((x) => x.key === key)
    if (fieldAvailable(f) && anchorText.includes(f.formattedValue)) return true
  }
  return false
}

function tryPromotePhoneReplacement(input: {
  missingId: string
  fieldKey: string
  field: ContractCanonicalField & { formattedValue: string }
  anchors: DocumentTextAnchor[]
  affectedAnchorIds: string[]
  evidence: MissingTargetEvidence | null
  semanticRole: string
}): AiContractAnalysisResult['replacements'][number] | null {
  for (const anchorId of input.affectedAnchorIds) {
    const anchor = input.anchors.find((a) => a.anchorId === anchorId)
    if (!anchor) continue

    let sourceText: string | null = null
    if (input.evidence?.exactText?.trim()) {
      const span = resolveExactSourceSpan(
        anchor.text,
        input.evidence.exactText.trim(),
        {
          prefixContext: input.evidence.prefixContext,
          suffixContext: input.evidence.suffixContext,
        },
      )
      if (span.status === 'exact' || span.status === 'normalized_exact') {
        sourceText = span.exactSourceText
      }
    }

    if (!sourceText) {
      const phones = findPhoneLikeSpans(anchor.text).filter(
        (p) => !phonesEquivalent(p, input.field.formattedValue),
      )
      if (phones.length === 1) sourceText = phones[0]!
      else if (phones.length > 1) return null
    }

    if (!sourceText) continue
    if (valuesAreEquivalent(sourceText, input.field.formattedValue)) continue
    if (phonesEquivalent(sourceText, input.field.formattedValue)) continue

    return {
      replacementId: `gate:phone:${input.missingId}:${anchorId}`,
      anchorId,
      originalText: sourceText,
      canonicalFieldKey: input.fieldKey,
      proposedValue: input.field.formattedValue,
      semanticRole: input.semanticRole || 'Telefon',
      reason: 'Numer w dokumencie różni się od katalogu wesela — zamiana, nie brak danych.',
      confidence: 0.88,
      requiresUserReview: true,
      prefixContext: input.evidence?.prefixContext ?? null,
      suffixContext: input.evidence?.suffixContext ?? null,
    }
  }
  return null
}

function tryPromoteLocationReplacements(input: {
  missingId: string
  fieldKey: string | null
  fields: ContractCanonicalField[]
  anchors: DocumentTextAnchor[]
  affectedAnchorIds: string[]
  evidence: MissingTargetEvidence | null
  semanticRole: string
}): {
  replacements: AiContractAnalysisResult['replacements']
  ambiguities: AiContractAnalysisResult['ambiguities']
} {
  const replacements: AiContractAnalysisResult['replacements'] = []
  const ambiguities: AiContractAnalysisResult['ambiguities'] = []

  const ceremony = input.fields.find((f) => f.key === 'location.ceremony')
  const reception = input.fields.find((f) => f.key === 'location.reception')
  const locationCandidates = [ceremony, reception].filter(fieldAvailable)

  for (const anchorId of input.affectedAnchorIds) {
    const anchor = input.anchors.find((a) => a.anchorId === anchorId)
    if (!anchor) continue

    let sourceText: string | null = null
    if (input.evidence?.exactText?.trim() && input.evidence.anchorId === anchorId) {
      const span = resolveExactSourceSpan(
        anchor.text,
        input.evidence.exactText.trim(),
        {
          prefixContext: input.evidence.prefixContext,
          suffixContext: input.evidence.suffixContext,
        },
      )
      if (span.status === 'exact' || span.status === 'normalized_exact') {
        sourceText = span.exactSourceText
      }
    }

    // Prefer an explicit field key when available
    let targetKey = input.fieldKey
    if (targetKey && !fieldAvailable(input.fields.find((f) => f.key === targetKey))) {
      targetKey = null
    }

    if (!targetKey) {
      // Heuristic: ceremony vs reception from context
      const ctx = `${anchor.contextBefore} ${anchor.text} ${anchor.contextAfter}`.toLowerCase()
      const looksCeremony = /ceremoni|ślub|kości[oó]ł|urząd/.test(ctx)
      const looksReception = /przyj[eę]ci|wesel|sali|restaurac/.test(ctx)
      if (looksCeremony && !looksReception && fieldAvailable(ceremony)) {
        targetKey = 'location.ceremony'
      } else if (looksReception && !looksCeremony && fieldAvailable(reception)) {
        targetKey = 'location.reception'
      }
    }

    if (!targetKey) {
      if (locationCandidates.length >= 1 && sourceText) {
        ambiguities.push({
          ambiguityId: `gate:loc:${input.missingId}:${anchorId}`,
          anchorId,
          originalText: sourceText,
          candidateFieldKeys: locationCandidates.map((f) => f.key),
          reason:
            'Nie udało się rozstrzygnąć, czy lokalizacja dotyczy ceremonii czy przyjęcia.',
        })
      } else if (locationCandidates.length >= 1) {
        ambiguities.push({
          ambiguityId: `gate:loc:${input.missingId}:${anchorId}`,
          anchorId,
          originalText: anchor.text.slice(0, 120),
          candidateFieldKeys: locationCandidates.map((f) => f.key),
          reason:
            'Nie udało się rozstrzygnąć, czy lokalizacja dotyczy ceremonii czy przyjęcia.',
        })
      }
      continue
    }

    const field = input.fields.find((f) => f.key === targetKey)
    if (!fieldAvailable(field)) continue

    if (!sourceText) {
      // Without exact source, do not invent — ambiguity
      ambiguities.push({
        ambiguityId: `gate:loc:${input.missingId}:${anchorId}`,
        anchorId,
        originalText: anchor.text.slice(0, 120),
        candidateFieldKeys: [targetKey],
        reason:
          'Lokalizacja w dokumencie różni się od katalogu, ale nie wskazano dokładnego fragmentu źródłowego.',
      })
      continue
    }

    if (valuesAreEquivalent(sourceText, field.formattedValue)) continue

    replacements.push({
      replacementId: `gate:loc:${input.missingId}:${anchorId}`,
      anchorId,
      originalText: sourceText,
      canonicalFieldKey: targetKey,
      proposedValue: field.formattedValue,
      semanticRole: input.semanticRole || field.label,
      reason: 'Lokalizacja w dokumencie różni się od katalogu — zamiana, nie brak danych.',
      confidence: 0.85,
      requiresUserReview: true,
      prefixContext: input.evidence?.prefixContext ?? null,
      suffixContext: input.evidence?.suffixContext ?? null,
    })
  }

  return { replacements, ambiguities }
}

function tryPromoteGenericReplacement(input: {
  missingId: string
  fieldKey: string
  field: ContractCanonicalField & { formattedValue: string }
  anchors: DocumentTextAnchor[]
  affectedAnchorIds: string[]
  evidence: MissingTargetEvidence | null
  semanticRole: string
}): AiContractAnalysisResult['replacements'][number] | null {
  for (const anchorId of input.affectedAnchorIds) {
    const anchor = input.anchors.find((a) => a.anchorId === anchorId)
    if (!anchor) continue
    const exact = input.evidence?.exactText?.trim()
    if (!exact) continue
    const span = resolveExactSourceSpan(anchor.text, exact, {
      prefixContext: input.evidence?.prefixContext,
      suffixContext: input.evidence?.suffixContext,
    })
    if (span.status !== 'exact' && span.status !== 'normalized_exact') continue
    if (valuesAreEquivalent(span.exactSourceText, input.field.formattedValue)) {
      continue
    }
    return {
      replacementId: `gate:repl:${input.missingId}:${anchorId}`,
      anchorId,
      originalText: span.exactSourceText,
      canonicalFieldKey: input.fieldKey,
      proposedValue: input.field.formattedValue,
      semanticRole: input.semanticRole || input.field.label,
      reason: 'Wartość w dokumencie różni się od katalogu — zamiana, nie brak danych.',
      confidence: 0.86,
      requiresUserReview: true,
      prefixContext: input.evidence?.prefixContext ?? null,
      suffixContext: input.evidence?.suffixContext ?? null,
    }
  }
  return null
}

/**
 * Gate AI missingFields into true manual_missing / replacements / ambiguities / ignored.
 */
export function gateMissingFieldClassifications(input: {
  missingFields: AiContractAnalysisResult['missingFields']
  replacements: AiContractAnalysisResult['replacements']
  ambiguities: AiContractAnalysisResult['ambiguities']
  ignoredWeddingFields: AiContractAnalysisResult['ignoredWeddingFields']
  anchors: DocumentTextAnchor[]
  fields: ContractCanonicalField[]
}): {
  missingFields: AiContractAnalysisResult['missingFields']
  replacements: AiContractAnalysisResult['replacements']
  ambiguities: AiContractAnalysisResult['ambiguities']
  ignoredWeddingFields: AiContractAnalysisResult['ignoredWeddingFields']
  counters: ClassificationCounters
} {
  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]))
  const fieldByKey = new Map(input.fields.map((f) => [f.key, f]))
  const replacementAnchorIds = new Set(input.replacements.map((r) => r.anchorId))

  const keptMissing: AiContractAnalysisResult['missingFields'] = []
  const promotedReplacements = [...input.replacements]
  const promotedAmbiguities = [...input.ambiguities]
  const ignored = [...input.ignoredWeddingFields]

  const counters: ClassificationCounters = {
    keptManualMissing: 0,
    promotedReplacements: 0,
    promotedAmbiguities: 0,
    ignoredMissing: 0,
    rejectedGeneric: 0,
    rejectedNoTarget: 0,
  }

  for (const m of input.missingFields) {
    const label = m.label || ''
    const reason = m.reason || ''
    const fieldKey = resolveFieldKey(m)
    const field = fieldKey ? fieldByKey.get(fieldKey) : undefined
    const evidence = getEvidence(m)
    const dataType = m.expectedDataType || ''

    // 1) Generic reconciliation labels — never manual missing
    if (isGenericReconciliationLabel(label, reason)) {
      counters.rejectedGeneric += 1
      if (
        isLocationField(fieldKey) ||
        /lokaliz|adres/i.test(label) ||
        /lokaliz|adres/i.test(reason)
      ) {
        const { replacements, ambiguities } = tryPromoteLocationReplacements({
          missingId: m.missingId,
          fieldKey,
          fields: input.fields,
          anchors: input.anchors,
          affectedAnchorIds: m.affectedAnchorIds,
          evidence,
          semanticRole: m.semanticRole,
        })
        for (const r of replacements) {
          promotedReplacements.push(r)
          replacementAnchorIds.add(r.anchorId)
          counters.promotedReplacements += 1
        }
        for (const a of ambiguities) {
          promotedAmbiguities.push(a)
          counters.promotedAmbiguities += 1
        }
      }
      continue
    }

    // 2) Must have concrete document targets
    if (!m.affectedAnchorIds.length) {
      counters.rejectedNoTarget += 1
      if (fieldKey) {
        ignored.push({
          canonicalFieldKey: fieldKey,
          reason: 'Brak konkretnego fragmentu dokumentu wymagającego tej wartości.',
        })
        counters.ignoredMissing += 1
      }
      continue
    }

    const validAnchorIds = m.affectedAnchorIds.filter((id) => anchorById.has(id))
    if (validAnchorIds.length === 0) {
      counters.rejectedNoTarget += 1
      continue
    }

    // Skip if every affected anchor already has a replacement
    if (validAnchorIds.every((id) => replacementAnchorIds.has(id))) {
      counters.ignoredMissing += 1
      continue
    }

    // 3) Person-role false positive: bride-only anchor ≠ missing groom
    // (run before "available value → replacement" so we don't invent a groom patch)
    if (isGroomNameField(fieldKey, label)) {
      const brideOnly = validAnchorIds.every((id) => {
        const a = anchorById.get(id)!
        const hasBride = anchorContainsCanonicalName(
          a.text,
          input.fields,
          BRIDE_NAME_KEYS,
        )
        const hasGroom = anchorContainsCanonicalName(
          a.text,
          input.fields,
          GROOM_NAME_KEYS,
        )
        const groomCue =
          /pan(a)?\s*młod|groom|pana\s*młodego|zamawiający(?!a)/i.test(
            `${a.contextBefore} ${a.text} ${a.contextAfter}`,
          )
        return hasBride && !hasGroom && !groomCue
      })
      if (brideOnly) {
        promotedAmbiguities.push({
          ambiguityId: `gate:role:${m.missingId}`,
          anchorId: validAnchorIds[0]!,
          originalText: anchorById.get(validAnchorIds[0]!)!.text.slice(0, 120),
          candidateFieldKeys: ['bride.full_name', 'groom.full_name'],
          reason: PERSON_ROLE_MSG,
        })
        counters.promotedAmbiguities += 1
        continue
      }
    }

    // 4) Canonical value EXISTS → mismatch is replacement / ambiguity, never missing
    if (fieldAvailable(field) && fieldKey) {
      if (isPhoneField(fieldKey, dataType)) {
        const repl = tryPromotePhoneReplacement({
          missingId: m.missingId,
          fieldKey,
          field,
          anchors: input.anchors,
          affectedAnchorIds: validAnchorIds,
          evidence,
          semanticRole: m.semanticRole,
        })
        if (repl) {
          promotedReplacements.push(repl)
          replacementAnchorIds.add(repl.anchorId)
          counters.promotedReplacements += 1
          continue
        }
        // Could not safely locate phone span → ambiguity, not missing
        promotedAmbiguities.push({
          ambiguityId: `gate:phone:${m.missingId}`,
          anchorId: validAnchorIds[0]!,
          originalText: evidence?.exactText || anchorById.get(validAnchorIds[0]!)!.text.slice(0, 80),
          candidateFieldKeys: [fieldKey],
          reason:
            'Dokument zawiera inny telefon niż katalog, ale nie udało się jednoznacznie wskazać fragmentu.',
        })
        counters.promotedAmbiguities += 1
        continue
      }

      if (isLocationField(fieldKey) || /lokaliz|adres/i.test(label)) {
        const { replacements, ambiguities } = tryPromoteLocationReplacements({
          missingId: m.missingId,
          fieldKey,
          fields: input.fields,
          anchors: input.anchors,
          affectedAnchorIds: validAnchorIds,
          evidence,
          semanticRole: m.semanticRole,
        })
        for (const r of replacements) {
          promotedReplacements.push(r)
          replacementAnchorIds.add(r.anchorId)
          counters.promotedReplacements += 1
        }
        for (const a of ambiguities) {
          promotedAmbiguities.push(a)
          counters.promotedAmbiguities += 1
        }
        continue
      }

      const generic = tryPromoteGenericReplacement({
        missingId: m.missingId,
        fieldKey,
        field,
        anchors: input.anchors,
        affectedAnchorIds: validAnchorIds,
        evidence,
        semanticRole: m.semanticRole,
      })
      if (generic) {
        promotedReplacements.push(generic)
        replacementAnchorIds.add(generic.anchorId)
        counters.promotedReplacements += 1
        continue
      }

      // Value exists but no safe span — not a manual missing field
      promotedAmbiguities.push({
        ambiguityId: `gate:avail:${m.missingId}`,
        anchorId: validAnchorIds[0]!,
        originalText: evidence?.exactText || '',
        candidateFieldKeys: [fieldKey],
        reason:
          'Wartość jest dostępna w katalogu wesela — to nie jest brakujące pole. Wymagana ręczna weryfikacja mapowania.',
      })
      counters.promotedAmbiguities += 1
      continue
    }

    // 5) Groom name truly absent + clear target (continue name-specific path)
    if (isGroomNameField(fieldKey, label)) {
      const groomFull = fieldByKey.get('groom.full_name')
      const groomFirst = fieldByKey.get('groom.first_name')
      const hasGroomName =
        fieldAvailable(groomFull) || fieldAvailable(groomFirst)
      if (hasGroomName) {
        promotedAmbiguities.push({
          ambiguityId: `gate:groom:${m.missingId}`,
          anchorId: validAnchorIds[0]!,
          originalText: evidence?.exactText || '',
          candidateFieldKeys: ['groom.full_name'],
          reason: PERSON_ROLE_MSG,
        })
        counters.promotedAmbiguities += 1
        continue
      }
      // Fall through to true missing if evidence exists
    }

    // 6) Unavailable catalog field without real document requirement → ignored
    const hasBlankTarget = validAnchorIds.some((id) => {
      const t = anchorById.get(id)!.text
      return /_{3,}|\.{3,}|\[\s*\]|……|…{2,}/.test(t)
    })
    const hasLabeledTarget = validAnchorIds.some((id) => {
      const a = anchorById.get(id)!
      const ctx = `${a.contextBefore} ${a.text} ${a.contextAfter}`.toLowerCase()
      if (isPhoneField(fieldKey, dataType)) {
        return /telefon\s*:|tel\.\s*:|kom\.\s*:/.test(ctx) || hasBlankTarget
      }
      if (fieldKey?.includes('email') || dataType.toLowerCase() === 'email') {
        // Require an explicit email field label — not the word "e-mail" in prose
        return (
          /e-?mail\s+(pana|panny|zamawiaj)|e-?mail\s*:|adres\s+e-?mail/.test(
            ctx,
          ) || hasBlankTarget
        )
      }
      if (isGroomNameField(fieldKey, label)) {
        return /pan(a)?\s*młod|pana\s*młodego|zamawiający(?!a)/i.test(ctx)
      }
      if (isLocationField(fieldKey)) {
        return /lokaliz|adres|ceremoni|przyj[eę]ci|wesel/.test(ctx)
      }
      return Boolean(evidence?.exactText?.trim())
    })
    const hasConcreteTarget =
      Boolean(evidence?.exactText?.trim()) || hasBlankTarget || hasLabeledTarget

    if (!hasConcreteTarget) {
      if (fieldKey) {
        ignored.push({
          canonicalFieldKey: fieldKey,
          reason:
            'Pole niedostępne w katalogu, ale dokument nie wymaga tej wartości.',
        })
      }
      counters.ignoredMissing += 1
      continue
    }

    // Avoid duplicate missing for bride when value already available
    if (isBrideNameField(fieldKey) && fieldAvailable(fieldByKey.get('bride.full_name'))) {
      counters.ignoredMissing += 1
      continue
    }

    if (!evidence?.semanticLabel?.trim() && !m.semanticRole?.trim()) {
      counters.rejectedNoTarget += 1
      continue
    }

    const gated: AiContractAnalysisResult['missingFields'][number] = {
      ...m,
      affectedAnchorIds: validAnchorIds,
      suggestedCanonicalFieldKey: fieldKey,
      label: m.label,
      reason: m.reason,
    }
    ;(gated as typeof gated & { fieldKey?: string | null; targetEvidence?: MissingTargetEvidence | null }).fieldKey =
      fieldKey
    ;(gated as typeof gated & { targetEvidence?: MissingTargetEvidence | null }).targetEvidence =
      evidence
        ? {
            ...evidence,
            anchorId: evidence.anchorId || validAnchorIds[0]!,
            semanticLabel: evidence.semanticLabel || m.semanticRole || m.label,
          }
        : {
            anchorId: validAnchorIds[0]!,
            semanticLabel: m.semanticRole || m.label,
          }

    keptMissing.push(gated)
    counters.keptManualMissing += 1
  }

  return {
    missingFields: keptMissing,
    replacements: promotedReplacements,
    ambiguities: promotedAmbiguities,
    ignoredWeddingFields: ignored,
    counters,
  }
}

export { PERSON_ROLE_MSG }
