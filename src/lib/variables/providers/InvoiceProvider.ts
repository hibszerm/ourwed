import type { VariableProvider } from '@/lib/variables/types'

/** Invoice fields — reserved for future invoicing module. */
export const invoiceVariableProvider: VariableProvider = {
  id: 'invoice',
  async resolve() {
    return {}
  },
}
