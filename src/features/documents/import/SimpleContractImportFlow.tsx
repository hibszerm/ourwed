import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, LoaderCircle, Upload } from 'lucide-react'
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

type Phase = 'upload' | 'analyzing' | 'checklist' | 'success'

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

  const [phase, setPhase] = useState<Phase>(
    sourceFileName || sourceDocxPath ? 'analyzing' : 'upload',
  )
  const [fileName, setFileName] = useState(sourceFileName)
  const [docPath, setDocPath] = useState(sourceDocxPath)
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null)
  const [draft, setDraft] = useState<QuestionnaireDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const analysisStarted = useRef(false)

  useEffect(() => {
    if (phase !== 'analyzing') return
    if (analysisStarted.current) return
    analysisStarted.current = true
    void runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when entering analyzing
  }, [phase])

  async function runAnalysis() {
    setError(null)
    setPhase('analyzing')
    try {
      let bytes = sourceBytes
      if (!bytes) {
        const path = docPath
        if (!path) {
          throw new Error('Brak pliku. Prześlij kontrakt, aby kontynuować.')
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
        await queryClient.invalidateQueries({
          queryKey: documentTemplateKeys.all,
        })
      } catch {
        // Lifecycle flag is best-effort; analysis UI can continue.
      }
      setPhase('checklist')
    } catch (err) {
      setError(getDocumentAiErrorMessage(err))
      setPhase('upload')
      analysisStarted.current = false
    }
  }

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const result = await onUploadFile(file)
      setFileName(result.sourceFileName)
      setDocPath(result.sourceDocxPath)
      setSourceBytes(result.sourceBytes)
      analysisStarted.current = false
      setPhase('analyzing')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się przesłać pliku.',
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function toggleAsk(questionId: string, ask: boolean) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        questions: prev.questions.map((q) =>
          q.id === questionId ? { ...q, enabled: ask } : q,
        ),
      }
    })
  }

  async function handleCreate() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await saveQuestionnaireDraft(draft, { documentTemplateId: templateId })
      await queryClient.invalidateQueries({ queryKey: ['questionnaire-templates'] })
      await queryClient.invalidateQueries({ queryKey: ['form-definitions'] })
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.all,
      })
      showToast('Typ ankiety został utworzony.', 'success')
      setPhase('success')
    } catch (err) {
      setError(
        err instanceof QuestionnaireValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się utworzyć typu ankiety.',
      )
    } finally {
      setSaving(false)
    }
  }

  const askCount = draft?.questions.filter((q) => q.enabled).length ?? 0
  const totalAskable = draft?.questions.length ?? 0

  return (
    <div className={styles.flow}>
      <header className={styles.header}>
        <Link
          to={`/ustawienia/dokumenty/szablony/${templateId}`}
          className={styles.back}
        >
          ← Wróć do szablonu
        </Link>
        <p className={styles.eyebrow}>Szablony dokumentów</p>
        <h1 className={styles.title}>{templateName}</h1>
      </header>

      {phase === 'upload' && (
        <section className={styles.panel}>
          <div className={styles.uploadHero}>
            <FileText size={36} strokeWidth={1.4} aria-hidden />
            <h2 className={styles.panelTitle}>Prześlij kontrakt</h2>
            <p className={styles.panelBody}>
              OurWed przeanalizuje dokument, wykryje informacje do zebrania od
              pary i przygotuje typ ankiety. Formaty: DOCX i PDF.
            </p>
            {fileName && (
              <p className={styles.fileName}>Obecny plik: {fileName}</p>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
                {uploading ? 'Przesyłanie…' : 'Prześlij kontrakt'}
              </Button>
              {fileName && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => {
                    analysisStarted.current = false
                    setPhase('analyzing')
                  }}
                >
                  Analizuj ponownie
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {phase === 'analyzing' && (
        <section className={styles.panel} aria-live="polite">
          <div className={styles.analyzing}>
            <LoaderCircle size={28} className={styles.spin} aria-hidden />
            <h2 className={styles.panelTitle}>Analizujemy Twój dokument…</h2>
            <p className={styles.panelBody}>
              {fileName
                ? `Plik: ${fileName}`
                : 'AI wykrywa informacje potrzebne do umowy.'}
            </p>
          </div>
        </section>
      )}

      {phase === 'checklist' && draft && (
        <section className={styles.panel}>
          <div className={styles.resultHero}>
            <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
            <h2 className={styles.panelTitle}>
              Kontrakt przeanalizowany pomyślnie
            </h2>
            <p className={styles.panelBody}>
              Znaleźliśmy{' '}
              <strong>{totalAskable}</strong>{' '}
              {totalAskable === 1
                ? 'informację'
                : totalAskable < 5
                  ? 'informacje'
                  : 'informacji'}
              , które możesz zbierać od klientów przed wygenerowaniem tej umowy.
              {draft.suggestedPackageLabel
                ? ` Sugerowany pakiet: ${draft.suggestedPackageLabel}.`
                : ''}
            </p>
          </div>

          <label className={styles.nameField}>
            Nazwa typu ankiety
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, name: e.target.value } : prev,
                )
              }
            />
          </label>

          <h3 className={styles.listTitle}>
            O co pytać klientów?
          </h3>
          <p className={styles.listHint}>
            Zaznacz informacje, które para ma podać w ankiecie. Finanse i dane
            studia domyślnie pomijamy.
          </p>

          <ul className={styles.checkList}>
            {[...draft.questions]
              .sort((a, b) => a.order - b.order)
              .map((q) => (
                <li key={q.id} className={styles.checkItem}>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={q.enabled}
                      onChange={(e) => toggleAsk(q.id, e.target.checked)}
                    />
                    <span className={styles.checkTitle}>{q.title}</span>
                  </label>
                  <span className={styles.checkAsk}>
                    {q.enabled ? 'Pytaj klientów' : 'Nie pytaj'}
                  </span>
                </li>
              ))}
          </ul>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              disabled={saving || askCount === 0 || !draft.name.trim()}
              onClick={() => void handleCreate()}
            >
              {saving ? 'Tworzenie…' : 'Utwórz ankietę'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                analysisStarted.current = false
                setPhase('analyzing')
              }}
            >
              Analizuj ponownie
            </Button>
          </div>
        </section>
      )}

      {phase === 'success' && (
        <section className={styles.panel}>
          <div className={styles.resultHero}>
            <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
            <h2 className={styles.panelTitle}>Typ ankiety został utworzony</h2>
            <p className={styles.panelBody}>
              „{draft?.name}” jest dostępny przy „Generuj ankietę” w module
              Ankiety — obok „Dane do umowy” i innych typów.
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              onClick={() => navigate('/ankiety')}
            >
              Przejdź do ankiet
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate(`/ustawienia/dokumenty/szablony/${templateId}`)
              }
            >
              Wróć do szablonu
            </Button>
          </div>
        </section>
      )}

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
