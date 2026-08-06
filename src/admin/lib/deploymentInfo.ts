import { resolveAdminMount } from '@/admin/config'

/**
 * Deployment metadata available to the SPA.
 * Vercel server env (VERCEL_*) is not readable in the browser unless injected at build.
 * We only surface values that are actually present — never invent SHA/time.
 */
export type AdminDeploymentInfo = {
  environmentLabel: string
  shortSha: string | null
  branch: string | null
  host: string | null
  mode: string
}

function readOptional(name: string): string | null {
  try {
    const env = import.meta.env as Record<string, string | undefined> | undefined
    const value = env?.[name]?.trim()
    return value || null
  } catch {
    return null
  }
}

export function getAdminDeploymentInfo(): AdminDeploymentInfo {
  const mount = resolveAdminMount()
  const sha =
    readOptional('VITE_VERCEL_GIT_COMMIT_SHA') ||
    readOptional('VITE_GIT_COMMIT_SHA')
  const branch =
    readOptional('VITE_VERCEL_GIT_COMMIT_REF') ||
    readOptional('VITE_GIT_COMMIT_REF')
  const host =
    typeof window !== 'undefined' ? window.location.host : null

  let mode = 'unknown'
  try {
    mode = import.meta.env?.MODE ?? 'unknown'
  } catch {
    /* import.meta.env unavailable outside Vite */
  }

  return {
    environmentLabel: mount.environment === 'local' ? 'Local' : 'Produkcja',
    shortSha: sha ? sha.slice(0, 7) : null,
    branch,
    host,
    mode,
  }
}
