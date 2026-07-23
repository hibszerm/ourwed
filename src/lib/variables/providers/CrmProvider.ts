import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

/** CRM-sourced fields (future: contacts, pipeline). */
export const crmVariableProvider: VariableProvider = {
  id: 'crm',
  async resolve(ctx: VariableResolveContext) {
    return { ...(ctx.crmValues ?? {}) }
  },
}
