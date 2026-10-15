import type { WorkspaceCursor, WorkspaceScope } from './workspaceTypes'

export const workspaceQueryKeys = {
  all: ['workspace'] as const,
  weddings: (scope: WorkspaceScope, cursor: WorkspaceCursor | null, limit: number) =>
    ['workspace', 'weddings', scope, cursor?.weddingDate ?? null, cursor?.weddingId ?? null, limit] as const,
}
