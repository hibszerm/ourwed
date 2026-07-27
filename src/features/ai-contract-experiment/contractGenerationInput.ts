/**
 * Build package-/role-neutral ContractGenerationInput from wedding + package.
 * Never send the full Wedding domain object to AI.
 */

import { contractMoneyInWords } from './validation/polishContractMoneyWords'
import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { ContractGenerationInput } from './types'

function plDate(isoOrDisplay: string | null | undefined): string {
  if (!isoOrDisplay) return ''
  const raw = isoOrDisplay.trim()
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function moneyFormatted(n: number): string {
  return formatCurrency(n).replace(/\u00a0/g, ' ')
}

function clientAddress(wedding: Wedding, which: 1 | 2): string | undefined {
  const c = wedding.couple
  if (which === 1) {
    const parts = [c.partner1Address, c.partner1PostalCode, c.partner1City]
      .map((p) => p?.trim())
      .filter(Boolean)
    return parts.length ? parts.join(', ') : undefined
  }
  const parts = [c.partner2Address, c.partner2PostalCode, c.partner2City]
    .map((p) => p?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : undefined
}

export function buildContractGenerationInput(input: {
  wedding: Wedding
  package: Pick<StudioPackage, 'id' | 'name'>
  currentDate?: string
}): ContractGenerationInput {
  const { wedding, package: pkg } = input
  const commercial = getWeddingCommercialSummary(wedding)
  const contractValue = Math.round(commercial.contractValue ?? 0)
  const depositAmount = Math.round(commercial.agreedDeposit ?? 0)
  const remainingAmount = Math.max(
    0,
    Math.round(commercial.remainingAfterDeposit ?? contractValue - depositAmount),
  )

  const c = wedding.couple
  const clients: ContractGenerationInput['clients'] = []
  if (c.partner1?.trim()) {
    clients.push({
      id: 'client-1',
      firstName: (c.partner1FirstName ?? c.partner1.split(/\s+/)[0] ?? '').trim(),
      lastName: (
        c.partner1LastName ??
        c.partner1.split(/\s+/).slice(1).join(' ')
      ).trim(),
      fullName: c.partner1.trim(),
      address: clientAddress(wedding, 1),
      phone: c.partner1Phone?.trim() || c.phone?.trim() || undefined,
    })
  }
  if (c.partner2?.trim()) {
    clients.push({
      id: 'client-2',
      firstName: (c.partner2FirstName ?? c.partner2.split(/\s+/)[0] ?? '').trim(),
      lastName: (
        c.partner2LastName ??
        c.partner2.split(/\s+/).slice(1).join(' ')
      ).trim(),
      fullName: c.partner2.trim(),
      address: clientAddress(wedding, 2),
      phone: c.partner2Phone?.trim() || undefined,
    })
  }

  const payments: ContractGenerationInput['finances']['payments'] = (
    wedding.payments ?? []
  ).map((p) => ({
    id: p.id,
    label: p.label,
    amount: p.amount,
    amountFormatted: moneyFormatted(p.amount),
    dueDate: p.dueDate ? plDate(p.dueDate) : undefined,
    type: p.type,
    paid: p.paid,
  }))

  if (payments.length === 0) {
    if (depositAmount > 0) {
      payments.push({
        id: 'deposit',
        label: 'Zadatek',
        amount: depositAmount,
        amountFormatted: moneyFormatted(depositAmount),
        type: 'deposit',
        paid: commercial.depositPaid > 0,
      })
    }
    if (remainingAmount > 0) {
      payments.push({
        id: 'remaining',
        label: 'Pozostała kwota',
        amount: remainingAmount,
        amountFormatted: moneyFormatted(remainingAmount),
        type: 'final',
        paid: false,
      })
    }
  }

  const today = input.currentDate ?? plDate(new Date().toISOString())

  return {
    currentDate: today,
    weddingDate: plDate(wedding.date),
    clients,
    locations: {
      preparation: wedding.preparationLocation?.trim() || undefined,
      ceremony: wedding.ceremonyLocation?.trim() || undefined,
      reception: wedding.receptionLocation?.trim() || undefined,
    },
    finances: {
      contractValue,
      contractValueFormatted: moneyFormatted(contractValue),
      contractValueWords: contractMoneyInWords(contractValue),
      depositAmount,
      depositAmountFormatted: moneyFormatted(depositAmount),
      depositAmountWords: contractMoneyInWords(depositAmount),
      remainingAmount,
      remainingAmountFormatted: moneyFormatted(remainingAmount),
      remainingAmountWords: contractMoneyInWords(remainingAmount),
      payments,
    },
    package: {
      id: pkg.id,
      name: pkg.name,
    },
  }
}
