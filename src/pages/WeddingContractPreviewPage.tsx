import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CircleCheck,
  Download,
  RefreshCw,
} from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { GeneratedWeddingContractService } from '@/features/documents/template'
import {
  ContractPdfActions,
  ContractReadyPreview,
} from '@/features/documents/contract-experience'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import styles from './WeddingContractPreviewPage.module.css'

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', ' o')
}

export function WeddingContractPreviewPage() {
  const { weddingId = '', contractId = '' } = useParams<{
    weddingId: string
    contractId: string
  }>()
  const navigate = useNavigate()
  const { data: wedding } = useWedding(weddingId)
  const { data: contract, isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contract', weddingId, contractId],
    queryFn: () =>
      GeneratedWeddingContractService.getForWedding(weddingId, contractId),
    enabled: Boolean(weddingId && contractId),
  })

  const latestDocx = useMemo(
    () =>
      contract?.artifacts
        .filter((item) => item.format === 'docx')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0],
    [contract],
  )
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
        <PageContainer>
          <p>Ładowanie umowy…</p>
        </PageContainer>
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

  const version = contract.generationVersion ?? 1
  const updatedLabel = formatUpdatedAt(contract.updatedAt)

  return (
    <AppLayout>
      <PageContainer width="wide" className={styles.page}>
        <header className={styles.shell}>
          <Link className={styles.back} to={`/sluby/${wedding.id}`}>
            <ArrowLeft
              className={styles.backIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            Wróć do ślubu
          </Link>

          <div className={styles.identity}>
            <div className={styles.identityTop}>
              <p className={styles.eyebrow}>Umowa</p>
              <span className={styles.status} data-testid="contract-preview-status">
                <CircleCheck
                  className={styles.statusIcon}
                  size={14}
                  strokeWidth={1.85}
                  aria-hidden
                />
                Gotowa do pobrania
              </span>
            </div>
            <h1 className={styles.title}>{contract.draft.title}</h1>
            <p className={styles.meta}>
              Wersja {version} · zaktualizowano {updatedLabel}
            </p>
          </div>

          <div className={styles.actions}>
            <div className={styles.downloadRow}>
              <Button
                type="button"
                variant="primary"
                onClick={() => void download('docx')}
              >
                <Download
                  className={styles.actionIcon}
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                />
                Pobierz DOCX
              </Button>
              <ContractPdfActions
                compact
                withIcon
                docxBytes={docxBytes}
                fileName={`${contract.draft.title || 'umowa'}.docx`}
                weddingId={wedding.id}
                documentId={contract.draft.id}
              />
            </div>
            <button
              type="button"
              className={styles.workflowAction}
              onClick={() => navigate(`/sluby/${wedding.id}/umowa/generuj`)}
            >
              <RefreshCw
                className={styles.actionIcon}
                size={15}
                strokeWidth={1.75}
                aria-hidden
              />
              Wygeneruj ponownie
            </button>
          </div>
        </header>

        {docxLoading ? <p className={styles.muted}>Ładowanie dokumentu…</p> : null}
        {docxFailed ? (
          <p role="alert" className={styles.error}>
            Nie udało się pobrać pliku DOCX.{' '}
            <button type="button" onClick={() => void refetchDocx()}>
              Spróbuj ponownie
            </button>
          </p>
        ) : null}

        <ContractReadyPreview
          chrome="document"
          fileName={`${contract.draft.title || 'umowa'}.docx`}
          docxBytes={docxBytes}
          weddingId={wedding.id}
          documentId={contract.draft.id}
        />
      </PageContainer>
    </AppLayout>
  )
}
