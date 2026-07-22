import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { documentClauseService } from '@/lib/api/documents'

export const documentClauseKeys = {
  all: ['document-clauses'] as const,
  list: (userId: string | null) =>
    [...documentClauseKeys.all, 'list', userId] as const,
}

export function useDocumentClauses() {
  const userId = useStudioAuthId() ?? null
  return useQuery({
    queryKey: documentClauseKeys.list(userId),
    queryFn: () => documentClauseService.list(),
    enabled: Boolean(userId),
  })
}
