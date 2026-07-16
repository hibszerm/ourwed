import type { Payment } from '@/types/wedding'

/** Suma wszystkich opłaconych płatności w ramach umowy. */
export function getTotalPaid(payments: Payment[]): number {
  return payments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0)
}

/** Kwota zaliczki już wpłaconej (tylko płatności typu deposit). */
export function getDepositPaid(payments: Payment[]): number {
  return payments
    .filter((p) => p.paid && p.type === 'deposit')
    .reduce((sum, p) => sum + p.amount, 0)
}

/** Pozostała kwota do zapłaty: wartość umowy minus wpłacone płatności. */
export function getRemainingAmount(contractPrice: number, payments: Payment[]): number {
  return Math.max(0, contractPrice - getTotalPaid(payments))
}
