/**
 * Presentation-neutral controller for the pre-wedding questionnaire tab.
 * Classic and Modern UIs share this hook so mutations, query keys, and
 * apply/share semantics stay one implementation.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  applyWeddingDaySyncCandidates,
  buildWeddingDaySyncCandidates,
  type WeddingDaySyncCandidate,
} from '@/features/prewedding/weddingDaySync'
import {
  buildPreweddingPublicUrl,
  clearShareToken,
  mapPreweddingShareError,
  normalizePublicTokenHash,
  preweddingShareMessage,
  readValidShareToken,
  shareTokenHashesEqual,
} from '@/features/prewedding/preweddingShareHelpers'
import { noteService } from '@/lib/api/noteService'
import {
  questionnaireTemplateService,
  weddingQuestionnaireService,
} from '@/lib/api/preweddingQuestionnaireService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { devErrorArgs } from '@/lib/debug/devConsole'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import {
  isPreWeddingSubmittedStatus,
  type PreWeddingAnswerValue,
  type WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { Wedding } from '@/types/wedding'

function shareValidationKey(
  questionnaireId: string,
  hash: string | null | undefined,
): string {
  return `${questionnaireId}:${normalizePublicTokenHash(hash) ?? ''}`
}

type TrustedShare = {
  questionnaireId: string
  token: string
  hash: string
}

export const PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'

export function progressLabel(answered: number, total: number): string {
  if (total === 0) return ''
  return `${answered} z ${total} wymaganych odpowiedzi`
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  if (!ok) throw new Error('clipboard_failed')
}

type TemplateRow = Awaited<ReturnType<typeof questionnaireTemplateService.listActive>>[number]

export function usePreWeddingQuestionnaireWorkspace(
  wedding: Wedding,
  onWeddingSynced?: (wedding: Wedding) => void,
) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const navigate = useNavigate()
  const { requirePro } = useProAccessGate()
  const [preparing, setPreparing] = useState(false)
  const [templateSelectOpen, setTemplateSelectOpen] = useState(false)
  const [selectableTemplates, setSelectableTemplates] = useState<TemplateRow[]>(
    [],
  )
  const [noTemplates, setNoTemplates] = useState(false)
  const [sharePending, setSharePending] = useState<'generate' | 'share' | null>(
    null,
  )
  const [trustedShare, setTrustedShare] = useState<TrustedShare | null>(null)
  const [validatedFor, setValidatedFor] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState<string | null>(null)

  const { data: questionnaire, isLoading } = useQuery({
    queryKey: [PREWEDDING_QUERY_KEY, wedding.id],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(wedding.id),
  })

  const { data: response } = useQuery({
    queryKey: ['prewedding-response', questionnaire?.id],
    queryFn: () =>
      questionnaire
        ? weddingQuestionnaireService.getResponse(questionnaire.id)
        : null,
    enabled: Boolean(
      questionnaire &&
        ['submitted', 'reopened', 'in_progress', 'opened'].includes(
          questionnaire.status,
        ),
    ),
  })

  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', wedding.id],
    queryFn: () => noteService.listByWeddingId(wedding.id),
    enabled: Boolean(wedding.id),
  })

  useEffect(() => {
    const questionnaireId = questionnaire?.id
    if (!questionnaireId) return
    const key = shareValidationKey(
      questionnaireId,
      questionnaire?.publicTokenHash,
    )
    let cancelled = false
    void readValidShareToken(
      questionnaireId,
      questionnaire?.publicTokenHash,
    ).then((valid) => {
      if (cancelled) return
      const normalized = normalizePublicTokenHash(questionnaire?.publicTokenHash)
      setTrustedShare(
        valid && normalized
          ? { questionnaireId, token: valid, hash: normalized }
          : null,
      )
      setValidatedFor(key)
    })
    return () => {
      cancelled = true
    }
  }, [
    questionnaire?.id,
    questionnaire?.publicTokenHash,
    questionnaire?.hasPublicToken,
    questionnaire?.updatedAt,
  ])

  const answers = useMemo(
    () => (response?.answers ?? {}) as Record<string, PreWeddingAnswerValue>,
    [response?.answers],
  )

  const candidates = useMemo(() => {
    if (!questionnaire || Object.keys(answers).length === 0) return []
    if (!isPreWeddingSubmittedStatus(questionnaire.status)) {
      return []
    }
    return buildWeddingDaySyncCandidates({
      questionnaire,
      answers,
      wedding,
      places,
      notes,
    })
  }, [questionnaire, answers, wedding, places, notes])

  const syncResetKey = `${questionnaire?.id ?? ''}:${questionnaire?.submittedAt ?? ''}`
  const [selectionResetKey, setSelectionResetKey] = useState(syncResetKey)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set())
  const [selectionSeeded, setSelectionSeeded] = useState(false)

  if (syncResetKey !== selectionResetKey) {
    setSelectionResetKey(syncResetKey)
    setSelectedIds(new Set())
    setAppliedIds(new Set())
    setSelectionSeeded(false)
    setApplySuccess(null)
  }

  if (!selectionSeeded && candidates.length > 0) {
    setSelectionSeeded(true)
    setSelectedIds(
      new Set(candidates.filter((c) => c.defaultSelected).map((c) => c.id)),
    )
  }

  function setQuestionnaireCache(next: WeddingQuestionnaire) {
    queryClient.setQueryData([PREWEDDING_QUERY_KEY, wedding.id], next)
  }

  async function invalidateRelated() {
    await queryClient.invalidateQueries({
      queryKey: [PREWEDDING_QUERY_KEY, wedding.id],
    })
    void queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'weddings',
    })
    void queryClient.invalidateQueries({ queryKey: ['timeline', wedding.id] })
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runApply(
    selected: WeddingDaySyncCandidate[],
    opts?: { confirm?: boolean },
  ) {
    if (!requirePro(undefined, { actionKey: 'apply_questionnaire_responses' })) {
      return
    }
    if (!questionnaire || selected.length === 0) return
    const replacesValid = selected.some(
      (c) =>
        !c.currentIsPlaceholder &&
        Boolean(c.currentDisplay.trim()) &&
        !c.incomingPoorer,
    )
    if (
      opts?.confirm !== false &&
      (selected.length > 1 || replacesValid) &&
      !window.confirm(
        'Zastosować wybrane dane z ankiety?\n\nDane Dnia ślubu i zlecenia zostaną zaktualizowane. Istniejące wartości zostaną zastąpione tylko dla wybranych pozycji.',
      )
    ) {
      return
    }

    setApplying(true)
    setApplyError(null)
    setApplySuccess(null)
    try {
      const result = await applyWeddingDaySyncCandidates({
        weddingId: wedding.id,
        wedding,
        candidates: selected,
        answers,
        queryClient,
      })
      setAppliedIds((prev) => new Set([...prev, ...selected.map((c) => c.id)]))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of selected) next.delete(c.id)
        return next
      })
      onWeddingSynced?.(result.wedding)
      setApplySuccess(
        result.appliedLabels.length === 1
          ? `Zastosowano: ${result.appliedLabels[0]}.`
          : `Zastosowano ${result.appliedLabels.length} pól z ankiety.`,
      )
      if (result.routeNeedsRecalculation) {
        setApplySuccess((prev) =>
          `${prev ?? ''} Trasa została odświeżona po zmianie lokalizacji.`.trim(),
        )
      }
      if (
        (result.wedding.travelFeeStatus ?? 'unresolved') === 'unresolved' &&
        result.routeNeedsRecalculation
      ) {
        setApplySuccess((prev) =>
          `${prev ?? ''} Ustal koszt dojazdu w zakładce Umowa i finanse — na podstawie planu możesz sprawdzić dystans i ustalić opłatę.`.trim(),
        )
      }
    } catch (err) {
      setApplyError(
        getUserFacingErrorMessage(err, 'Nie udało się zastosować danych.'),
      )
    } finally {
      setApplying(false)
    }
  }

  async function prepareFromTemplate(
    template: Awaited<ReturnType<typeof questionnaireTemplateService.getById>>,
  ) {
    if (!template) throw new Error('Template missing')
    const created = await weddingQuestionnaireService.prepare(wedding, template)
    setQuestionnaireCache(created)
    await invalidateRelated()
    setActionSuccess('Ankieta przygotowana.')
    setTemplateSelectOpen(false)
    setNoTemplates(false)
  }

  async function handlePrepare() {
    if (!requirePro(undefined, { actionKey: 'create_questionnaire' })) return
    setPreparing(true)
    setActionError(null)
    setNoTemplates(false)
    try {
      const active = await questionnaireTemplateService.listActive('pre_wedding')
      if (active.length === 0) {
        setNoTemplates(true)
        return
      }
      if (active.length === 1) {
        await prepareFromTemplate(active[0]!)
        return
      }
      const effective = await questionnaireTemplateService.getEffectiveDefault(
        'pre_wedding',
      )
      setSelectableTemplates(active)
      setTemplateSelectOpen(true)
      void effective
    } catch (err) {
      devErrorArgs('[prewedding] prepare failed:', err)
      setActionError('Nie udało się przygotować ankiety. Spróbuj ponownie.')
    } finally {
      setPreparing(false)
    }
  }

  async function handleConfirmTemplate(templateId: string) {
    if (!requirePro(undefined, { actionKey: 'create_questionnaire' })) return
    setPreparing(true)
    setActionError(null)
    try {
      const template = await questionnaireTemplateService.getById(templateId)
      if (!template || template.isArchived || template.type !== 'pre_wedding') {
        throw new Error('Invalid template')
      }
      await prepareFromTemplate(template)
    } catch (err) {
      devErrorArgs('[prewedding] prepare from select failed:', err)
      setActionError('Nie udało się przygotować ankiety. Spróbuj ponownie.')
    } finally {
      setPreparing(false)
    }
  }

  async function runShareFlow(mode: 'generate' | 'share', rotate = false) {
    if (
      !requirePro(undefined, {
        actionKey: rotate
          ? 'rotate_questionnaire_token'
          : 'generate_questionnaire_link',
      })
    ) {
      return
    }
    if (!questionnaire || sharePending) return
    setSharePending(mode)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await weddingQuestionnaireService.ensureShareLink(
        questionnaire.id,
        wedding.id,
        { rotate },
      )
      setQuestionnaireCache(result.questionnaire)
      const normalized = normalizePublicTokenHash(
        result.questionnaire.publicTokenHash,
      )
      setTrustedShare(
        normalized
          ? {
              questionnaireId: result.questionnaire.id,
              token: result.token,
              hash: normalized,
            }
          : null,
      )
      setValidatedFor(
        shareValidationKey(
          result.questionnaire.id,
          result.questionnaire.publicTokenHash,
        ),
      )
      setShareOpen(true)
      setActionSuccess(
        result.rotated
          ? 'Link wygenerowany. Możesz go skopiować i udostępnić parze.'
          : 'Link gotowy do udostępnienia.',
      )
      await invalidateRelated()
    } catch (err) {
      devErrorArgs('[prewedding] share failed:', err)
      setActionError(mapPreweddingShareError(err))
    } finally {
      setSharePending(null)
    }
  }

  async function handleCopyLink() {
    if (!questionnaire) return
    const valid = await readValidShareToken(
      questionnaire.id,
      questionnaire.publicTokenHash,
    )
    if (!valid) {
      setTrustedShare(null)
      return
    }
    try {
      await copyText(buildPreweddingPublicUrl(valid))
      setCopied('link')
      setActionError(null)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      devErrorArgs('[prewedding] copy link failed:', err)
      setActionError('Nie udało się skopiować linku.')
    }
  }

  async function handleCopyMessage() {
    if (!questionnaire) return
    const valid = await readValidShareToken(
      questionnaire.id,
      questionnaire.publicTokenHash,
    )
    if (!valid) {
      setTrustedShare(null)
      return
    }
    const url = buildPreweddingPublicUrl(valid)
    try {
      await copyText(preweddingShareMessage(questionnaire.title, url))
      setCopied('message')
      setActionError(null)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      devErrorArgs('[prewedding] copy message failed:', err)
      setActionError('Nie udało się skopiować wiadomości.')
    }
  }

  async function handleRotateLink(options?: { skipBrowserConfirm?: boolean }) {
    if (!requirePro(undefined, { actionKey: 'rotate_questionnaire_token' })) {
      return
    }
    if (!questionnaire) return
    if (
      !options?.skipBrowserConfirm &&
      !window.confirm(
        'Wygenerowanie nowego linku unieważni poprzedni. Kontynuować?',
      )
    ) {
      return
    }
    clearShareToken(questionnaire.id)
    setTrustedShare(null)
    setValidatedFor(null)
    await runShareFlow('generate', true)
  }

  async function handleUpgradeLayout() {
    if (!requirePro(undefined, { actionKey: 'edit_questionnaire' })) return
    if (!questionnaire) return
    if (
      !window.confirm(
        'Zaktualizować układ ankiety do chronologicznego flow dnia ślubu? Działa tylko gdy nie ma jeszcze odpowiedzi.',
      )
    ) {
      return
    }
    setActionError(null)
    try {
      const next = await weddingQuestionnaireService.upgradeEmptyDraftToDefaultV2(
        questionnaire.id,
      )
      setQuestionnaireCache(next)
      await invalidateRelated()
      setActionSuccess('Układ ankiety zaktualizowany.')
    } catch (err) {
      devErrorArgs('[prewedding] upgrade failed:', err)
      setActionError(
        getUserFacingErrorMessage(
          err,
          'Nie udało się zaktualizować układu ankiety.',
        ),
      )
    }
  }

  const currentValidationKey = questionnaire
    ? shareValidationKey(questionnaire.id, questionnaire.publicTokenHash)
    : null
  const shareTokenReady = Boolean(
    currentValidationKey && validatedFor === currentValidationKey,
  )
  const token =
    trustedShare &&
    questionnaire &&
    trustedShare.questionnaireId === questionnaire.id &&
    shareTokenHashesEqual(trustedShare.hash, questionnaire.publicTokenHash)
      ? trustedShare.token
      : null
  const formUrl = token ? buildPreweddingPublicUrl(token) : null
  const canShare =
    questionnaire?.status === 'draft' ||
    questionnaire?.status === 'ready' ||
    questionnaire?.status === 'sent' ||
    questionnaire?.status === 'opened' ||
    questionnaire?.status === 'in_progress'
  const isSubmitted = questionnaire
    ? isPreWeddingSubmittedStatus(questionnaire.status)
    : false
  const showSharePanel =
    shareOpen ||
    Boolean(formUrl) ||
    Boolean(questionnaire?.hasPublicToken) ||
    questionnaire?.status === 'ready' ||
    questionnaire?.status === 'draft' ||
    isSubmitted
  const pendingCandidates = candidates.filter((c) => !appliedIds.has(c.id))
  const hasAnswers = Object.keys(answers).length > 0
  const showAnswers =
    Boolean(questionnaire) &&
    hasAnswers &&
    (isSubmitted ||
      questionnaire?.status === 'in_progress' ||
      questionnaire?.status === 'opened')

  return {
    wedding,
    navigate,
    isLoading,
    questionnaire,
    response,
    answers,
    candidates,
    pendingCandidates,
    hasAnswers,
    showAnswers,
    preparing,
    templateSelectOpen,
    setTemplateSelectOpen,
    selectableTemplates,
    noTemplates,
    sharePending,
    token,
    formUrl,
    shareTokenReady,
    shareOpen,
    copied,
    actionError,
    actionSuccess,
    applying,
    applyError,
    applySuccess,
    selectedIds,
    appliedIds,
    canShare,
    isSubmitted,
    showSharePanel,
    handlePrepare,
    handleConfirmTemplate,
    runShareFlow,
    handleCopyLink,
    handleCopyMessage,
    handleRotateLink,
    handleUpgradeLayout,
    toggleCandidate,
    runApply,
  }
}
