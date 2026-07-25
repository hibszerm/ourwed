import { useCallback, useState } from 'react'
import {
  WEDDING_DETAIL_VIEW_STORAGE_KEY,
  type WeddingDetailViewMode,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'

function parseMode(raw: string | null): WeddingDetailViewMode {
  if (raw === 'v1' || raw === 'v2') return raw
  return 'v1'
}

function readStoredMode(): WeddingDetailViewMode {
  try {
    return parseMode(localStorage.getItem(WEDDING_DETAIL_VIEW_STORAGE_KEY))
  } catch {
    return 'v1'
  }
}

function writeStoredMode(mode: WeddingDetailViewMode) {
  try {
    localStorage.setItem(WEDDING_DETAIL_VIEW_STORAGE_KEY, mode)
  } catch {
    // Ignore quota / private mode.
  }
}

/** Persist wedding detail presentation mode in localStorage (default v1). */
export function useWeddingDetailViewMode() {
  const [viewMode, setViewModeState] = useState<WeddingDetailViewMode>(
    readStoredMode,
  )

  const setViewMode = useCallback((mode: WeddingDetailViewMode) => {
    const next = parseMode(mode)
    setViewModeState(next)
    writeStoredMode(next)
  }, [])

  return { viewMode, setViewMode }
}

export { parseMode, readStoredMode, WEDDING_DETAIL_VIEW_STORAGE_KEY }
