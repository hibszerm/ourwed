import { SystemVariableRegistry } from '@/lib/variables/registry'
import { automationVariableProvider } from '@/lib/variables/providers/AutomationProvider'
import { companyVariableProvider } from '@/lib/variables/providers/CompanyProvider'
import { crmVariableProvider } from '@/lib/variables/providers/CrmProvider'
import { invoiceVariableProvider } from '@/lib/variables/providers/InvoiceProvider'
import { packageVariableProvider } from '@/lib/variables/providers/PackageProvider'
import { questionnaireVariableProvider } from '@/lib/variables/providers/QuestionnaireProvider'
import { travelVariableProvider } from '@/lib/variables/providers/TravelProvider'
import { weddingVariableProvider } from '@/lib/variables/providers/WeddingProvider'
import type {
  VariableProvider,
  VariableResolveContext,
  VariableResolverApi,
  VariableSourceId,
} from '@/lib/variables/types'

/**
 * Default merge order (later wins for the same key):
 * questionnaire → wedding → crm → travel → package → invoice → automation → company
 *
 * Company always wins for company identity keys so drafts never keep stale copies.
 */
const DEFAULT_ORDER: VariableSourceId[] = [
  'questionnaire',
  'wedding',
  'crm',
  'travel',
  'package',
  'invoice',
  'automation',
  'company',
]

function pickValue(
  bag: Record<string, string>,
  idOrAlias: string,
): string | null {
  const def = SystemVariableRegistry.get(idOrAlias)
  if (!def) {
    const direct = bag[idOrAlias]?.trim()
    return direct || null
  }
  for (const key of SystemVariableRegistry.valueKeys(def)) {
    const v = bag[key]?.trim()
    if (v) return v
  }
  return null
}

function createVariableResolver(
  providers: VariableProvider[] = [],
): VariableResolverApi {
  const byId = new Map<VariableSourceId, VariableProvider>()

  for (const provider of providers) {
    byId.set(provider.id, provider)
  }

  async function resolveAll(
    ctx: VariableResolveContext = {},
  ): Promise<Record<string, string>> {
    const order = ctx.sources?.length
      ? DEFAULT_ORDER.filter((id) => ctx.sources!.includes(id))
      : DEFAULT_ORDER

    const out: Record<string, string> = { ...(ctx.base ?? {}) }

    for (const id of order) {
      const provider = byId.get(id)
      if (!provider) continue
      const values = await provider.resolve(ctx)
      Object.assign(out, values)
    }

    return out
  }

  return {
    register(provider: VariableProvider) {
      byId.set(provider.id, provider)
    },

    resolve: resolveAll,

    async resolveId(id, ctx = {}) {
      const def = SystemVariableRegistry.get(id)
      const providerId = def?.defaultProvider
      const sources: VariableSourceId[] | undefined =
        providerId &&
        (providerId === 'company' ||
          providerId === 'package' ||
          providerId === 'wedding' ||
          providerId === 'questionnaire' ||
          providerId === 'crm' ||
          providerId === 'travel' ||
          providerId === 'invoice' ||
          providerId === 'automation')
          ? [providerId]
          : undefined

      const bag = await resolveAll({
        ...ctx,
        sources: sources ?? ctx.sources,
      })
      return pickValue(bag, id)
    },

    async resolveIds(ids, ctx = {}) {
      const bag = await resolveAll(ctx)
      const out: Record<string, string> = {}
      for (const id of ids) {
        const value = pickValue(bag, id)
        if (value) out[id] = value
      }
      return out
    },
  }
}

/** Platform-wide resolver — register additional providers without touching document code. */
export const VariableResolver = createVariableResolver([
  questionnaireVariableProvider,
  weddingVariableProvider,
  crmVariableProvider,
  travelVariableProvider,
  packageVariableProvider,
  invoiceVariableProvider,
  automationVariableProvider,
  companyVariableProvider,
])

export { createVariableResolver }
export type { VariableResolveContext, VariableProvider, VariableSourceId }
