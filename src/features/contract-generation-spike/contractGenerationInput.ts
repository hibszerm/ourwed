import { getWeddingCommercialSummary } from '@/lib/utils/commercial.ts'
import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'
import { resolveEffectiveContractAddress } from '@/lib/utils/contractAddress'

export type GenerationPartyKey = 'partner1' | 'partner2'
export type ContractGenerationLocale = 'pl' | 'en'
export const DEFAULT_CONTRACT_GENERATION_LOCALE: ContractGenerationLocale = 'pl'

/** A factual value plus its application source; owner is present only when the source establishes it. */
export type ContractGenerationFact<T> = {
  value: T
  source: string
  owner?: GenerationPartyKey
  /** Explicit source semantics; address facts are never inferred to be residential. */
  semanticType?: 'contract_address' | 'residential_address' | 'correspondence_address' | 'company_address' | 'venue_address'
}

export type ContractGenerationParty = {
  sourceKey: GenerationPartyKey
  fullName?: ContractGenerationFact<string>
  firstName?: ContractGenerationFact<string>
  lastName?: ContractGenerationFact<string>
  phone?: ContractGenerationFact<string>
  email?: ContractGenerationFact<string>
}

/** An upstream-established relationship label for a normalized participant; it is not a source-contract role mapping. */
export type ContractGenerationParticipantAssociation = {
  participant: GenerationPartyKey
  association: ContractGenerationFact<string>
}

export type ContractGenerationInput = {
  locale: ContractGenerationLocale
  wedding: {
    id: ContractGenerationFact<string>
    date: ContractGenerationFact<string>
    status: ContractGenerationFact<Wedding['status']>
    workflowStage: ContractGenerationFact<Wedding['workflowStage']>
  }
  parties: ContractGenerationParty[]
  /** Address designated for the contract; intentionally has no participant owner. */
  contractAddress?: ContractGenerationFact<string>
  participantAssociations: ContractGenerationParticipantAssociation[]
  /** Run-local selection links; these are not CRM record identifiers. */
  selectedEntityBindings: Array<{ requirementId: string; optionId: string; partyKey: GenerationPartyKey }>
  commercial: {
    contractValue: ContractGenerationFact<number>
    agreedDeposit: ContractGenerationFact<number>
    totalPaid: ContractGenerationFact<number>
    remainingToPayNow: ContractGenerationFact<number>
    remainingAfterDeposit: ContractGenerationFact<number>
    currency: ContractGenerationFact<string>
    finalPaymentTerms?: ContractGenerationFact<NonNullable<Wedding['finalPaymentTerms']>>
    finalPaymentDueDate?: ContractGenerationFact<string>
    travelFeeStatus: ContractGenerationFact<NonNullable<Wedding['travelFeeStatus']>>
    travelFeeAmount: ContractGenerationFact<number>
  }
  package: {
    id?: ContractGenerationFact<string>
    name: ContractGenerationFact<string>
    items: ContractGenerationFact<Wedding['packageItems']>
  }
  extras: Array<{
    id: ContractGenerationFact<string>
    extraServiceId: ContractGenerationFact<string>
    name: ContractGenerationFact<string>
    quantity: ContractGenerationFact<number>
    price: ContractGenerationFact<number>
  }>
  locations: Array<{
    id: ContractGenerationFact<string>
    role: ContractGenerationFact<WeddingPlace['role']>
    label?: ContractGenerationFact<string>
    formattedAddress: ContractGenerationFact<string>
    placeId?: ContractGenerationFact<string>
    latitude?: ContractGenerationFact<number>
    longitude?: ContractGenerationFact<number>
  }>
  generationContext: {
    generationDate: ContractGenerationFact<string>
    contractRecordId?: ContractGenerationFact<string>
    contractStatus: ContractGenerationFact<Wedding['contract']['status']>
  }
  questionnaireAnswers: Array<ContractGenerationFact<unknown>>
  additionalAnswers: Array<{
    id: string
    value: string
    authority: 'user'
    source: string
  }>
  unownedFacts: Array<ContractGenerationFact<unknown>>
}

export type ContractGenerationInputOptions = {
  wedding: Wedding
  weddingPlaces: readonly WeddingPlace[]
  extras: readonly WeddingExtraService[]
  generationDate: string
  locale?: ContractGenerationLocale
  /** Semantic answer fields from the submitted form; question labels/UUIDs are intentionally excluded. */
  questionnaireFields?: Record<string, unknown>
  userProvidedAnswers?: Array<{ id: string; value: string }>
  /** Explicit associations supplied by an authoritative upstream record; never inferred by this adapter. */
  participantAssociations?: readonly ContractGenerationParticipantAssociation[]
  selectedEntityBindings?: readonly { requirementId: string; optionId: string; partyKey: GenerationPartyKey }[]
  contractRecordId?: string | null
  /** Resolved legacy row fallback; contract-address authority has no participant owner. */
  genericContractAddress?: string | null
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function addressAnswerFact(
  fields: Record<string, unknown>,
  key: string,
): ContractGenerationFact<string> | undefined {
  const raw = fields[key]
  const directValue = typeof raw === 'string' && raw.trim() ? raw : undefined
  if (directValue) return {
    value: directValue,
    source: `form_answers.answer_json.fields.${key}`,
    semanticType: 'contract_address',
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rawFormattedAddress = (raw as Record<string, unknown>).formattedAddress
  const formattedAddress = typeof rawFormattedAddress === 'string' && rawFormattedAddress.trim()
    ? rawFormattedAddress
    : undefined
  return formattedAddress ? {
    value: formattedAddress,
    source: `form_answers.answer_json.fields.${key}.formattedAddress`,
    semanticType: 'contract_address',
  } : undefined
}

function partyFromWedding(
  wedding: Wedding,
  key: GenerationPartyKey,
): ContractGenerationParty {
  const p1 = key === 'partner1'
  const couple = wedding.couple
  const fullName = nonBlank(p1 ? couple.partner1 : couple.partner2)
  const firstName = nonBlank(p1 ? couple.partner1FirstName : couple.partner2FirstName)
  const lastName = nonBlank(p1 ? couple.partner1LastName : couple.partner2LastName)
  const p1Phone = nonBlank(couple.partner1Phone)
  const p1Email = nonBlank(couple.partner1Email)
  const phone = p1 ? p1Phone ?? nonBlank(couple.phone) : nonBlank(couple.partner2Phone)
  const email = p1 ? p1Email ?? nonBlank(couple.email) : nonBlank(couple.partner2Email)
  const phoneSource = p1 && !p1Phone ? 'wedding.couple.phone' : `wedding.couple.${key}Phone`
  const emailSource = p1 && !p1Email ? 'wedding.couple.email' : `wedding.couple.${key}Email`
  return {
    sourceKey: key,
    ...(fullName ? { fullName: { value: fullName, source: `wedding.couple.${key}`, owner: key } } : {}),
    ...(firstName ? { firstName: { value: firstName, source: `wedding.couple.${key}FirstName`, owner: key } } : {}),
    ...(lastName ? { lastName: { value: lastName, source: `wedding.couple.${key}LastName`, owner: key } } : {}),
    ...(phone ? { phone: { value: phone, source: phoneSource, owner: key } } : {}),
    ...(email ? { email: { value: email, source: emailSource, owner: key } } : {}),
  }
}

/**
 * Build a read-only, provenance-preserving snapshot from the current hydrated
 * OurWed domain records. This function does not read DOCX content or perform IO.
 */
export function buildContractGenerationInput(
  options: ContractGenerationInputOptions,
): ContractGenerationInput {
  const { wedding } = options
  const fields = options.questionnaireFields ?? {}
  const summary = getWeddingCommercialSummary(wedding)
  const totalPaid = summary.totalPaid
  const questionnaireContractAddress = addressAnswerFact(fields, 'partner1.address') ??
    addressAnswerFact(fields, 'partner2.address')
  const rowContractAddress = [
    options.genericContractAddress,
    wedding.contractAddress,
    resolveEffectiveContractAddress({
      address: wedding.couple.partner1Address,
      postalCode: wedding.couple.partner1PostalCode,
      city: wedding.couple.partner1City,
    }),
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const contractAddressFact: ContractGenerationFact<string> | undefined = questionnaireContractAddress ??
    (rowContractAddress ? {
      value: rowContractAddress,
      source: options.genericContractAddress || wedding.contractAddress
        ? 'public.weddings.contract_address'
        : 'wedding.couple.partner1Address (mapped from public.weddings.contract_address)',
      semanticType: 'contract_address',
    } : undefined)

  return {
    locale: options.locale ?? DEFAULT_CONTRACT_GENERATION_LOCALE,
    wedding: {
      id: { value: wedding.id, source: 'public.weddings.id' },
      date: { value: wedding.date, source: 'public.weddings.wedding_date' },
      status: { value: wedding.status, source: 'public.weddings.status' },
      workflowStage: { value: wedding.workflowStage, source: 'public.weddings.workflow_stage' },
    },
    parties: [
      partyFromWedding(wedding, 'partner1'),
      partyFromWedding(wedding, 'partner2'),
    ],
    ...(contractAddressFact ? { contractAddress: contractAddressFact } : {}),
    participantAssociations: (options.participantAssociations ?? []).map(({ participant, association }) => ({
      participant,
      association: { ...association },
    })),
    selectedEntityBindings: (options.selectedEntityBindings ?? []).map((binding) => ({ ...binding })),
    commercial: {
      contractValue: { value: summary.contractValue, source: 'public.weddings.contract_value' },
      agreedDeposit: { value: summary.agreedDeposit, source: 'public.weddings.deposit_amount' },
      totalPaid: { value: totalPaid, source: 'sum(public.payments where paid)' },
      remainingToPayNow: { value: summary.remainingToPay, source: 'contractValue - totalPaid' },
      remainingAfterDeposit: { value: summary.remainingAfterDeposit, source: 'contractValue - agreedDeposit' },
      currency: { value: summary.currency, source: 'public.weddings.currency' },
      ...(summary.finalPaymentTerms ? { finalPaymentTerms: { value: summary.finalPaymentTerms, source: 'public.weddings.final_payment_terms' } } : {}),
      ...(summary.finalPaymentDueDate ? { finalPaymentDueDate: { value: summary.finalPaymentDueDate, source: 'public.weddings.final_payment_due_date' } } : {}),
      travelFeeStatus: { value: wedding.travelFeeStatus ?? 'unresolved', source: 'public.weddings.travel_fee_status' },
      travelFeeAmount: { value: wedding.travelFeeAmount ?? 0, source: 'public.weddings.travel_fee_amount' },
    },
    package: {
      ...(wedding.packageId ? { id: { value: wedding.packageId, source: 'public.weddings.package_id' } } : {}),
      name: { value: wedding.packageName, source: 'public.weddings.package_name' },
      items: { value: wedding.packageItems.map((item) => ({ ...item })), source: 'public.weddings.package_items_snapshot' },
    },
    extras: options.extras.map((extra) => {
      const snapshotName = nonBlank(extra.nameSnapshot)
      const fallbackName = nonBlank(extra.name)
      return {
        id: { value: extra.id, source: `public.wedding_extra_services.${extra.id}.id` },
        extraServiceId: { value: extra.extraServiceId, source: `public.wedding_extra_services.${extra.id}.extra_service_id` },
        name: {
          value: snapshotName ?? fallbackName ?? '',
          source: snapshotName
            ? `public.wedding_extra_services.${extra.id}.name_snapshot`
            : `extra_services.name (legacy fallback for ${extra.id})`,
        },
        quantity: { value: extra.quantity, source: `public.wedding_extra_services.${extra.id}.quantity` },
        price: { value: extra.priceSnapshot, source: `public.wedding_extra_services.${extra.id}.price_snapshot` },
      }
    }),
    locations: options.weddingPlaces.map((place) => ({
      id: { value: place.id, source: `public.wedding_places.${place.id}.id` },
      role: { value: place.role, source: `public.wedding_places.${place.id}.role` },
      ...(nonBlank(place.label) ? { label: { value: place.label!.trim(), source: `public.wedding_places.${place.id}.label` } } : {}),
      formattedAddress: { value: place.formattedAddress, source: `public.wedding_places.${place.id}.formatted_address` },
      ...(place.placeId ? { placeId: { value: place.placeId, source: `public.wedding_places.${place.id}.place_id` } } : {}),
      ...(place.latitude != null ? { latitude: { value: place.latitude, source: `public.wedding_places.${place.id}.latitude` } } : {}),
      ...(place.longitude != null ? { longitude: { value: place.longitude, source: `public.wedding_places.${place.id}.longitude` } } : {}),
    })),
    generationContext: {
      generationDate: { value: options.generationDate, source: 'generation_start' },
      ...(options.contractRecordId ? { contractRecordId: { value: options.contractRecordId, source: 'public.contracts.id' } } : {}),
      contractStatus: { value: wedding.contract.status, source: 'public.contracts.status' },
    },
    questionnaireAnswers: Object.entries(fields).map(([key, value]) => ({
      value,
      source: `form_answers.answer_json.fields.${key}`,
      ...((key.startsWith('partner1.') && key !== 'partner1.address') ? { owner: 'partner1' as const } : {}),
      ...((key.startsWith('partner2.') && key !== 'partner2.address') ? { owner: 'partner2' as const } : {}),
    })),
    additionalAnswers: (options.userProvidedAnswers ?? []).map((answer) => ({
      id: answer.id,
      value: answer.value,
      authority: 'user' as const,
      source: `userProvidedAnswers.${answer.id}`,
    })),
    unownedFacts: [],
  }
}
