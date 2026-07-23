import {
  companyDetailsService,
  formatCompanyAddress,
} from '@/lib/api/companyDetailsService'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

/**
 * Resolves company identity variables from Company Details only.
 * Emits canonical IDs + legacy dotted keys via the System Variable Registry.
 */
export const companyVariableProvider: VariableProvider = {
  id: 'company',

  async resolve(_ctx: VariableResolveContext) {
    const details = await companyDetailsService.get()
    if (!details) return {}

    const out: Record<string, string> = {}
    SystemVariableRegistry.emit(out, 'company_name', details.companyName)
    SystemVariableRegistry.emit(out, 'company_owner', details.ownerName)
    SystemVariableRegistry.emit(
      out,
      'company_representative',
      details.ownerName,
    )
    SystemVariableRegistry.emit(out, 'company_nip', details.nip)
    SystemVariableRegistry.emit(out, 'company_regon', details.regon)
    SystemVariableRegistry.emit(out, 'company_vat', details.vatId)
    SystemVariableRegistry.emit(
      out,
      'company_address',
      formatCompanyAddress(details),
    )
    SystemVariableRegistry.emit(out, 'company_phone', details.phone)
    SystemVariableRegistry.emit(out, 'company_email', details.email)
    SystemVariableRegistry.emit(out, 'company_website', details.website)
    SystemVariableRegistry.emit(out, 'company_instagram', details.instagram)
    SystemVariableRegistry.emit(out, 'company_facebook', details.facebook)
    SystemVariableRegistry.emit(
      out,
      'company_bank_account',
      details.bankAccount,
    )
    SystemVariableRegistry.emit(out, 'company_iban', details.iban)
    SystemVariableRegistry.emit(out, 'company_swift', details.swift)

    const logoUrl = await companyDetailsService.getPublicUrl(details.logoPath)
    const signatureUrl = await companyDetailsService.getPublicUrl(
      details.signaturePath,
    )
    const stampUrl = await companyDetailsService.getPublicUrl(details.stampPath)
    SystemVariableRegistry.emit(out, 'company_logo', logoUrl)
    SystemVariableRegistry.emit(out, 'company_signature', signatureUrl)
    SystemVariableRegistry.emit(out, 'company_stamp', stampUrl)

    return out
  },
}
