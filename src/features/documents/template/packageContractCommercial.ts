/**
 * Package-contract commercial precedence:
 * wedding-specific negotiated values win; package catalog is fallback only.
 */

import { isPresentMoney } from '@/lib/utils/contractCommercialVariables'

export function resolvePackageContractMoneyAmount(input: {
  weddingValue: number | null | undefined
  packageDefault: number | null | undefined
}): number | null {
  if (isPresentMoney(input.weddingValue)) return input.weddingValue
  if (isPresentMoney(input.packageDefault)) return input.packageDefault
  return null
}

export function resolvePackageContractValue(input: {
  weddingPrice: number | null | undefined
  packageDefaultPrice: number | null | undefined
}): number | null {
  return resolvePackageContractMoneyAmount({
    weddingValue: input.weddingPrice,
    packageDefault: input.packageDefaultPrice,
  })
}

export function resolvePackageContractDeposit(input: {
  weddingDeposit: number | null | undefined
  packageDefaultDeposit: number | null | undefined
}): number | null {
  return resolvePackageContractMoneyAmount({
    weddingValue: input.weddingDeposit,
    packageDefault: input.packageDefaultDeposit,
  })
}

export function remainingAfterDeposit(
  contractValue: number,
  deposit: number,
): number {
  return Math.max(0, Math.round(contractValue) - Math.round(deposit))
}
