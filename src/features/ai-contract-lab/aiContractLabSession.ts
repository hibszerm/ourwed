import {
  AI_CONTRACT_LAB_WEDDING_STORAGE_KEY,
  getAiContractLabWeddingIdOverride,
} from '@/features/ai-contract-lab/aiContractLabFlags'

export function readStoredLabWeddingId(): string | null {
  const envId = getAiContractLabWeddingIdOverride()
  if (envId) return envId
  try {
    return localStorage.getItem(AI_CONTRACT_LAB_WEDDING_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredLabWeddingId(id: string | null) {
  try {
    if (!id) localStorage.removeItem(AI_CONTRACT_LAB_WEDDING_STORAGE_KEY)
    else localStorage.setItem(AI_CONTRACT_LAB_WEDDING_STORAGE_KEY, id)
  } catch {
    // ignore
  }
}

export function createLabSessionId(): string {
  return crypto.randomUUID()
}

export function buildLabDownloadFileName(input: {
  bride: string
  groom: string
  date: string
}): string {
  const safe = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/^_|_$/g, '')
  return `Umowa_AI_TEST_${safe(input.bride)}_${safe(input.groom)}_${input.date || 'data'}.docx`
}
