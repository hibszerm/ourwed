import { formatPolishPostalAddress } from './formatPolishPostalAddress.ts'

/** Resolve old split wedding rows and canonical free-form contract addresses. */
export function resolveEffectiveContractAddress(input: {
  address?: string | null
  postalCode?: string | null
  city?: string | null
}): string {
  const address = input.address ?? ''
  if (!input.postalCode?.trim() && !input.city?.trim()) return address
  return formatPolishPostalAddress({
    fullAddress: address,
    postalCode: input.postalCode,
    city: input.city,
  })
}
