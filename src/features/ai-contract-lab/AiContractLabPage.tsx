import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { isAiContractLabEnabled } from '@/features/ai-contract-lab/aiContractLabFlags'
import { analyzeContractLabDocument } from '@/features/ai-contract-lab/aiContractLabApi'
import { formatPhaseAErrorDetails } from '@/features/ai-contract-lab/aiContractLabErrors'
import { softValidatePhaseASemanticMap } from '@/features/ai-contract-lab/phaseAValidateSemanticMap'
import {
  buildLabDownloadFileName,
  createLabSessionId,
  readStoredLabWeddingId,
  writeStoredLabWeddingId,
} from '@/features/ai-contract-lab/aiContractLabSession'
import {
  LAB_STEPS,
  type AiContractAnalysisResult,
  type ApprovedContractPatch,
  type ContractIntegrityReport,
  type DocumentSemanticMap,
  type DocumentTextAnchor,
  type DocxLabSourceMeta,
  type ManualMissingFieldValue,
  type LabReplacementRow,
  type LabStep,
  type SemanticMappingRow,
  type SemanticQualityMetrics,
  type SemanticStatus,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { mapSemanticMapToWeddingPlan } from '@/features/ai-contract-lab/mapSemanticRolesToWedding'
import { createContractGenerationContext } from '@/features/ai-contract-lab/contractGenerationContext'
import {
  applyApprovedReplacementPlan,
  compareDocxIntegrity,
} from '@/features/ai-contract-lab/applyApprovedReplacementPlan'
import { buildContractDataSnapshot } from '@/features/ai-contract-lab/buildContractDataSnapshot'
import {
  buildDocumentAnalysisPayload,
  inspectLabDocx,
} from '@/features/ai-contract-lab/docxLabExtract'
import {
  applyManualSourceSpanToRow,
  buildApprovedPatches,
  buildReplacementRows,
  validateAiReplacementPlan,
} from '@/features/ai-contract-lab/validateAiReplacementPlan'
import {
  createEmptyManualValues,
  isMissingFieldResolved,
  mergeReplacementRowsWithManual,
  sourceDisplayLabel,
  validateManualFieldValue,
} from '@/features/ai-contract-lab/manualMissingValues'
import {
  applyPhaseCToRows,
  phaseCAllowsGeneration,
  runPhaseCDocumentReadyAudit,
  type PhaseCAuditResult,
} from '@/features/ai-contract-lab/phaseCAudit'
import type { LegalEntityType } from '@/features/ai-contract-lab/phaseCStructuralTypes'
import {
  buildProposedTemplateConfiguration,
  templateAllowsGeneration,
  validateTemplateConfigurationForSave,
  type ContractTemplateConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { TemplateFieldConfigurationView } from '@/features/ai-contract-lab/TemplateFieldConfigurationView'
import {
  loadLabFieldConfiguration,
  saveLabFieldConfiguration,
} from '@/features/ai-contract-lab/persistTemplateFieldConfiguration'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import styles from './AiContractLabPage.module.css'

function displayValue(value: string | null | undefined) {
  if (value == null || !String(value).trim()) {
    return <span className={styles.empty}>Brak danych</span>
  }
  return value
}

function semanticStatusLabel(status: SemanticStatus, reason?: string | null): string {
  if (
    status === 'UNCHANGED' &&
    reason &&
    /template-owner invariant|dane właściciela szablonu|Template-owner/i.test(reason)
  ) {
    return 'Pozostaje bez zmian — dane właściciela szablonu'
  }
  switch (status) {
    case 'UNCHANGED':
      return 'UNCHANGED'
    case 'REPLACEMENT':
      return 'REPLACEMENT'
    case 'REVIEW':
      return 'REVIEW'
    case 'DERIVED':
      return 'DERIVED'
    case 'AMBIGUOUS':
      return 'AMBIGUOUS'
    case 'IGNORED':
      return 'IGNORED'
    case 'DOCUMENT_ONLY':
      return 'DOCUMENT_ONLY'
    default:
      return status
  }
}

function downloadBytes(bytes: ArrayBuffer, fileName: string) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function AiContractLabPage() {
  if (!isAiContractLabEnabled()) {
    return <Navigate to="/dashboard" replace />
  }

  return <AiContractLabInner />
}

function AiContractLabInner() {
  const userId = useStudioAuthId()
  const [step, setStep] = useState<LabStep>('wedding')
  const [weddingId, setWeddingId] = useState<string | null>(() =>
    readStoredLabWeddingId(),
  )
  const [sessionId] = useState(() => createLabSessionId())
  const [generationContext] = useState(() => createContractGenerationContext())
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null)
  const [sourceMeta, setSourceMeta] = useState<DocxLabSourceMeta | null>(null)
  const [anchors, setAnchors] = useState<DocumentTextAnchor[]>([])
  const [analysis, setAnalysis] = useState<AiContractAnalysisResult | null>(
    null,
  )
  const [semanticMap, setSemanticMap] = useState<DocumentSemanticMap | null>(
    null,
  )
  const [mappingRows, setMappingRows] = useState<SemanticMappingRow[]>([])
  const [semanticMetrics, setSemanticMetrics] =
    useState<SemanticQualityMetrics | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisErrorDetails, setAnalysisErrorDetails] = useState<string | null>(
    null,
  )
  const [phaseAStats, setPhaseAStats] = useState<{
    providerRows: number
    validRows: number
    unresolvedRows: number
  } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [rows, setRows] = useState<LabReplacementRow[]>([])
  const [manual, setManual] = useState<ManualMissingFieldValue[]>([])
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({})
  /** Draft exact source text for ambiguous / not_found rows (session-only). */
  const [spanDrafts, setSpanDrafts] = useState<Record<string, string>>({})
  const [spanErrors, setSpanErrors] = useState<Record<string, string>>({})
  const [canonicalRows, setCanonicalRows] = useState<LabReplacementRow[]>([])
  const [patches, setPatches] = useState<ApprovedContractPatch[]>([])
  const [generatedBytes, setGeneratedBytes] = useState<ArrayBuffer | null>(null)
  const [integrity, setIntegrity] = useState<ContractIntegrityReport | null>(
    null,
  )
  const [phaseCAudit, setPhaseCAudit] = useState<PhaseCAuditResult | null>(null)
  const [fieldConfiguration, setFieldConfiguration] =
    useState<ContractTemplateConfiguration | null>(() =>
      loadLabFieldConfiguration(sessionId),
    )
  const [configErrors, setConfigErrors] = useState<string[]>([])
  const [configSaving, setConfigSaving] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [dirtySession, setDirtySession] = useState(false)

  const { data: weddings = [], isLoading: weddingsLoading } = useQuery({
    queryKey: ['weddings', userId],
    queryFn: () => weddingService.getAll(),
    enabled: Boolean(userId),
  })

  const {
    data: snapshot = null,
    refetch: refetchSnapshot,
    isFetching: snapshotFetching,
  } = useQuery({
    queryKey: ['ai-contract-lab-snapshot', userId, weddingId],
    queryFn: async () => {
      if (!weddingId) return null
      const [wedding, company, extras, places] = await Promise.all([
        weddingService.getById(weddingId),
        companyDetailsService.get(),
        weddingExtraServiceService.listByWeddingId(weddingId),
        weddingPlaceService.listByWeddingId(weddingId),
      ])
      if (!wedding) throw new Error('Nie znaleziono wesela lub brak dostępu.')
      return buildContractDataSnapshot({ wedding, company, extras, places })
    },
    enabled: Boolean(userId && weddingId),
  })

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtySession) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtySession])

  const selectedWedding = useMemo(
    () => weddings.find((w) => w.id === weddingId) ?? null,
    [weddings, weddingId],
  )

  const fieldsByCategory = useMemo(() => {
    const groups: Record<
      string,
      NonNullable<typeof snapshot>['fields']
    > = {
      client: [],
      wedding: [],
      company: [],
      package: [],
      extras: [],
      payments: [],
      location: [],
    }
    for (const f of snapshot?.fields ?? []) {
      groups[f.category]?.push(f)
    }
    return groups
  }, [snapshot])

  function selectWedding(id: string) {
    setWeddingId(id)
    writeStoredLabWeddingId(id)
    setDirtySession(false)
    setAnalysis(null)
    setSemanticMap(null)
    setMappingRows([])
    setRows([])
    setCanonicalRows([])
    setManual([])
    setManualErrors({})
    setPatches([])
    setGeneratedBytes(null)
    setIntegrity(null)
    setSourceBytes(null)
    setSourceMeta(null)
    setAnchors([])
  }

  async function onUpload(file: File | null) {
    if (!file) return
    setAnalysisError(null)
    const bytes = await file.arrayBuffer()
    const { meta, anchors: nextAnchors } = await inspectLabDocx(file, bytes)
    // Keep an immutable copy — never mutate sourceBytes later.
    setSourceBytes(bytes.slice(0))
    setSourceMeta(meta)
    setAnchors(nextAnchors)
    setDirtySession(true)
    setAnalysis(null)
    setSemanticMap(null)
    setMappingRows([])
    setRows([])
    setGeneratedBytes(null)
    setIntegrity(null)
    setStep('upload')
  }

  async function runAnalysis() {
    if (!snapshot || !sourceMeta || !sourceBytes) return
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisErrorDetails(null)
    setPhaseAStats(null)
    try {
      const payload = buildDocumentAnalysisPayload({
        anchors,
        fields: snapshot.fields,
      })
      const result = await analyzeContractLabDocument({
        sessionId,
        weddingId: snapshot.weddingId,
        sourceHash: sourceMeta.sourceHash,
        textAnchors: payload.textAnchors,
        fieldCatalog: payload.fieldCatalog,
      })
      if (!result.ok) {
        setAnalysisError(
          'Analiza Phase A została odrzucona. Oryginalny dokument nie został zmieniony.',
        )
        setAnalysisErrorDetails(formatPhaseAErrorDetails(result.error))
        return
      }

      const soft = softValidatePhaseASemanticMap({
        raw: result.semanticMap,
        anchors,
        expectedVersion: '2.0.0',
      })
      if (!soft.ok) {
        setAnalysisError(
          'Analiza Phase A została odrzucona. Oryginalny dokument nie został zmieniony.',
        )
        setAnalysisErrorDetails(
          [
            `Etap: ${soft.stage}`,
            `Kod: ${soft.code}`,
            `Nieprawidłowe rekordy: ${soft.issueCount}`,
            ...soft.issues
              .slice(0, 12)
              .map((i) => `${i.path} — ${i.code}`),
          ].join('\n'),
        )
        setPhaseAStats(soft.stats)
        return
      }

      setPhaseAStats(soft.stats)
      const map = soft.semanticMap
      setSemanticMap(map)

      const proposed = buildProposedTemplateConfiguration({
        templateId: `lab:${sessionId}`,
        templateVersionId: sourceMeta.sourceHash,
        semanticMap: map,
        existing: fieldConfiguration,
      })
      setFieldConfiguration(proposed)
      saveLabFieldConfiguration(sessionId, proposed)

      // Phase B — deterministic role → wedding field mapping (uses saved config)
      const mapped = mapSemanticMapToWeddingPlan({
        semanticMap: map,
        fields: snapshot.fields,
        anchors,
        generationContext,
        fieldConfiguration: proposed,
      })
      setMappingRows(mapped.mappingRows)
      setSemanticMetrics(mapped.metrics)

      const validated = validateAiReplacementPlan(
        mapped.analysis,
        anchors,
        snapshot.fields,
      )
      if (!validated.ok) {
        setAnalysisError(
          `Mapowanie semantyczne nie powiodło się. Oryginalny dokument nie został zmieniony. (${validated.errors[0] ?? 'walidacja'})`,
        )
        return
      }
      setAnalysis(validated.analysis)
      const builtCanonical = buildReplacementRows(
        validated.analysis,
        snapshot.fields,
        anchors,
      )
      setCanonicalRows(builtCanonical)
      setRows(builtCanonical)
      setManual(createEmptyManualValues(validated.analysis.missingFields))
      setManualErrors({})
      setSpanDrafts({})
      setSpanErrors({})
      setStep('semantic')
    } finally {
      setAnalyzing(false)
    }
  }

  function remapWithConfiguration(config: ContractTemplateConfiguration) {
    if (!semanticMap || !snapshot) return
    const mapped = mapSemanticMapToWeddingPlan({
      semanticMap,
      fields: snapshot.fields,
      anchors,
      generationContext,
      fieldConfiguration: config,
    })
    setMappingRows(mapped.mappingRows)
    setSemanticMetrics(mapped.metrics)
    const validated = validateAiReplacementPlan(
      mapped.analysis,
      anchors,
      snapshot.fields,
    )
    if (!validated.ok) return
    setAnalysis(validated.analysis)
    const builtCanonical = buildReplacementRows(
      validated.analysis,
      snapshot.fields,
      anchors,
    )
    setCanonicalRows(builtCanonical)
    setRows(builtCanonical)
    setManual(createEmptyManualValues(validated.analysis.missingFields))
  }

  function setRowDecision(
    id: string,
    decision: LabReplacementRow['decision'],
  ) {
    setRows((prev) =>
      prev.map((r) => (r.replacementId === id ? { ...r, decision } : r)),
    )
  }

  function resolveSpanManually(replacementId: string) {
    const row = rows.find((r) => r.replacementId === replacementId)
    if (!row) return
    const anchor = anchors.find((a) => a.anchorId === row.anchorId)
    if (!anchor) {
      setSpanErrors((prev) => ({
        ...prev,
        [replacementId]: 'Brak fragmentu dokumentu dla tej zmiany.',
      }))
      return
    }
    const draft = spanDrafts[replacementId] ?? ''
    const result = applyManualSourceSpanToRow(row, anchor.text, draft)
    if (!result.ok) {
      setSpanErrors((prev) => ({
        ...prev,
        [replacementId]: result.error,
      }))
      return
    }
    setSpanErrors((prev) => {
      const next = { ...prev }
      delete next[replacementId]
      return next
    })
    setRows((prev) =>
      prev.map((r) =>
        r.replacementId === replacementId ? result.row : r,
      ),
    )
    setCanonicalRows((prev) =>
      prev.map((r) =>
        r.replacementId === replacementId ? result.row : r,
      ),
    )
  }

  function updateManualValue(missingId: string, value: string) {
    setManual((prev) =>
      prev.map((x) => (x.missingId === missingId ? { ...x, value } : x)),
    )
    setManualErrors((prev) => {
      if (!prev[missingId]) return prev
      const next = { ...prev }
      delete next[missingId]
      return next
    })
  }

  /** Validate missing fields and merge manual proposals into the plan. */
  function goToPlanFromMissing(): boolean {
    if (!analysis) return false
    const nextErrors: Record<string, string> = {}
    for (const field of analysis.missingFields) {
      const entry = manual.find((m) => m.missingId === field.missingId)
      const raw = entry?.value ?? ''
      if (!raw.trim()) {
        nextErrors[field.missingId] = 'To pole jest wymagane.'
        continue
      }
      const err = validateManualFieldValue(field.expectedDataType, raw)
      if (err) nextErrors[field.missingId] = err
    }
    setManualErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return false

    const merged = mergeReplacementRowsWithManual({
      canonicalRows,
      missing: analysis.missingFields,
      manual,
      anchors,
      previousRows: rows,
    })
    if (merged.errors.length > 0) {
      setGenerateError(merged.errors[0]!)
      return false
    }
    setRows(merged.rows)
    setGenerateError(null)
    setStep('plan')
    return true
  }

  function canonicalEntityType(): LegalEntityType | undefined {
    const raw = snapshot?.fields.find((field) =>
      /(?:company\.)?(?:legal_)?entity_type|legal_form_type/.test(field.key),
    )
    const value = String(raw?.value ?? raw?.formattedValue ?? '')
      .trim()
      .toLowerCase()
    const allowed: LegalEntityType[] = [
      'sole_proprietorship',
      'civil_partnership',
      'partnership',
      'limited_company',
      'individual',
      'other',
      'unknown',
    ]
    return allowed.includes(value as LegalEntityType)
      ? (value as LegalEntityType)
      : undefined
  }

  function runPhaseCAudit(nextStep: 'structure' | 'audit' = 'audit') {
    if (!analysis) return
    const packageField = snapshot?.fields.find((f) => f.key === 'package.contents')
    const packageItems =
      packageField?.formattedValue
        ?.split(/[\n;,•·]+/)
        .map((s) => s.trim())
        .filter(Boolean) ?? []
    const docPkg = mappingRows
      .filter(
        (r) =>
          r.semanticRole === 'package_item' ||
          r.semanticRole === 'package_contents',
      )
      .map((r) => ({ text: r.documentValue || r.sourceText }))

    const packageOpts = {
      packageCanonicalItems: packageItems,
      packageDocumentItems: docPkg,
      mappingRows,
      canonicalFields: snapshot?.fields,
      canonicalEntityType: canonicalEntityType(),
      fieldConfiguration,
    }

    let nextRows = rows
    let audit = runPhaseCDocumentReadyAudit({
      rows: nextRows,
      anchors,
      ...packageOpts,
    })

    // Deterministic amount-in-words: inject linked patches, then re-audit
    if (audit.linkedPatches.length > 0) {
      nextRows = applyPhaseCToRows({
        rows: nextRows,
        audit: { ...audit, downgradeReplacementIds: [] },
        anchors,
      })
      audit = runPhaseCDocumentReadyAudit({
        rows: nextRows,
        anchors,
        ...packageOpts,
      })
    }

    if (audit.downgradeReplacementIds.length > 0) {
      nextRows = applyPhaseCToRows({
        rows: nextRows,
        audit: { ...audit, linkedPatches: [] },
        anchors,
      })
    }

    setRows(nextRows)
    setPhaseCAudit(audit)
    setStep(nextStep)
  }

  async function runGenerate() {
    if (!sourceBytes || !analysis) return
    setGenerating(true)
    setGenerateError(null)
    try {
      if (!templateAllowsGeneration(fieldConfiguration)) {
        setGenerateError(
          'Szablon nie jest skonfigurowany — zapisz konfigurację pól jako gotową.',
        )
        setStep('configure')
        return
      }
      // Refresh manual proposals from latest session values before gating.
      const merged = mergeReplacementRowsWithManual({
        canonicalRows,
        missing: analysis.missingFields,
        manual,
        anchors,
        previousRows: rows,
      })
      if (merged.errors.length > 0) {
        setGenerateError(merged.errors[0]!)
        setStep('missing')
        return
      }
      const planRows = merged.rows
      setRows(planRows)

      for (const field of analysis.missingFields) {
        const entry = manual.find((m) => m.missingId === field.missingId)
        if (!isMissingFieldResolved(entry)) {
          setGenerateError(`Uzupełnij: ${field.label}`)
          setStep('missing')
          return
        }
      }

      // Phase C gate — never generate an invalid legal document
      const packageField = snapshot?.fields.find((f) => f.key === 'package.contents')
      const packageItems =
        packageField?.formattedValue
          ?.split(/[\n;,•·]+/)
          .map((s) => s.trim())
          .filter(Boolean) ?? []
      const packageOpts = {
        packageCanonicalItems: packageItems,
        packageDocumentItems: mappingRows
          .filter(
        (r) =>
          r.semanticRole === 'package_item' ||
          r.semanticRole === 'package_contents',
      )
          .map((r) => ({ text: r.documentValue || r.sourceText })),
        mappingRows,
        canonicalFields: snapshot?.fields,
        canonicalEntityType: canonicalEntityType(),
        fieldConfiguration,
      }
      let gatedRows = planRows
      let audit = runPhaseCDocumentReadyAudit({
        rows: gatedRows,
        anchors,
        ...packageOpts,
      })
      if (audit.linkedPatches.length > 0) {
        gatedRows = applyPhaseCToRows({
          rows: gatedRows,
          audit: { ...audit, downgradeReplacementIds: [] },
          anchors,
        })
        audit = runPhaseCDocumentReadyAudit({
          rows: gatedRows,
          anchors,
          ...packageOpts,
        })
      }
      setPhaseCAudit(audit)
      if (!phaseCAllowsGeneration(audit)) {
        setRows(
          applyPhaseCToRows({
            rows: gatedRows,
            audit: { ...audit, linkedPatches: [] },
            anchors,
          }),
        )
        setGenerateError(
          audit.blockers[0] ??
            `Phase C: Document Quality ${audit.qualityScore}/100 — generowanie zablokowane.`,
        )
        setStep('audit')
        return
      }
      setRows(gatedRows)

      const built = buildApprovedPatches({
        rows: audit.reconciledRows,
        anchors,
        manual,
        missing: analysis.missingFields,
      })
      if (built.errors.length > 0) {
        setGenerateError(built.errors[0]!)
        setStep('plan')
        return
      }
      const nextBytes = await applyApprovedReplacementPlan(
        sourceBytes,
        built.patches,
      )
      const report = await compareDocxIntegrity({
        sourceBytes,
        generatedBytes: nextBytes,
        patches: built.patches,
      })
      setPatches(built.patches)
      setGeneratedBytes(nextBytes)
      setIntegrity(report)
      setStep('compare')
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'Generowanie nie powiodło się.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const canDownload = Boolean(
    integrity?.passed && generatedBytes && patches.length >= 0,
  )

  const stepIndex = LAB_STEPS.findIndex((s) => s.id === step)

  return (
    <AppLayout title="Laboratorium umów AI">
      <PageContainer>
        <div className={styles.page} data-testid="ai-contract-lab-page">
          <div className={styles.header}>
            <h1 className={styles.title}>
              Laboratorium umów AI
              <span className={styles.badge}>Eksperyment</span>
            </h1>
          </div>

          <div className={styles.notice}>
            <p className={styles.noticeTitle}>Funkcja eksperymentalna</p>
            <p className={styles.noticeBody}>
              Ta funkcja służy do testowania nowego sposobu generowania umów. Nie
              zmienia obecnego systemu szablonów.
            </p>
          </div>

          <ol className={styles.steps} aria-label="Kroki laboratorium">
            {LAB_STEPS.map((s, i) => (
              <li
                key={s.id}
                className={`${styles.step} ${
                  s.id === step
                    ? styles.stepActive
                    : i < stepIndex
                      ? styles.stepDone
                      : ''
                }`}
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>

          {step === 'wedding' || step === 'upload' ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Wesele testowe</h2>
              <p className={styles.muted}>
                Wybierz jedno wesele ze swojego studia. Dane pochodzą z bieżącej
                bazy — bez mocków.
              </p>
              <Select
                label="Wesele"
                value={weddingId ?? ''}
                disabled={weddingsLoading}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) selectWedding(id)
                }}
              >
                <option value="">Wybierz…</option>
                {weddings.map((w) => (
                  <option key={w.id} value={w.id}>
                    {getWeddingDisplayName(w)} ·{' '}
                    {w.date || 'brak daty'}
                  </option>
                ))}
              </Select>

              {snapshot ? (
                <>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={snapshotFetching}
                      onClick={() => void refetchSnapshot()}
                    >
                      Odśwież dane
                    </Button>
                    <span className={styles.muted}>
                      Dostępne pola: {snapshot.availableCount} · Brak:{' '}
                      {snapshot.unavailableCount}
                    </span>
                  </div>

                  <div className={styles.grid2}>
                    {(
                      [
                        ['Para', 'client'],
                        ['Ślub', 'wedding'],
                        ['Firma', 'company'],
                        ['Pakiet', 'package'],
                        ['Dodatki', 'extras'],
                        ['Finanse', 'payments'],
                        ['Lokalizacje', 'location'],
                      ] as const
                    ).map(([title, cat]) => (
                      <div key={cat}>
                        <h3 className={styles.panelTitle}>{title}</h3>
                        <dl className={styles.kv}>
                          {(fieldsByCategory[cat] ?? []).map((f) => (
                            <div key={f.key}>
                              <dt>{f.label}</dt>
                              <dd>{displayValue(f.formattedValue)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {snapshot ? (
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setStep('upload')}
                  >
                    Dalej — wzór DOCX
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 'upload' ||
          (sourceMeta &&
            ['analysis', 'missing', 'plan', 'generate', 'compare', 'download'].includes(
              step,
            )) ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Wzór DOCX</h2>
              <div className={styles.uploadZone}>
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    void onUpload(file).catch((err) => {
                      setAnalysisError(
                        err instanceof Error
                          ? err.message
                          : 'Nie udało się wczytać pliku.',
                      )
                    })
                  }}
                />
              </div>
              {sourceMeta ? (
                <dl className={styles.kv}>
                  <div>
                    <dt>Plik</dt>
                    <dd>{sourceMeta.fileName}</dd>
                  </div>
                  <div>
                    <dt>Rozmiar</dt>
                    <dd>{Math.round(sourceMeta.sizeBytes / 1024)} KB</dd>
                  </div>
                  <div>
                    <dt>Akapity</dt>
                    <dd>
                      {sourceMeta.nonEmptyParagraphCount} /{' '}
                      {sourceMeta.paragraphCount}
                    </dd>
                  </div>
                  <div>
                    <dt>Tabele</dt>
                    <dd>{sourceMeta.tableCount}</dd>
                  </div>
                  <div>
                    <dt>Nagłówek / stopka</dt>
                    <dd>
                      {sourceMeta.hasHeader ? 'Tak' : 'Nie'} /{' '}
                      {sourceMeta.hasFooter ? 'Tak' : 'Nie'}
                    </dd>
                  </div>
                  <div>
                    <dt>Hash źródła</dt>
                    <dd>
                      <code>{sourceMeta.sourceHash.slice(0, 16)}…</code>
                    </dd>
                  </div>
                </dl>
              ) : null}
              {analysisError && step === 'upload' ? (
                <p className={styles.statusBad} role="alert">
                  {analysisError}
                </p>
              ) : null}
              {sourceMeta && snapshot ? (
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('wedding')}
                  >
                    Wstecz
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={analyzing}
                    onClick={() => {
                      setStep('analysis')
                      void runAnalysis()
                    }}
                  >
                    {analyzing ? 'Analiza…' : 'Uruchom analizę AI'}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 'analysis' ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Analiza AI — Phase A</h2>
              {analyzing ? (
                <p className={styles.muted}>
                  Buduję mapę semantyczną dokumentu (bez mapowania na wesele i
                  bez zamian)…
                </p>
              ) : null}
              {analysisError ? (
                <>
                  <p className={styles.statusBad} role="alert">
                    {analysisError}
                  </p>
                  {analysisErrorDetails ? (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        opacity: 0.85,
                        margin: '8px 0',
                      }}
                    >
                      {analysisErrorDetails}
                    </pre>
                  ) : null}
                  {phaseAStats ? (
                    <p className={styles.muted}>
                      Stats: provider={phaseAStats.providerRows}, valid=
                      {phaseAStats.validRows}, unresolved=
                      {phaseAStats.unresolvedRows}
                    </p>
                  ) : null}
                  <p className={styles.muted}>
                    Możesz ponowić analizę bez ponownego wgrywania pliku DOCX.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={analyzing}
                    onClick={() => void runAnalysis()}
                  >
                    {analyzing ? 'Analiza…' : 'Ponów analizę'}
                  </Button>
                </>
              ) : null}
              {semanticMap && !analyzing ? (
                <>
                  <p className={styles.statusOk}>
                    Mapa semantyczna gotowa ·{' '}
                    {semanticMap.semanticAnchors.length} ról
                    {phaseAStats
                      ? ` · unresolved ${phaseAStats.unresolvedRows}`
                      : ''}{' '}
                    · Phase B wykonało mapowanie lokalnie
                  </p>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setStep('semantic')}
                    >
                      Dalej — mapa semantyczna
                    </Button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {step === 'semantic' && semanticMap ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Mapa semantyczna</h2>
              <p className={styles.muted}>
                Dane zmienne (klienci, lokalizacje, pakiet) mogą wymagać zamiany.
                Dane stałe szablonu (firma, NIP, REGON, konto, klauzule) pozostają
                bez zmian — to dane właściciela szablonu.
              </p>
              {semanticMetrics ? (
                <ul className={styles.muted} style={{ marginBottom: 12 }}>
                  <li>
                    role detected: {semanticMetrics.semanticRolesDetected}
                  </li>
                  <li>
                    automatic: {semanticMetrics.automaticMappings} · review:{' '}
                    {semanticMetrics.reviewMappings} · derived:{' '}
                    {semanticMetrics.derivedMappings}
                  </li>
                  <li>
                    unchanged: {semanticMetrics.unchangedMappings} ·
                    replacement: {semanticMetrics.replacementMappings} ·
                    ambiguous: {semanticMetrics.ambiguousMappings} · ignored:{' '}
                    {semanticMetrics.ignoredMappings}
                  </li>
                  <li>unresolved rows: {semanticMetrics.unresolvedRows}</li>
                </ul>
              ) : null}
              <div className={styles.kv} style={{ marginBottom: 16 }}>
                <div>
                  <dt>Dane zmienne</dt>
                  <dd>
                    {
                      mappingRows.filter((r) =>
                        ['REPLACEMENT', 'DERIVED', 'REVIEW'].includes(r.status),
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt>Wymagają uzupełnienia</dt>
                  <dd>{analysis?.missingFields.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Wymagają decyzji</dt>
                  <dd>
                    {
                      mappingRows.filter(
                        (r) =>
                          r.status === 'REVIEW' || r.status === 'AMBIGUOUS',
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt>Dane stałe szablonu</dt>
                  <dd>
                    {
                      mappingRows.filter(
                        (r) =>
                          r.status === 'UNCHANGED' &&
                          /template-owner invariant|dane właściciela|fixed_template/i.test(
                            `${r.reason ?? ''} ${r.confidenceReasons.join(' ')}`,
                          ),
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt>Nierozwiązane pola zmienne</dt>
                  <dd>{semanticMap.unresolved?.length ?? 0}</dd>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Anchor</th>
                      <th>Rola</th>
                      <th>Kind</th>
                      <th>Confidence</th>
                      <th>Exact span</th>
                      <th>OLD → NEW</th>
                      <th>Status</th>
                      <th>Patchable</th>
                      <th>Powód</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingRows.map((r) => (
                      <tr
                        key={`${r.anchorId}:${r.semanticRole}:${r.sourceText}:${r.groupId ?? ''}`}
                      >
                        <td>
                          <code>{r.anchorId}</code>
                          {r.documentLabel ? (
                            <p className={styles.muted}>{r.documentLabel}</p>
                          ) : null}
                          {r.groupId ? (
                            <p className={styles.muted}>{r.groupId}</p>
                          ) : null}
                        </td>
                        <td>
                          {r.semanticLabel}
                          {r.mappedDisplay ? (
                            <p className={styles.muted}>
                              <code>{r.mappedDisplay}</code>
                            </p>
                          ) : null}
                        </td>
                        <td>
                          <code>{r.valueKind}</code>
                          {r.temporalKind ? (
                            <p className={styles.muted}>{r.temporalKind}</p>
                          ) : null}
                        </td>
                        <td>
                          <p>
                            Semantic: {Math.round(r.semanticConfidence * 100)}%
                          </p>
                          <p>
                            Patch: {Math.round(r.patchConfidence * 100)}%
                          </p>
                          {r.confidenceReasons.length > 0 ? (
                            <p
                              className={styles.muted}
                              title={r.confidenceReasons.join(' · ')}
                            >
                              {r.confidenceReasons.slice(0, 2).join(' · ')}
                            </p>
                          ) : null}
                        </td>
                        <td>
                          {r.exactPatchSpan != null ? (
                            `«${r.exactPatchSpan}»`
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td>
                          {r.patchPreview ? (
                            <>
                              <p>
                                <span className={styles.muted}>Old:</span>{' '}
                                «{r.patchPreview.oldValue}»
                              </p>
                              <p>
                                <span className={styles.muted}>New:</span>{' '}
                                «{r.patchPreview.newValue}»
                              </p>
                              <p className={styles.muted}>
                                {r.patchPreview.beforePhrase}
                              </p>
                              <p className={styles.muted}>
                                → {r.patchPreview.afterPhrase}
                              </p>
                            </>
                          ) : r.canonicalRule ? (
                            <span className={styles.muted}>{r.canonicalRule}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td>{semanticStatusLabel(r.status, r.reason)}</td>
                        <td>{r.patchable ? 'yes' : 'no'}</td>
                        <td>
                          {r.reason ? (
                            <span className={styles.muted}>{r.reason}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappingRows.length === 0 ? (
                <p className={styles.muted}>
                  AI nie zwróciło żadnych ról semantycznych.
                </p>
              ) : null}
              {semanticMap.unresolved && semanticMap.unresolved.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <h3 className={styles.panelTitle}>
                    Nierozwiązane pola zmienne ({semanticMap.unresolved.length})
                  </h3>
                  <p className={styles.muted}>
                    Nie blokują prawidłowych siblingów — nie tworzą patchy.
                  </p>
                  <ul className={styles.muted}>
                    {semanticMap.unresolved.map((u) => (
                      <li key={`${u.providerIndex}:${u.anchorId}:${u.status}`}>
                        [{u.providerIndex}] {u.anchorId ?? '—'} ·{' '}
                        {u.semanticRole ?? '—'} · {u.status}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('upload')}
                >
                  Wstecz
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    if (!fieldConfiguration && semanticMap) {
                      const proposed = buildProposedTemplateConfiguration({
                        templateId: `lab:${sessionId}`,
                        templateVersionId: sourceMeta?.sourceHash,
                        semanticMap,
                        existing: null,
                      })
                      setFieldConfiguration(proposed)
                    }
                    setStep('configure')
                  }}
                >
                  Dalej — konfiguracja pól
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'configure' && fieldConfiguration ? (
            <section className={styles.panel}>
              <TemplateFieldConfigurationView
                configuration={fieldConfiguration}
                onChange={setFieldConfiguration}
                saving={configSaving}
                errors={configErrors}
                onSave={({ markReady, confirmedFixedProtectedIds }) => {
                  const result = validateTemplateConfigurationForSave({
                    config: fieldConfiguration,
                    markReady,
                    confirmedFixedProtectedIds,
                  })
                  setConfigErrors(result.errors)
                  setFieldConfiguration(result.config)
                  saveLabFieldConfiguration(sessionId, result.config)
                  if (!result.ok && markReady) return
                  setConfigSaving(true)
                  remapWithConfiguration(result.config)
                  setConfigSaving(false)
                  setStep(
                    analysis && analysis.missingFields.length > 0
                      ? 'missing'
                      : 'plan',
                  )
                }}
              />
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('semantic')}
                >
                  Wstecz
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'missing' && analysis ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Wymagają uzupełnienia</h2>
              <p className={styles.muted}>
                Brakujące dane klientów lub wesela wymagane do bezpiecznej
                zamiany. Dane stałe firmy ze szablonu nie pojawiają się tutaj.
              </p>
              {analysis.missingFields.length === 0 ? (
                <p className={styles.muted}>Brak brakujących pól.</p>
              ) : (
                analysis.missingFields.map((m) => {
                  const entry = manual.find((x) => x.missingId === m.missingId)
                  const resolved = isMissingFieldResolved(entry)
                  return (
                    <div key={m.missingId}>
                      <Input
                        label={m.label}
                        value={entry?.value ?? ''}
                        onChange={(e) =>
                          updateManualValue(m.missingId, e.target.value)
                        }
                      />
                      <p className={styles.muted}>
                        {m.reason} · format: {m.expectedDataType}
                        {m.affectedAnchorIds.length > 1
                          ? ` · ${m.affectedAnchorIds.length} fragmenty w dokumencie`
                          : ''}
                        {resolved ? ' · uzupełnione' : ''}
                      </p>
                      {manualErrors[m.missingId] ? (
                        <p className={styles.statusBad} role="alert">
                          {manualErrors[m.missingId]}
                        </p>
                      ) : null}
                    </div>
                  )
                })
              )}
              {generateError ? (
                <p className={styles.statusBad}>{generateError}</p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('upload')}
                >
                  Wstecz
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    goToPlanFromMissing()
                  }}
                >
                  Dalej — plan zmian
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'plan' && analysis ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Plan zmian</h2>
              <p className={styles.muted}>
                Zatwierdź lub odrzuć propozycje. AI nie stosuje zmian —
                robi to dopiero silnik deterministyczny. Wartości ręczne
                zawsze wymagają Twojej decyzji. Nierozwiązane fragmenty
                źródłowe blokują generowanie.
              </p>
              {analysis.ambiguities.filter(
                (a) =>
                  a.reason.includes('Panny lub Pana') ||
                  a.candidateFieldKeys.includes('bride.full_name') &&
                    a.candidateFieldKeys.includes('groom.full_name'),
              ).length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  {analysis.ambiguities
                    .filter(
                      (a) =>
                        a.reason.includes('Panny lub Pana') ||
                        (a.candidateFieldKeys.includes('bride.full_name') &&
                          a.candidateFieldKeys.includes('groom.full_name')),
                    )
                    .map((a) => (
                      <p
                        key={a.ambiguityId}
                        className={styles.statusBad}
                        role="status"
                      >
                        {a.reason.includes('Panny lub Pana')
                          ? a.reason
                          : 'AI nie potrafiło jednoznacznie przypisać tego fragmentu do Panny lub Pana Młodego. Wybierz właściwe pole.'}{' '}
                        <span className={styles.muted}>
                          ({a.anchorId}
                          {a.originalText
                            ? `: «${a.originalText.slice(0, 80)}»`
                            : ''}
                          )
                        </span>
                      </p>
                    ))}
                </div>
              ) : null}
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Znaczenie</th>
                      <th>Tekst we wzorze</th>
                      <th>Nowa wartość</th>
                      <th>Źródło</th>
                      <th>Pewność</th>
                      <th>Decyzja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const anchor = anchors.find(
                        (a) => a.anchorId === r.anchorId,
                      )
                      const needsSpan =
                        r.spanStatus === 'ambiguous' ||
                        r.spanStatus === 'not_found'
                      const start =
                        r.spanStart != null && r.originalText
                          ? Math.max(0, r.spanStart - 24)
                          : 0
                      const end =
                        r.spanEnd != null
                          ? Math.min(
                              anchor?.text.length ?? 0,
                              r.spanEnd + 24,
                            )
                          : 0
                      const prefixCtx =
                        anchor && r.spanStart != null
                          ? anchor.text.slice(start, r.spanStart)
                          : ''
                      const suffixCtx =
                        anchor && r.spanEnd != null
                          ? anchor.text.slice(r.spanEnd, end)
                          : ''
                      return (
                        <tr key={r.replacementId}>
                          <td>
                            {r.semanticRole}
                            {r.contextSnippet ? (
                              <p className={styles.muted}>{r.contextSnippet}</p>
                            ) : null}
                            {r.spanMessage ? (
                              <p className={styles.statusBad} role="alert">
                                {r.spanMessage}
                              </p>
                            ) : null}
                            {needsSpan && anchor ? (
                              <div style={{ marginTop: 8 }}>
                                <p className={styles.muted}>
                                  Pełny fragment dokumentu:
                                </p>
                                <p
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    fontSize: 13,
                                    margin: '4px 0 8px',
                                  }}
                                >
                                  {anchor.text}
                                </p>
                                <Input
                                  label="Dokładny tekst źródłowy do zamiany"
                                  value={spanDrafts[r.replacementId] ?? ''}
                                  onChange={(e) =>
                                    setSpanDrafts((prev) => ({
                                      ...prev,
                                      [r.replacementId]: e.target.value,
                                    }))
                                  }
                                  placeholder="Wklej dokładny podciąg z powyższego fragmentu"
                                />
                                {spanErrors[r.replacementId] ? (
                                  <p className={styles.statusBad} role="alert">
                                    {spanErrors[r.replacementId]}
                                  </p>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    resolveSpanManually(r.replacementId)
                                  }
                                >
                                  Użyj tego fragmentu
                                </Button>
                              </div>
                            ) : null}
                            {r.spanStatus === 'resolved_manual' ||
                            ((r.spanStatus === 'exact' ||
                              r.spanStatus === 'normalized_exact') &&
                              (prefixCtx || suffixCtx)) ? (
                              <p className={styles.muted}>
                                {prefixCtx ? `…${prefixCtx}` : ''}
                                <strong>{r.originalText}</strong>
                                {suffixCtx ? `${suffixCtx}…` : ''}
                              </p>
                            ) : null}
                          </td>
                          <td>
                            {needsSpan
                              ? r.aiProposedSourceText || r.originalText
                              : r.originalText}
                          </td>
                          <td>
                            {r.decision === 'unchanged' ? (
                              <span className={styles.muted}>Bez zmiany</span>
                            ) : (
                              r.proposedValue
                            )}
                          </td>
                          <td>{sourceDisplayLabel(r.source)}</td>
                          <td>
                            {r.source === 'manual' ||
                            r.spanStatus === 'resolved_manual'
                              ? 'Wymaga decyzji'
                              : needsSpan
                                ? 'Do wskazania'
                                : r.confidenceLabel}
                          </td>
                          <td>
                            {r.decision === 'unchanged' ? (
                              '—'
                            ) : needsSpan ? (
                              <span className={styles.muted}>
                                Najpierw wskaż fragment
                              </span>
                            ) : (
                              <div className={styles.actions}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    r.decision === 'approved'
                                      ? 'primary'
                                      : 'secondary'
                                  }
                                  onClick={() =>
                                    setRowDecision(r.replacementId, 'approved')
                                  }
                                >
                                  Zatwierdź
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    r.decision === 'rejected'
                                      ? 'danger'
                                      : 'ghost'
                                  }
                                  onClick={() =>
                                    setRowDecision(r.replacementId, 'rejected')
                                  }
                                >
                                  Odrzuć
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {generateError ? (
                <p className={styles.statusBad}>{generateError}</p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setStep(
                      analysis.missingFields.length > 0 ? 'missing' : 'upload',
                    )
                  }
                >
                  Wstecz
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={generating}
                  onClick={() => runPhaseCAudit('structure')}
                >
                  Kontrola struktury
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'structure' && phaseCAudit ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Kontrola zmiennych danych
              </h2>
              <p className={styles.muted}>
                Sprawdza tylko wartości zmienne między weselami: dane klientów,
                lokalizacje, pakiet i włączone pola konfiguracyjne. Dane firmy i
                klauzule prawne właściciela szablonu pozostają bez zmian.
              </p>
              <dl className={styles.kv}>
                <div>
                  <dt>Status</dt>
                  <dd
                    className={
                      phaseCAudit.structuralCompatibility.status === 'PASS'
                        ? styles.statusOk
                        : styles.statusBad
                    }
                  >
                    {phaseCAudit.structuralCompatibility.status}
                  </dd>
                </div>
                <div>
                  <dt>Konflikty zakresów</dt>
                  <dd>
                    {phaseCAudit.structuralCompatibility.patchConflicts.length}
                  </dd>
                </div>
              </dl>

              {phaseCAudit.structuralCompatibility.blockers.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3 className={styles.panelTitle}>Wymagają decyzji / uzupełnienia</h3>
                  {[
                    'locations',
                    'temporal',
                    'coverage',
                    'payment_schedule',
                    'personal_data',
                    'patch_conflicts',
                    'package',
                    'company_identity',
                  ].map((group) => {
                    const groupLabel =
                      group === 'personal_data'
                        ? 'Dane klientów'
                        : group === 'locations'
                          ? 'Lokalizacje'
                          : group === 'coverage'
                            ? 'Czas pracy pakietu'
                            : group === 'patch_conflicts'
                              ? 'Konflikty zakresów'
                              : group
                    const blockers =
                      phaseCAudit.structuralCompatibility.blockers.filter(
                        (blocker) => blocker.patchGroup === group,
                      )
                    if (blockers.length === 0) return null
                    return (
                      <div key={group} style={{ marginTop: 10 }}>
                        <strong>{groupLabel}</strong>
                        <ul className={styles.statusBad}>
                          {blockers.map((blocker, index) => (
                            <li key={`${blocker.code}:${index}`}>
                              <code>{blocker.code}</code> — {blocker.message}
                              {blocker.evidence?.[0] ? (
                                <>
                                  {' '}
                                  <span className={styles.muted}>
                                    ({blocker.evidence[0].anchorId}: «
                                    {blocker.evidence[0].sourceFragment}»)
                                  </span>
                                </>
                              ) : null}
                              {blocker.code === 'shared_location_requires_decision'
                                ? ' — Użyj jednego miejsca / Połącz lokalizacje / Edytuj szablon'
                                : blocker.manualResolutionPossible
                                  ? ' — możliwa korekta ręczna'
                                  : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {phaseCAudit.structuralCompatibility.warnings.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3 className={styles.panelTitle}>Ostrzeżenia</h3>
                  <ul className={styles.muted}>
                    {phaseCAudit.structuralCompatibility.warnings.map(
                      (warning, index) => (
                        <li key={`${warning.code}:${index}`}>
                          <code>{warning.code}</code> — {warning.message}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ) : null}

              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep('plan')}
                >
                  Wstecz do planu
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={
                    generating ||
                    phaseCAudit.structuralCompatibility.status !== 'PASS'
                  }
                  onClick={() => runPhaseCAudit('audit')}
                >
                  {phaseCAudit.structuralCompatibility.status === 'PASS'
                    ? 'Kontrola dokumentu'
                    : 'Kontrola dokumentu zablokowana'}
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'audit' && phaseCAudit ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Phase C — gotowość dokumentu
              </h2>
              <p className={styles.muted}>
                Deterministyczna walidacja prawna i językowa przed generowaniem.
                Nie jest to kolejny krok AI.
              </p>
              <dl className={styles.kv}>
                <div>
                  <dt>Document Quality</dt>
                  <dd>
                    <strong>{phaseCAudit.qualityScore}/100</strong>
                  </dd>
                </div>
                <div>
                  <dt>Final Audit</dt>
                  <dd
                    className={
                      phaseCAudit.audit === 'PASS'
                        ? styles.statusOk
                        : styles.statusBad
                    }
                  >
                    {phaseCAudit.audit}
                  </dd>
                </div>
              </dl>
              {phaseCAudit.blockers.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3 className={styles.panelTitle}>Blockers</h3>
                  <ul className={styles.statusBad}>
                    {phaseCAudit.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {phaseCAudit.warnings.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3 className={styles.panelTitle}>Ostrzeżenia</h3>
                  <ul className={styles.muted}>
                    {phaseCAudit.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {phaseCAudit.linkedPatches.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3 className={styles.panelTitle}>
                    Brakujące kwoty słownie (wymagane)
                  </h3>
                  <ul className={styles.muted}>
                    {phaseCAudit.linkedPatches.map((p) => (
                      <li key={`${p.anchorId}:${p.originalText}`}>
                        <code>{p.anchorId}</code> «{p.originalText}» → «
                        {p.proposedValue}» ({p.reason})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Patch group</th>
                      <th>Status</th>
                      <th>Members</th>
                      <th>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseCAudit.groups.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <code>{g.kind}</code>
                        </td>
                        <td>{g.status}</td>
                        <td>{g.members.length}</td>
                        <td className={styles.muted}>
                          {g.reasons.join('; ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {generateError ? (
                <p className={styles.statusBad}>{generateError}</p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('structure')}
                >
                  Wstecz do kontroli struktury
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={
                    generating ||
                    !phaseCAllowsGeneration(phaseCAudit) ||
                    !templateAllowsGeneration(fieldConfiguration)
                  }
                  onClick={() => {
                    setStep('generate')
                    void runGenerate()
                  }}
                >
                  {phaseCAllowsGeneration(phaseCAudit) &&
                  templateAllowsGeneration(fieldConfiguration)
                    ? 'Generuj DOCX'
                    : 'Generowanie zablokowane'}
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'generate' ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Generowanie</h2>
              {generating ? (
                <p className={styles.muted}>
                  Stosuję zatwierdzone poprawki deterministycznie…
                </p>
              ) : null}
              {generateError ? (
                <p className={styles.statusBad}>{generateError}</p>
              ) : null}
            </section>
          ) : null}

          {(step === 'compare' || step === 'download') && integrity ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Sprawdź wygenerowaną umowę
              </h2>
              <p
                className={
                  integrity.passed ? styles.statusOk : styles.statusBad
                }
              >
                {integrity.passed
                  ? 'Treść prawna poza zatwierdzonymi zmiennymi nie została zmieniona'
                  : 'Walidacja integralności nie przeszła — pobranie zablokowane'}
              </p>
              <dl className={styles.kv}>
                <div>
                  <dt>Zatwierdzone zmiany</dt>
                  <dd>{integrity.approvedChangeCount}</dd>
                </div>
                <div>
                  <dt>Faktyczne zmiany tekstu</dt>
                  <dd>{integrity.actualTextChangeCount}</dd>
                </div>
                <div>
                  <dt>Dodane / usunięte akapity</dt>
                  <dd>0 / 0</dd>
                </div>
                <div>
                  <dt>Zmiany struktury</dt>
                  <dd>{integrity.structuralChanges.length}</dd>
                </div>
                <div>
                  <dt>Zmiany poza zmiennymi</dt>
                  <dd>{integrity.unauthorizedTextChanges.length}</dd>
                </div>
              </dl>

              <h3 className={styles.panelTitle}>Zmiany</h3>
              <ul className={styles.muted}>
                {patches.map((p) => (
                  <li key={p.patchId}>
                    <strong>{p.canonicalFieldKey ?? 'manual'}</strong>: „
                    {p.expectedOriginalText}” → „{p.replacementText}” (
                    {p.source})
                  </li>
                ))}
              </ul>

              {integrity.unauthorizedTextChanges.length > 0 ? (
                <div>
                  <p className={styles.statusBad}>
                    Nieautoryzowane zmiany tekstu:
                  </p>
                  <ul>
                    {integrity.unauthorizedTextChanges.map((u) => (
                      <li key={u.paragraphIndex}>
                        Akapit {u.paragraphIndex}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('plan')}
                >
                  Wróć do planu
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canDownload}
                  onClick={() => {
                    if (!generatedBytes || !selectedWedding) return
                    const name = buildLabDownloadFileName({
                      bride:
                        selectedWedding.couple.partner1FirstName ||
                        selectedWedding.couple.partner1,
                      groom:
                        selectedWedding.couple.partner2FirstName ||
                        selectedWedding.couple.partner2,
                      date: selectedWedding.date,
                    })
                    downloadBytes(generatedBytes, name)
                    setStep('download')
                  }}
                >
                  Pobierz wygenerowaną umowę
                </Button>
              </div>
              <span className={styles.testDocBadge}>Dokument testowy</span>
            </section>
          ) : null}

          {import.meta.env.DEV && analysis ? (
            <details className={styles.debug}>
              <summary>Debug JSON (tylko development)</summary>
              <pre>{JSON.stringify(analysis, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </PageContainer>
    </AppLayout>
  )
}
