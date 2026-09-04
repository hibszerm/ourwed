import { SendQuestionnaireModal } from '@/features/weddings/actions/SendQuestionnaireModal'
import { AddPaymentModal } from '@/features/weddings/actions/AddPaymentModal'
import { AddNoteModal } from '@/features/weddings/actions/AddNoteModal'
import { GenerateContractModal } from '@/features/weddings/actions/GenerateContractModal'
import { MissingContractDataDialog } from '@/features/weddings/actions/MissingContractDataDialog'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import { DiscardChangesDialog } from '@/features/weddings/detail/editing/DiscardChangesDialog'
import type { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'

type Host = ReturnType<typeof useWeddingDetailHost>

/**
 * Shared Wedding Detail overlay stack. Classic and Modern pages both use it.
 * Does not change Classic V2 chrome.
 */
export function WeddingDetailHostModals({ host }: { host: Host }) {
  const {
    wedding,
    extras,
    modal,
    missingValidation,
    discardOpen,
    setDiscardOpen,
    cancelEdit,
    closeModal,
    handleMissingDataCorrection,
    handleTravelFeeSaved,
  } = host

  if (!wedding) return null

  return (
    <>
      <DiscardChangesDialog
        open={discardOpen}
        onStay={() => setDiscardOpen(false)}
        onDiscard={cancelEdit}
      />

      <SendQuestionnaireModal
        open={modal?.type === 'questionnaire'}
        onClose={closeModal}
        wedding={wedding}
        kind={modal?.type === 'questionnaire' ? modal.kind : 'contractData'}
      />
      <AddPaymentModal
        open={modal?.type === 'payment'}
        onClose={closeModal}
        wedding={wedding}
        asDeposit={modal?.type === 'payment' ? modal.asDeposit : false}
        payment={modal?.type === 'payment' ? modal.payment : null}
      />
      <AddNoteModal
        open={modal?.type === 'note'}
        onClose={closeModal}
        wedding={wedding}
      />
      <GenerateContractModal
        open={modal?.type === 'contract'}
        onClose={closeModal}
        wedding={wedding}
      />
      <MissingContractDataDialog
        open={modal?.type === 'missing_contract_data'}
        validation={missingValidation}
        onClose={closeModal}
        onCorrect={handleMissingDataCorrection}
      />
      <TravelFeeResolveModal
        open={modal?.type === 'travel_fee'}
        wedding={wedding}
        extras={extras}
        onClose={closeModal}
        onSaved={(next) => {
          void handleTravelFeeSaved(next)
        }}
      />
    </>
  )
}
