import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

/** Travel / dojazd fields (future: distance, overnight). */
export const travelVariableProvider: VariableProvider = {
  id: 'travel',
  async resolve(ctx: VariableResolveContext) {
    return { ...(ctx.travelValues ?? {}) }
  },
}
