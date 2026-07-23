import { SystemVariableRegistry } from '@/lib/variables/registry'

/** Look up a value under canonical id, legacy key, or aliases. */
export function lookupResolvedValue(
  bag: Record<string, string>,
  registryKey: string,
): string {
  const def = SystemVariableRegistry.get(registryKey)
  if (def) {
    for (const key of SystemVariableRegistry.valueKeys(def)) {
      const v = bag[key]?.trim()
      if (v) return v
    }
  }
  return bag[registryKey]?.trim() ?? ''
}
