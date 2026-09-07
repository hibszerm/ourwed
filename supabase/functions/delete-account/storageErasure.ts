/**
 * Production-safe Storage prefix erasure for document-files/{userId}/...
 *
 * Strategy (no offset-while-mutating):
 *   list batch at offset 0 → delete files in batch → re-list same prefix → repeat
 * Folders are erased recursively. Pagination offset is used only in read-only
 * final verification (and a rare read-only sweep when a page is folder-only and full).
 *
 * Shared by the Edge Function and local unit tests (no Deno-only imports).
 */

export const STORAGE_BUCKET = 'document-files'
export const STORAGE_LIST_LIMIT = 1000
export const STORAGE_REMOVE_CHUNK = 100
export const STORAGE_MAX_DEPTH = 32
export const STORAGE_MAX_ITERATIONS = 20_000
export const STORAGE_MAX_OBJECTS = 100_000

export type StorageListEntry = {
  name: string
  /** Supabase: null/undefined means folder placeholder */
  id?: string | null
}

export type StorageListResult = {
  entries: StorageListEntry[]
  notFound?: boolean
  error?: string
}

export type StorageRemoveResult = {
  error?: string
}

export interface StorageErasureAdapter {
  list(
    prefix: string,
    opts: { limit: number; offset: number },
  ): Promise<StorageListResult>
  remove(paths: string[]): Promise<StorageRemoveResult>
}

export class StorageErasureError extends Error {
  readonly code = 'STORAGE_ERASURE_FAILED' as const
  constructor(message: string) {
    super(message)
    this.name = 'StorageErasureError'
  }
}

export function assertUserOwnedPrefix(userId: string, path: string): boolean {
  return path === userId || path.startsWith(`${userId}/`)
}

export function isValidUserId(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    userId,
  )
}

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name
}

function isFolderEntry(entry: StorageListEntry): boolean {
  return entry.id == null
}

function isMissingError(message: string | undefined): boolean {
  if (!message) return false
  return /not found|does not exist/i.test(message)
}

async function removePaths(
  adapter: StorageErasureAdapter,
  userId: string,
  paths: string[],
): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_CHUNK) {
    const slice = paths.slice(i, i + STORAGE_REMOVE_CHUNK)
    for (const p of slice) {
      if (!assertUserOwnedPrefix(userId, p)) {
        throw new StorageErasureError('storage_prefix_escape')
      }
    }
    const result = await adapter.remove(slice)
    if (result.error && !isMissingError(result.error)) {
      throw new StorageErasureError(`storage_remove_failed:${result.error}`)
    }
    removed += slice.length
  }
  return removed
}

/**
 * Recursively erase every object under exact userId prefix.
 * Auth deletion must NOT run unless this resolves without throw
 * and final verification finds zero files.
 */
export async function eraseStoragePrefixUntilEmpty(
  adapter: StorageErasureAdapter,
  userId: string,
  limits?: {
    maxDepth?: number
    maxIterations?: number
    maxObjects?: number
  },
): Promise<{ deletedObjects: number; iterations: number }> {
  if (!isValidUserId(userId)) {
    throw new StorageErasureError('invalid_user_id')
  }

  const maxDepth = limits?.maxDepth ?? STORAGE_MAX_DEPTH
  const maxIterations = limits?.maxIterations ?? STORAGE_MAX_ITERATIONS
  const maxObjects = limits?.maxObjects ?? STORAGE_MAX_OBJECTS

  let deletedObjects = 0
  let iterations = 0

  async function eraseDir(prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      throw new StorageErasureError('storage_max_depth')
    }
    if (!assertUserOwnedPrefix(userId, prefix)) {
      throw new StorageErasureError('storage_prefix_escape')
    }

    for (;;) {
      iterations += 1
      if (iterations > maxIterations) {
        throw new StorageErasureError('storage_max_iterations')
      }

      // ALWAYS offset 0 while mutating — never advance offset across deletes.
      const page = await adapter.list(prefix, {
        limit: STORAGE_LIST_LIMIT,
        offset: 0,
      })
      if (page.error && !page.notFound && !isMissingError(page.error)) {
        throw new StorageErasureError(`storage_list_failed:${page.error}`)
      }
      if (page.notFound || isMissingError(page.error) || page.entries.length === 0) {
        return
      }

      const files: string[] = []
      const folders: string[] = []
      for (const entry of page.entries) {
        if (!entry?.name) continue
        const path = joinPath(prefix, entry.name)
        if (!assertUserOwnedPrefix(userId, path)) {
          throw new StorageErasureError('storage_prefix_escape')
        }
        if (isFolderEntry(entry)) folders.push(path)
        else files.push(path)
      }

      if (files.length > 0) {
        deletedObjects += await removePaths(adapter, userId, files)
        if (deletedObjects > maxObjects) {
          throw new StorageErasureError('storage_max_objects')
        }
        // Re-list same prefix at offset 0 (do not increment offset).
        continue
      }

      // No files on this page — recurse into folder prefixes, then re-list.
      for (const folder of folders) {
        await eraseDir(folder, depth + 1)
      }

      if (folders.length === 0) {
        return
      }

      // Read-only sweep only when a full page was folder-only: there may be
      // additional siblings beyond the first 1000 that must not be skipped.
      if (page.entries.length >= STORAGE_LIST_LIMIT) {
        let offset = STORAGE_LIST_LIMIT
        let deletedInSweep = 0
        for (;;) {
          iterations += 1
          if (iterations > maxIterations) {
            throw new StorageErasureError('storage_max_iterations')
          }
          const more = await adapter.list(prefix, {
            limit: STORAGE_LIST_LIMIT,
            offset,
          })
          if (more.error && !more.notFound && !isMissingError(more.error)) {
            throw new StorageErasureError(`storage_list_failed:${more.error}`)
          }
          if (
            more.notFound ||
            isMissingError(more.error) ||
            more.entries.length === 0
          ) {
            break
          }
          const sweepFiles: string[] = []
          const sweepFolders: string[] = []
          for (const entry of more.entries) {
            if (!entry?.name) continue
            const path = joinPath(prefix, entry.name)
            if (!assertUserOwnedPrefix(userId, path)) {
              throw new StorageErasureError('storage_prefix_escape')
            }
            if (isFolderEntry(entry)) sweepFolders.push(path)
            else sweepFiles.push(path)
          }
          if (sweepFiles.length > 0) {
            const n = await removePaths(adapter, userId, sweepFiles)
            deletedInSweep += n
            deletedObjects += n
            if (deletedObjects > maxObjects) {
              throw new StorageErasureError('storage_max_objects')
            }
            // Mutation happened — abandon offset walk; resume offset-0 loop.
            break
          }
          for (const folder of sweepFolders) {
            await eraseDir(folder, depth + 1)
          }
          if (more.entries.length < STORAGE_LIST_LIMIT) break
          offset += more.entries.length
        }
        if (deletedInSweep > 0) {
          continue
        }
      }

      // Folder markers only (or cleaned) — treat prefix as empty of objects.
      return
    }
  }

  await eraseDir(userId, 0)
  await assertPrefixHasNoFiles(adapter, userId, maxIterations)

  return { deletedObjects, iterations }
}

/**
 * Read-only verification: BFS + offset pagination (safe because no deletes).
 * Any remaining file → STORAGE_ERASURE_FAILED.
 */
export async function assertPrefixHasNoFiles(
  adapter: StorageErasureAdapter,
  userId: string,
  maxIterations = STORAGE_MAX_ITERATIONS,
): Promise<void> {
  if (!assertUserOwnedPrefix(userId, userId)) {
    throw new StorageErasureError('storage_prefix_escape')
  }

  const queue: string[] = [userId]
  const seen = new Set<string>()
  let iterations = 0

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current)) continue
    seen.add(current)

    let offset = 0
    for (;;) {
      iterations += 1
      if (iterations > maxIterations) {
        throw new StorageErasureError('storage_verify_max_iterations')
      }
      const page = await adapter.list(current, {
        limit: STORAGE_LIST_LIMIT,
        offset,
      })
      if (page.error && !page.notFound && !isMissingError(page.error)) {
        throw new StorageErasureError(`storage_verify_list_failed:${page.error}`)
      }
      if (page.notFound || isMissingError(page.error) || page.entries.length === 0) {
        break
      }
      for (const entry of page.entries) {
        if (!entry?.name) continue
        const path = joinPath(current, entry.name)
        if (!assertUserOwnedPrefix(userId, path)) {
          throw new StorageErasureError('storage_prefix_escape')
        }
        if (isFolderEntry(entry)) {
          queue.push(path)
        } else {
          throw new StorageErasureError('storage_verify_not_empty')
        }
      }
      if (page.entries.length < STORAGE_LIST_LIMIT) break
      offset += page.entries.length
    }
  }
}
