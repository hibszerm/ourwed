import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { documentTemplateService } from '@/lib/api/documents'
import { documentStorage } from '@/lib/api/documents/storage'
import { packageService } from '@/lib/api/packageService'
import { documentTemplateKeys } from '@/features/documents/hooks/useDocumentTemplates'
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
import styles from './SimpleContractImport.module.css'

type Phase = 'idle' | 'uploading' | 'analyzing' | 'preparing' | 'done' | 'error'

export function SimpleContractImportFlow({
  templateId,
  templateName,
  sourceFileName,
  sourceDocxPath,
  onUploadFile,
}: {
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
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const runStarted = useRef(false)

  const [phase, setPhase] = useState<Phase>(
    sourceFileName || sourceDocxPath ? 'analyzing' : 'idle',
  )
  const [fileName, setFileName] = useState(sourceFileName)
  const [docPath, setDocPath] = useState(sourceDocxPath)
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null)
  const [draft, setDraft] = useState<QuestionnaireDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (phase !== 'analyzing' && phase !== 'preparing') return
    if (runStarted.current) return
    if (phase === 'analyzing') {
      runStarted.current = true
      void runPipeline()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once when analyzing
  }, [phase])

  async function runPipeline() {
    setError(null)
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

      let packageOptions: { value: string; label: string }[] = []
      try {
        const packages = await packageService.list({ activeOnly: true })
        packageOptions = packages.map((p) => ({
          value: p.id,
          label: p.name,
        }))
      } catch {
        packageOptions = []
      }

      const next = generateQuestionnaireDraft({
        fields,
        ai: aiAnalysis,
        sourceText: structure.plainText,
        templateName,
        packageOptions,
      })
      setDraft(next)

      try {
        await documentTemplateService.update(templateId, {
          aiAnalyzedAt: new Date().toISOString(),
        })
      } catch {
        // best-effort lifecycle flag
      }

      setPhase('preparing')
      await saveQuestionnaireDraft(next, { documentTemplateId: templateId })
      await queryClient.invalidateQueries({ queryKey: ['questionnaire-templates'] })
      await queryClient.invalidateQueries({ queryKey: ['form-definitions'] })
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.all,
      })
      await queryClient.invalidateQueries({
        queryKey: ['studio-packages', 'for-contracts'],
      })

      setPhase('done')
      showToast('Gotowe.', 'success')
    } catch (err) {
      setError(
        err instanceof QuestionnaireValidationError
          ? err.message
          : getDocumentAiErrorMessage(err) ||
            (err instanceof Error ? err.message : 'Coś poszło nie tak.'),
      )
      setPhase('error')
      runStarted.current = false
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setPhase('uploading')
    try {
      const result = await onUploadFile(file)
      setFileName(result.sourceFileName)
      setDocPath(result.sourceDocxPath)
      setSourceBytes(result.sourceBytes)
      runStarted.current = false
      setPhase('analyzing')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się przesłać pliku.',
      )
      setPhase('error')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const statusCopy: Record<Phase, { title: string; body: string }> = {
    idle: {
      title: 'Prześlij umowę',
      body: 'PDF lub DOCX. OurWed przygotuje resztę.',
    },
    uploading: {
      title: 'Przesyłanie…',
      body: 'Zapisujemy Twoją umowę.',
    },
    analyzing: {
      title: 'Analizowanie umowy…',
      body: fileName ?? 'Poznajemy Twój dokument.',
    },
    preparing: {
      title: 'Przygotowywanie ankiety…',
      body: 'Jeszcze chwila.',
    },
    done: {
      title: 'Gotowe.',
      body: draft?.name
        ? `„${draft.name}” jest gotowa do użycia.`
        : 'Twoja umowa jest gotowa.',
    },
    error: {
      title: 'Wymaga uwagi',
      body: error ?? 'Coś poszło nie tak.',
    },
  }

  const copy = statusCopy[phase]
  const busy =
    phase === 'uploading' || phase === 'analyzing' || phase === 'preparing'

  return (
    <div className={styles.magic}>
      <div className={styles.magicCard} aria-live="polite">
        {busy ? (
          <LoaderCircle size={32} className={styles.spin} aria-hidden />
        ) : phase === 'done' ? (
          <CheckCircle2
            size={36}
            strokeWidth={1.5}
            className={styles.doneIcon}
            aria-hidden
          />
        ) : null}

        <h1 className={styles.magicTitle}>{copy.title}</h1>
        <p className={styles.magicBody}>{copy.body}</p>

        {phase === 'done' ? (
          <div className={styles.magicActions}>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                navigate(`/ustawienia/dokumenty/szablony/${templateId}`)
              }
            >
              Zobacz umowę
            </Button>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className={styles.magicActions}>
            <Button
              type="button"
              variant="primary"
              onClick={() => fileRef.current?.click()}
            >
              Prześlij ponownie
            </Button>
            {(fileName || docPath) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  runStarted.current = false
                  setPhase('analyzing')
                }}
              >
                Spróbuj ponownie
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                navigate(`/ustawienia/dokumenty/szablony/${templateId}`)
              }
            >
              Wróć
            </Button>
          </div>
        ) : null}

        {phase === 'idle' ? (
          <div className={styles.magicActions}>
            <Button
              type="button"
              variant="primary"
              onClick={() => fileRef.current?.click()}
            >
              Prześlij umowę
            </Button>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
