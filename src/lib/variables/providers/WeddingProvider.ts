import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

/** Wedding / project fields — caller may pass weddingValues when already loaded. */
export const weddingVariableProvider: VariableProvider = {
  id: 'wedding',
  async resolve(ctx: VariableResolveContext) {
    return { ...(ctx.weddingValues ?? {}) }
  },
}
