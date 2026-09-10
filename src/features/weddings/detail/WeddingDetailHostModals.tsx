import { AddPaymentModal } from '@/features/weddings/actions/AddPaymentModal'
import { AddNoteModal } from '@/features/weddings/actions/AddNoteModal'
import { GenerateContractModal } from '@/features/weddings/actions/GenerateContractModal'
import { MissingContractDataDialog } from '@/features/weddings/actions/MissingContractDataDialog'
import { ClientCollectionMissingDialog } from '@/features/weddings/detail/editing/ClientCollectionMissingDialog'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import { DiscardChangesDialog } from '@/features/weddings/detail/editing/DiscardChangesDialog'
import type { useWeddingDetailHost } from '@/features/weddings/detail/useWeddingDetailHost'

type Host = ReturnType<typeof useWeddingDetailHost>

/**
 * Shared Wedding Detail overlay stack. Classic and Modern pages both use it.
 * Does not change Classic V2 chrome.
 *
 * Existing-wedding contract-data questionnaire send is intentionally not
 * exposed here (Path A = manual completion). Lead generate remains on Ankiety.
 * `weddingActionsService.sendQuestionnaire` stays for compatibility.
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
    openClientCollectionSection,
  } = host

  if (!wedding) return null

  return (
    <>
      <DiscardChangesDialog
        open={discardOpen}
        onStay={() => setDiscardOpen(false)}
        onDiscard={cancelEdit}
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
      <ClientCollectionMissingDialog
        open={modal?.type === 'client_collection'}
        wedding={wedding}
        onClose={closeModal}
        onCorrect={openClientCollectionSection}
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
