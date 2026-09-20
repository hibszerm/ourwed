/**
 * CG7.3 — template representation vs CRM truth.
 *
 * CRM may know a fact without the customer contract representing it.
 * Expectations must derive from grounded template evidence.
 */

import type { TransformDocumentBlock } from '../types'

export type RepresentedConcepts = {
  party: boolean
  preparationLocation: boolean
  ceremonyLocation: boolean
  receptionLocation: boolean
  weddingDate: boolean
  totalPrice: boolean
  deposit: boolean
  remaining: boolean
  customerAddress: boolean
  customerPhone: boolean
  contractExecutionDate: boolean
}

const FINANCE_NEIGHBORHOOD =
  /wynagrodzen|honorarium|zadatek|zaliczk|rezerwacyjn|pozostał|cena|kwot|płatn|rozliczen|rat[ay]|fee|deposit|balance|brutto|netto|zł|wartość|wpłacono|do zapłaty/i

function isFinanceNeighborhood(text: string): boolean {
  return FINANCE_NEIGHBORHOOD.test(text)
}

function countPlnAmounts(text: string): number {
  return (text.match(/\d[\d\s\u00a0]*\s*zł/gi) ?? []).length
}

/**
 * Detect which commercial/wedding concepts the SOURCE template represents.
 * Structural / lexical stems already used by finance/location QA — not fixture labels.
 */
export function detectRepresentedConcepts(
  blocks: TransformDocumentBlock[],
  input?: {
    hasPartyEvidence?: boolean
    hasPrepEvidence?: boolean
    hasCeremonyEvidence?: boolean
    hasReceptionEvidence?: boolean
  },
): RepresentedConcepts {
  const joined = blocks.map((b) => b.text).join('\n')
  const financeBlocks = blocks.filter((b) => isFinanceNeighborhood(b.text))

  const party =
    Boolean(input?.hasPartyEvidence) ||
    /PLACEHOLDER_STRONY/i.test(joined) ||
    /Zamawiając\w*\s+są|Klientami\s+są|Klientem\s+jest|zwan\w*\s+dalej\s+[„"]?(Zamawiając|Parą\s+Młod|Klient)/i.test(
      joined,
    )

  const preparationLocation = Boolean(input?.hasPrepEvidence)
  const ceremonyLocation = Boolean(input?.hasCeremonyEvidence)
  const receptionLocation = Boolean(input?.hasReceptionEvidence)

  const weddingDate =
    blocks.some(
      (b) =>
        b.tableContext?.ownershipFamily === 'wedding_date' ||
        /data wydarzenia|data ślubu|termin wydarzenia/i.test(
          b.tableContext?.rowLabelText ?? '',
        ),
    ) || /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(joined)

  const totalPrice = financeBlocks.some((b) => countPlnAmounts(b.text) >= 1)

  const deposit = financeBlocks.some((b) =>
    /zadatek|zaliczk|rezerwacyjn|PLACEHOLDER_ZADATEK|wpłacono/i.test(b.text),
  )
  const remaining = financeBlocks.some((b) =>
    /pozostał|PLACEHOLDER_RESTA|do zapłaty|saldo/i.test(b.text),
  )

  const customerAddress =
    /zam\.\s*|zamieszk|adres(?:\s+korespondencyjny)?\s*:/i.test(joined) ||
    blocks.some(
      (b) =>
        b.tableContext?.ownershipFamily === 'customer' &&
        /ul\.|al\.|os\./i.test(b.text),
    )

  // Require explicit phone labeling — bank account digit groups are not phones.
  const customerPhone =
    (/\b(?:tel\.?|telefon)\b/i.test(joined) ||
      (/\+48\s*\d{3}/.test(joined) &&
        !/\brachunek|konto|nr\s+\d{2}\s+\d{4}/i.test(joined))) &&
    (party ||
      blocks.some((b) => b.tableContext?.ownershipFamily === 'customer'))

  const contractExecutionDate =
    /PLACEHOLDER_DATA|zawarta\s+w\s+dniu|data\s+zawarcia|data\s+podpisania/i.test(
      joined,
    )

  return {
    party,
    preparationLocation,
    ceremonyLocation,
    receptionLocation,
    weddingDate,
    totalPrice,
    deposit,
    remaining,
    customerAddress,
    customerPhone,
    contractExecutionDate,
  }
}

/** True when a finance block already expresses a multi-amount payment structure. */
export function financeBlockHasExistingPaymentStructure(text: string): boolean {
  return countPlnAmounts(text) >= 2
}
