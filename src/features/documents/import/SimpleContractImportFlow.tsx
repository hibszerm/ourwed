import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, FileUp, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { documentTemplateService } from '@/lib/api/documents'
import { documentStorage } from '@/lib/api/documents/storage'
import { documentTemplateKeys } from '@/features/documents/hooks/useDocumentTemplates'
import { fileFormatLabel, nameFromFileName } from '@/features/documents/contractUi'
import {
  activeAiDocumentAnalyzer,
  aiAnalysisToDetectedFields,
  getDocumentAiErrorMessage,
} from '@/features/documents/ai'
import { activeDocumentStructureExtractor } from '@/features/documents/mapping/extraction'
import {
  generateQuestionnaireDraft,
  saveQuestionnaireDraft,
  QuestionnaireValidationError,
  type QuestionnaireDraft,
} from '@/features/documents/questionnaire'
import { AiAnalysisExperience } from './AiAnalysisExperience'
import {
  clearAttachedImport,
  formatFileSize,
  peekAttachedImportBytes,
  peekAttachedImportMeta,
  type AttachedImportMeta,
  type PendingNewImport,
} from './attachedImportCache'
import { ContractReviewScreen } from './ContractReviewScreen'
import {
  ImportWizardStepper,
  type WizardStepId,
} from './ImportWizardStepper'
import styles from './SimpleContractImport.module.css'

type Phase =
  | 'idle'
  | 'ready'
  | 'preparing'
  | 'uploading'
  | 'analyzing'
  | 'review'
  | 'saving'
  | 'done'
  | 'error'

const MIN_PREPARE_MS = 850

function wizardStepForPhase(phase: Phase): WizardStepId {
  switch (phase) {
    case 'idle':
    case 'ready':
    case 'preparing':
    case 'uploading':
    case 'error':
      return 'upload'
    case 'analyzing':
      return 'analysis'
    case 'review':
    case 'saving':
      return 'configure'
    case 'done':
      return 'done'
  }
}

function hasAttachedSource(
  sourceFileName: string | null,
  sourceDocxPath: string | null,
): boolean {
  return Boolean(sourceFileName || sourceDocxPath)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type CreateResult = {
  templateId: string
  sourceFileName: string
  sourceDocxPath: string | null
}

type ExistingProps = {
  mode?: 'existing'
  templateId: string
  templateName: string
  sourceFileName: string | null
  sourceDocxPath: string | null
  onUploadFile: (file: File) => Promise<{
    templateVersionId: string
    sourceFileName: string
    sourceDocxPath: string | null
    sourceBytes: ArrayBuffer
  }>
  onRenameTemplate?: (name: string) => Promise<void>
  pendingAttachment?: undefined
  onCreateTemplate?: undefined
}

type CreateProps = {
  mode: 'create'
  pendingAttachment: PendingNewImport
  templateName: string
  onCreateTemplate: (input: {
    name: string
    file: File
  }) => Promise<CreateResult>
  templateId?: undefined
  sourceFileName?: undefined
  sourceDocxPath?: undefined
  onUploadFile?: undefined
  onRenameTemplate?: undefined
}

export function SimpleContractImportFlow(props: ExistingProps | CreateProps) {
  const isCreate = props.mode === 'create'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const runStarted = useRef(false)
  const prepareStarted = useRef(false)

  const initialName = props.templateName
  const initialFileName = isCreate
    ? props.pendingAttachment.meta.fileName
    : props.sourceFileName
  const initialDocPath = isCreate ? null : props.sourceDocxPath
  const initiallyAttached = isCreate
    ? true
    : hasAttachedSource(props.sourceFileName, props.sourceDocxPath)
  const cachedMeta = isCreate
    ? props.pendingAttachment.meta
    : peekAttachedImportMeta(props.templateId)

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    isCreate ? null : props.templateId,
  )
  const [phase, setPhase] = useState<Phase>(
    isCreate ? 'preparing' : initiallyAttached ? 'ready' : 'idle',
  )
  const [fileName, setFileName] = useState<string | null>(initialFileName)
  const [docPath, setDocPath] = useState<string | null>(initialDocPath)
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(() => {
    if (isCreate) return props.pendingAttachment.bytes
    return peekAttachedImportBytes(props.templateId)
  })
  const [attachedMeta, setAttachedMeta] = useState<AttachedImportMeta | null>(
    cachedMeta,
  )
  const [nameDraft, setNameDraft] = useState(initialName)
  const [startingAnalysis, setStartingAnalysis] = useState(false)
  const [draft, setDraft] = useState<QuestionnaireDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pipelineDone, setPipelineDone] = useState(false)
  const [analysisKey, setAnalysisKey] = useState(0)
  const [contentKey, setContentKey] = useState(0)

  const draftRef = useRef<QuestionnaireDraft | null>(null)
  draftRef.current = draft
  const nameRef = useRef(nameDraft)
  nameRef.current = nameDraft
  const templateIdRef = useRef(activeTemplateId)
  templateIdRef.current = activeTemplateId

  // Create path: upload in the background while showing preparing UI.
  useEffect(() => {
    if (!isCreate || phase !== 'preparing') return
    if (prepareStarted.current) return
    prepareStarted.current = true

    void (async () => {
      const startedAt = Date.now()
      setError(null)
      try {
        const attachment = props.pendingAttachment
        const name =
          nameRef.current.trim() || nameFromFileName(attachment.file.name)
        const bytes =
          attachment.bytes ?? (await attachment.file.arrayBuffer())
        const created = await props.onCreateTemplate({
          name,
          file: attachment.file,
        })
        setActiveTemplateId(created.templateId)
        setFileName(created.sourceFileName)
        setDocPath(created.sourceDocxPath)
        setSourceBytes(bytes)
        setAttachedMeta(attachment.meta)
        setNameDraft(name)

        const elapsed = Date.now() - startedAt
        if (elapsed < MIN_PREPARE_MS) {
          await sleep(MIN_PREPARE_MS - elapsed)
        }

        runStarted.current = false
        setPipelineDone(false)
        setAnalysisKey((k) => k + 1)
        setContentKey((k) => k + 1)
        setPhase('analyzing')
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Nie udało się przygotować dokumentu.',
        )
        setPhase('error')
        prepareStarted.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for create prepare
  }, [isCreate, phase])

  useEffect(() => {
    if (phase !== 'analyzing') return
    if (runStarted.current) return
    runStarted.current = true
    if (activeTemplateId) clearAttachedImport(activeTemplateId)
    void runPipeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once when analyzing
  }, [phase])

  async function runPipeline() {
    setError(null)
    setPipelineDone(false)
    const templateId = templateIdRef.current
    if (!templateId) {
      setError('Brak szablonu. Spróbuj ponownie.')
      setPhase('error')
      runStarted.current = false
      return
    }

    try {
      setPhase('analyzing')

      let bytes = sourceBytes
      if (!bytes) {
        const path = docPath
        if (!path) {
          throw new Error('Brak pliku. Prześlij umowę, aby kontynuować.')
        }
        bytes = await documentStorage.download(path)
        setSourceBytes(bytes)
      }

      const structure = await activeDocumentStructureExtractor.extractForFile(
        bytes,
        fileName,
      )
      const aiAnalysis = await activeAiDocumentAnalyzer.analyze({
        text: structure.plainText,
        structure,
      })
      const fields = aiAnalysisToDetectedFields(aiAnalysis, structure)

      const next = generateQuestionnaireDraft({
        fields,
        ai: aiAnalysis,
        sourceText: structure.plainText,
        templateName: nameRef.current.trim() || initialName,
      })
      next.linkedPackageId = null

      setDraft(next)

      try {
        await documentTemplateService.update(templateId, {
          aiAnalyzedAt: new Date().toISOString(),
        })
        await queryClient.invalidateQueries({
          queryKey: documentTemplateKeys.all,
        })
      } catch {
        // best-effort lifecycle flag
      }

      setPipelineDone(true)
    } catch (err) {
      setError(
        getDocumentAiErrorMessage(err) ||
          (err instanceof Error ? err.message : 'Coś poszło nie tak.'),
      )
      setPhase('error')
      setPipelineDone(false)
      runStarted.current = false
    }
  }

  async function handleStartAnalysis() {
    if (isCreate) return
    const nextName = nameDraft.trim()
    if (!nextName) {
      setError('Podaj nazwę szablonu.')
      return
    }
    setError(null)
    setStartingAnalysis(true)
    try {
      if (props.onRenameTemplate && nextName !== props.templateName) {
        await props.onRenameTemplate(nextName)
      }
      runStarted.current = false
      setPipelineDone(false)
      setAnalysisKey((k) => k + 1)
      setContentKey((k) => k + 1)
      setPhase('analyzing')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się zapisać nazwy.',
      )
    } finally {
      setStartingAnalysis(false)
    }
  }

  async function handleSave() {
    if (!draft || !activeTemplateId) return
    setError(null)
    setPhase('saving')
    try {
      await saveQuestionnaireDraft(draft, {
        documentTemplateId: activeTemplateId,
      })
      await queryClient.invalidateQueries({ queryKey: ['questionnaire-templates'] })
      await queryClient.invalidateQueries({ queryKey: ['form-definitions'] })
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.all,
      })
      setPhase('done')
      showToast('Ankieta została zapisana.', 'success')
    } catch (err) {
      setError(
        err instanceof QuestionnaireValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się zapisać ankiety.',
      )
      setPhase('review')
    }
  }

  async function handleFile(file: File) {
    if (isCreate || !props.onUploadFile) return
    setError(null)
    setPhase('uploading')
    setPipelineDone(false)
    try {
      const result = await props.onUploadFile(file)
      setFileName(result.sourceFileName)
      setDocPath(result.sourceDocxPath)
      setSourceBytes(result.sourceBytes)
      setAttachedMeta({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || '',
      })
      if (!nameDraft.trim()) {
        setNameDraft(nameFromFileName(file.name) || initialName)
      }
      runStarted.current = false
      setPhase('ready')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się przesłać pliku.',
      )
      setPhase('error')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function goBack() {
    if (activeTemplateId) {
      navigate(`/ustawienia/dokumenty/szablony/${activeTemplateId}`)
      return
    }
    navigate('/ustawienia/dokumenty/szablony')
  }

  const wizardStep = wizardStepForPhase(phase)
  const fileAttached =
    isCreate || hasAttachedSource(fileName, docPath) || Boolean(attachedMeta)
  const displayFileName =
    attachedMeta?.fileName ?? fileName ?? 'Dokument'
  const displayType = fileFormatLabel(displayFileName)
  const displaySize =
    attachedMeta != null ? formatFileSize(attachedMeta.fileSize) : null

  return (
    <div className={styles.flow}>
      <ImportWizardStepper current={wizardStep} />

      {phase === 'preparing' ? (
        <div className={styles.ready} aria-live="polite" key={contentKey}>
          <div className={styles.readyInner}>
            <p className={styles.stepCaption}>Krok 1 z 4</p>
            <h1 className={styles.heroTitle}>Dodawanie dokumentu</h1>
            <p className={styles.heroBody}>
              Plik jest już wybrany. Przygotowujemy go do analizy AI.
            </p>

            <div className={styles.fileCard}>
              <div className={styles.fileCheck} aria-hidden>
                <Check size={16} strokeWidth={2.25} />
              </div>
              <div className={styles.fileMeta}>
                <p className={styles.fileName}>{displayFileName}</p>
                <p className={styles.fileDetails}>
                  {displayType}
                  {displaySize ? ` · ${displaySize}` : null}
                </p>
              </div>
            </div>

            <p className={styles.prepareStatus}>
              Przygotowujemy dokument do analizy…
            </p>
            <div
              className={styles.indeterminateTrack}
              role="progressbar"
              aria-valuetext="Przygotowywanie dokumentu"
            >
              <div className={styles.indeterminateFill} />
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'ready' && fileAttached && !isCreate ? (
        <div className={styles.ready} aria-live="polite">
          <div className={styles.readyInner}>
            <p className={styles.stepCaption}>Krok 1 z 4</p>
            <h1 className={styles.heroTitle}>Sprawdź plik przed analizą</h1>
            <p className={styles.heroBody}>
              Plik jest już dołączony. Nadaj nazwę szablonowi i uruchom analizę
              AI.
            </p>

            <div className={styles.fileCard}>
              <div className={styles.fileCheck} aria-hidden>
                <Check size={16} strokeWidth={2.25} />
              </div>
              <div className={styles.fileMeta}>
                <p className={styles.fileName}>{displayFileName}</p>
                <p className={styles.fileDetails}>
                  {displayType}
                  {displaySize ? ` · ${displaySize}` : null}
                </p>
              </div>
            </div>

            <label className={styles.nameField}>
              Nazwa szablonu
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="np. Umowa fotograficzna"
                disabled={startingAnalysis}
              />
            </label>

            {error ? <p className={styles.error}>{error}</p> : null}

            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                disabled={startingAnalysis || !nameDraft.trim()}
                onClick={() => void handleStartAnalysis()}
              >
                {startingAnalysis ? 'Przygotowywanie…' : 'Analizuj dokument'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={startingAnalysis}
                onClick={goBack}
              >
                Anuluj
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'review' && draft && activeTemplateId ? (
        <div className={styles.stageEnter}>
          <ContractReviewScreen
            templateName={nameDraft.trim() || initialName}
            draft={draft}
            saving={false}
            error={error}
            onChange={setDraft}
            onCancel={goBack}
            onSave={() => void handleSave()}
          />
        </div>
      ) : null}

      {phase === 'saving' && draft ? (
        <div className={styles.stageEnter}>
          <ContractReviewScreen
            templateName={nameDraft.trim() || initialName}
            draft={draft}
            saving
            error={error}
            onChange={setDraft}
            onCancel={() => undefined}
            onSave={() => undefined}
          />
        </div>
      ) : null}

      {phase === 'analyzing' ? (
        <div className={styles.analysisWrap} key={`analysis-${contentKey}`}>
          <p className={styles.stepCaption}>Krok 2 z 4</p>
          <AiAnalysisExperience
            key={analysisKey}
            fileName={fileName}
            pipelineDone={pipelineDone}
            onReveal={() => {
              if (draftRef.current) setPhase('review')
            }}
          />
        </div>
      ) : null}

      {phase === 'idle' ||
      phase === 'uploading' ||
      phase === 'done' ||
      phase === 'error' ? (
        <div className={styles.hero} aria-live="polite">
          <div className={styles.heroInner}>
            {phase === 'uploading' ? (
              <LoaderCircle size={22} className={styles.spin} aria-hidden />
            ) : phase === 'done' ? (
              <CheckCircle2
                size={28}
                strokeWidth={1.5}
                className={styles.doneIcon}
                aria-hidden
              />
            ) : phase === 'idle' ? (
              <FileUp
                size={22}
                strokeWidth={1.75}
                className={styles.uploadIcon}
                aria-hidden
              />
            ) : null}

            <h1 className={styles.heroTitle}>
              {phase === 'idle'
                ? 'Dołącz dokument'
                : phase === 'uploading'
                  ? 'Przesyłanie…'
                  : phase === 'done'
                    ? 'Gotowe'
                    : 'Wymaga uwagi'}
            </h1>
            <p className={styles.heroBody}>
              {phase === 'idle'
                ? 'PDF lub DOCX. Po wyborze pliku od razu przejdziesz do kreatora.'
                : phase === 'uploading'
                  ? 'Zapisujemy dokument.'
                  : phase === 'done'
                    ? draft?.name
                      ? `„${draft.name}” jest dostępna w Ankietach.`
                      : 'Twoja umowa jest gotowa.'
                    : (error ?? 'Coś poszło nie tak.')}
            </p>

            {phase === 'done' && activeTemplateId ? (
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    navigate(
                      `/ustawienia/dokumenty/szablony/${activeTemplateId}`,
                    )
                  }
                >
                  Zobacz umowę
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/ankiety')}
                >
                  Przejdź do ankiet
                </Button>
              </div>
            ) : null}

            {phase === 'error' ? (
              <div className={styles.actions}>
                {isCreate ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      prepareStarted.current = false
                      setPhase('preparing')
                    }}
                  >
                    Spróbuj ponownie
                  </Button>
                ) : fileAttached ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      runStarted.current = false
                      setPipelineDone(false)
                      setAnalysisKey((k) => k + 1)
                      setPhase('analyzing')
                    }}
                  >
                    Spróbuj ponownie
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Wybierz plik
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={goBack}>
                  Wróć
                </Button>
              </div>
            ) : null}

            {phase === 'idle' && !isCreate ? (
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => fileRef.current?.click()}
                >
                  Wybierz plik
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isCreate && !fileAttached ? (
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
      ) : null}
    </div>
  )
}
