import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { SessionPaymentModal } from '@/features/sessions/actions/SessionPaymentModal'
import { useDeleteSession } from '@/features/sessions/hooks/useDeleteSession'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { ModernSessionDetailHeader } from '@/features/sessions/modern-detail/ModernSessionDetailHeader'
import { ModernSessionOverview } from '@/features/sessions/modern-detail/ModernSessionOverview'
import { buildSessionCommercialSummary } from '@/features/sessions/presentation/sessionFinance'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { Session } from '@/types/session'
import type { SessionPayment } from '@/types/sessionPayment'
import styles from './ModernSessionDetailWorkspace.module.css'

interface Props {
  session: Session
}

/**
 * Modern Session Detail workspace — single-page overview (no tabs).
 * Payment/delete semantics mirror Classic SessionDetailPage.
 */
export function ModernSessionDetailWorkspace({ session }: Props) {
  const sessionId = session.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const linkedId = session.linkedWeddingId ?? ''
  const { data: linkedWedding } = useWedding(linkedId)
  const deleteSession = useDeleteSession()
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editedPayment, setEditedPayment] = useState<SessionPayment | null>(null)
  const [addAsDeposit, setAddAsDeposit] = useState(true)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  const finance = buildSessionCommercialSummary(
    session.totalPrice,
    session.depositAmount,
    session.payments,
  )
  const hasPaidDeposit = hasPaidDepositPayment(session.payments)

  async function handleDelete() {
    try {
      await deleteSession.mutateAsync(session.id)
      showToast('Sesja została usunięta', 'success')
      navigate('/sesje')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć sesji'),
        'error',
      )
    }
  }

  function openAddPayment() {
    if (!requirePro()) return
    setEditedPayment(null)
    setAddAsDeposit(!hasPaidDeposit)
    setPaymentModalOpen(true)
  }

  function openEditPayment(payment: SessionPayment) {
    if (!requirePro()) return
    setEditedPayment(payment)
    setPaymentModalOpen(true)
  }

  async function handleDeletePayment(payment: SessionPayment) {
    if (!requirePro()) return
    if (!window.confirm(`Usunąć wpłatę „${payment.label}”?`)) return
    setDeletingPaymentId(payment.id)
    try {
      await sessionPaymentService.delete(payment.id)
      showToast(
        payment.type === 'deposit'
          ? 'Zaliczka została usunięta.'
          : 'Wpłata została usunięta.',
        'success',
      )
      try {
        await invalidateSessionFinanceQueries(queryClient, sessionId)
      } catch {
        // Delete already succeeded.
      }
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć wpłaty.'),
        'error',
      )
    } finally {
      setDeletingPaymentId(null)
    }
  }

  return (
    <div
      className={styles.workspace}
      data-testid="modern-session-detail-workspace"
    >
      <ModernSessionDetailHeader
        session={session}
        onDelete={handleDelete}
        deleting={deleteSession.isPending}
      />
      <div className={styles.body}>
        <ModernSessionOverview
          session={session}
          finance={finance}
          hasPaidDeposit={hasPaidDeposit}
          linkedWedding={linkedWedding}
          deletingPaymentId={deletingPaymentId}
          onAddPayment={openAddPayment}
          onEditPayment={openEditPayment}
          onDeletePayment={(p) => void handleDeletePayment(p)}
        />
      </div>
      {paymentModalOpen ? (
        <SessionPaymentModal
          key={
            editedPayment?.id ??
            `new-${addAsDeposit ? 'deposit' : 'payment'}`
          }
          open
          onClose={() => setPaymentModalOpen(false)}
          sessionId={session.id}
          payment={editedPayment}
          defaultType={
            editedPayment
              ? editedPayment.type
              : addAsDeposit
                ? 'deposit'
                : 'installment'
          }
          suggestedAmount={
            addAsDeposit && !editedPayment ? session.depositAmount : undefined
          }
        />
      ) : null}
    </div>
  )
}
