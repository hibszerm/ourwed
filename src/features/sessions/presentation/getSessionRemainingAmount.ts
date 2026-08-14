/**
 * @deprecated Import from sessionFinance — remaining is ledger-based.
 * Re-export keeps existing import paths compiling during cutover.
 */
export {
  getSessionRemainingAmount,
  getSessionRemainingToPay,
  getSessionTotalPaid,
  getSessionDepositPaid,
  buildSessionCommercialSummary,
  resolveSessionPaymentStatus,
} from '@/features/sessions/presentation/sessionFinance'
