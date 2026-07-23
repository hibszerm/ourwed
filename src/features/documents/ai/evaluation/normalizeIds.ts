/**
 * Normalize variable IDs to primary registry snake_case for fair comparison.
 */

import { getPackageVariableDef } from '@/features/documents/registry/packageVariables'
import { SystemVariableRegistry } from '@/lib/variables/registry'

export function normalizeEvalId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const system = SystemVariableRegistry.get(trimmed)
  if (system) return system.id

  const pkg = getPackageVariableDef(trimmed)
  if (pkg) {
    // Prefer primary package id (not alias row)
    const primary = SystemVariableRegistry.get(pkg.registryKey)
    if (primary) return primary.id
    return pkg.id
  }

  return trimmed
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function normalizeIdList(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = normalizeEvalId(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out.sort()
}
