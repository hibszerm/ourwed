import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mapPdfRenderErrorForUser } from '@/features/documents/pdf/pdfRenderErrors'
import { CURRENT_BRIEF_GENERATOR_VERSION } from '@/features/wedding-brief/briefGeneratorVersion'
import {
  briefPrimaryLabel,
  deriveWeddingBriefUiKind,
  type WeddingBriefBusyOperation,
  type WeddingBriefUiKind,
} from '@/features/wedding-brief/briefActionCopy'
import {
  BRIEF_SOURCE_CACHE_ROOTS,
  weddingBriefQueryKey,
  weddingBriefSourceQueryKey,
} from '@/features/wedding-brief/briefQueryKeys'
import { buildCanonicalBriefSource } from '@/features/wedding-brief/canonicalBriefSource'
import { hashCanonicalBriefSource } from '@/features/wedding-brief/hashCanonicalBriefSource'
import { loadWeddingBriefSourceSnapshot } from '@/features/wedding-brief/loadWeddingBriefSource'
import {
  BriefSourceChangedError,
  runWeddingBriefPrimaryAction,
} from '@/features/wedding-brief/downloadWeddingBriefPdf'
import { weddingBriefService } from '@/lib/api/weddingBriefService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function useWeddingBriefAction(
  weddingId: string,
  variant: 'default' | 'cockpit' = 'default',
) {
  const queryClient = useQueryClient()
  const inFlightRef = useRef(false)
  const [busyOperation, setBusyOperation] =
    useState<WeddingBriefBusyOperation>(null)
  const [error, setError] = useState<string | null>(null)

  const metadataQuery = useQuery({
    queryKey: weddingBriefQueryKey(weddingId),
    queryFn: () => weddingBriefService.getCurrent(weddingId),
    enabled: Boolean(weddingId),
  })

  const sourceQuery = useQuery({
    queryKey: weddingBriefSourceQueryKey(weddingId),
    queryFn: async () => {
      const snapshot = await loadWeddingBriefSourceSnapshot(weddingId)
      return hashCanonicalBriefSource(buildCanonicalBriefSource(snapshot))
    },
    enabled: Boolean(weddingId),
    staleTime: 0,
  })

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const root = event.query.queryKey[0]
      if (typeof root !== 'string') return
      if (root === 'wedding-brief' || root === 'wedding-brief-source') return
      if (!BRIEF_SOURCE_CACHE_ROOTS.has(root)) return
      void queryClient.invalidateQueries({
        queryKey: weddingBriefSourceQueryKey(weddingId),
      })
    })
  }, [queryClient, weddingId])

  const kind: WeddingBriefUiKind = deriveWeddingBriefUiKind({
    hasBrief: Boolean(metadataQuery.data),
    storedSourceHash: metadataQuery.data?.sourceHash,
    storedGeneratorVersion: metadataQuery.data?.generatorVersion,
    currentSourceHash: sourceQuery.data,
    currentGeneratorVersion: CURRENT_BRIEF_GENERATOR_VERSION,
    busyOperation,
  })

  async function run() {
    if (inFlightRef.current) return
    if (kind === 'GENERATING' || kind === 'DOWNLOADING') return
    const mode: 'download' | 'generate' =
      kind === 'CURRENT_BRIEF' ? 'download' : 'generate'
    inFlightRef.current = true
    setBusyOperation(mode)
    setError(null)
    try {
      await runWeddingBriefPrimaryAction(weddingId, mode)
      if (mode === 'generate') {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: weddingBriefQueryKey(weddingId),
          }),
          queryClient.invalidateQueries({
            queryKey: weddingBriefSourceQueryKey(weddingId),
          }),
        ])
      }
    } catch (e) {
      if (e instanceof BriefSourceChangedError) {
        await queryClient.invalidateQueries({
          queryKey: weddingBriefSourceQueryKey(weddingId),
        })
        return
      }
      const raw = getUserFacingErrorMessage(e, '')
      setError(mapPdfRenderErrorForUser(raw))
    } finally {
      inFlightRef.current = false
      setBusyOperation(null)
    }
  }

  return {
    kind,
    label: briefPrimaryLabel(kind, variant),
    error,
    run,
    busy: busyOperation != null,
  }
}
