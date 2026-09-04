import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import { GeneratedWeddingContractService } from '@/features/documents/template'
import { ContractReadyPreview } from '@/features/documents/contract-experience'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import styles from './WeddingContractPreviewPage.module.css'

export function WeddingContractPreviewPage() {
  const { weddingId = '', contractId = '' } = useParams<{
    weddingId: string
    contractId: string
  }>()
  const navigate = useNavigate()
  const { data: wedding } = useWedding(weddingId)
  const { data: templates = [] } = useDocumentTemplates()
  const { data: contract, isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contract', weddingId, contractId],
    queryFn: () => GeneratedWeddingContractService.getForWedding(weddingId, contractId),
    enabled: Boolean(weddingId && contractId),
  })

  const latestDocx = useMemo(
    () =>
      contract?.artifacts
        .filter((item) => item.format === 'docx')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0],
    [contract],
  )
  const template = templates.find((item) => item.id === contract?.templateId)

  const {
    data: docxBytes = null,
    isLoading: docxLoading,
    isError: docxFailed,
    refetch: refetchDocx,
  } = useQuery({
    queryKey: [
      'generated-wedding-contract-docx-bytes',
      weddingId,
      contractId,
      latestDocx?.id,
    ],
    queryFn: () =>
      GeneratedWeddingContractService.downloadArtifact(
        weddingId,
        contractId,
        'docx',
      ),
    enabled: Boolean(latestDocx),
  })

  async function download(format: 'docx' | 'pdf') {
    const url = await GeneratedWeddingContractService.getArtifactDownloadUrl(
      weddingId,
      contractId,
      format,
    )
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (isLoading) {
    return (
      <AppLayout title="Umowa">
        <PageContainer><p>Ładowanie umowy…</p></PageContainer>
      </AppLayout>
    )
  }

  if (isError || !contract || !wedding) {
    return (
      <AppLayout title="Umowa">
        <PageContainer>
          <p role="alert">Nie znaleziono zapisanego artefaktu umowy.</p>
          <Link to={`/sluby/${weddingId}`}>Wróć do ślubu</Link>
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide" className={styles.page}>
        <header className={styles.header}>
          <div>
            <Link to={`/sluby/${wedding.id}`}>← Wróć do ślubu</Link>
            <p className={styles.eyebrow}>Umowa · Gotowa</p>
            <h1>{contract.draft.title}</h1>
            <p>
              {getWeddingDisplayName(wedding)} ·{' '}
              {template?.name ?? 'Szablon archiwalny'} · wersja{' '}
              {contract.generationVersion ?? 1}
            </p>
            <p>
              Zaktualizowano{' '}
              {new Intl.DateTimeFormat('pl-PL', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(contract.updatedAt))}
            </p>
          </div>
          <span className={styles.status}>Gotowa do pobrania</span>
        </header>

        {docxLoading ? <p>Ładowanie dokumentu…</p> : null}
        {docxFailed ? (
          <p role="alert">
            Nie udało się pobrać pliku DOCX.{' '}
            <button type="button" onClick={() => void refetchDocx()}>
              Spróbuj ponownie
            </button>
          </p>
        ) : null}
        <ContractReadyPreview
          fileName={`${contract.draft.title || 'umowa'}.docx`}
          docxBytes={docxBytes}
          onDownloadDocx={() => void download('docx')}
          onRegenerate={() =>
            navigate(`/sluby/${wedding.id}/umowa/generuj`)
          }
          weddingId={wedding.id}
          documentId={contract.draft.id}
        />
      </PageContainer>
    </AppLayout>
  )
}
