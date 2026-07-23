import type { VariableProvider } from '@/lib/variables/types'

/** Automation-injected fields — reserved for future workflows. */
export const automationVariableProvider: VariableProvider = {
  id: 'automation',
  async resolve() {
    return {}
  },
}
