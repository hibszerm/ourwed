import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

/** Couple questionnaire answers. */
export const questionnaireVariableProvider: VariableProvider = {
  id: 'questionnaire',
  async resolve(ctx: VariableResolveContext) {
    return { ...(ctx.questionnaireAnswers ?? {}) }
  },
}
