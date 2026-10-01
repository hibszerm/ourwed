import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'

export type GenerationPartyKey = 'partner1' | 'partner2'

/** A factual value plus its application source; owner is present only when the source establishes it. */
export type ContractGenerationFact<T> = {
  value: T
  source: string
  owner?: GenerationPartyKey
}

export type ContractGenerationParty = {
  sourceKey: GenerationPartyKey
  fullName?: ContractGenerationFact<string>
  firstName?: ContractGenerationFact<string>
  lastName?: ContractGenerationFact<string>
  phone?: ContractGenerationFact<string>
  email?: ContractGenerationFact<string>
  address?: ContractGenerationFact<string>
}

/** An upstream-established relationship label for a normalized participant; it is not a source-contract role mapping. */
export type ContractGenerationParticipantAssociation = {
  participant: GenerationPartyKey
  association: ContractGenerationFact<string>
}

export type ContractGenerationInput = {
  wedding: {
    id: ContractGenerationFact<string>
    date: ContractGenerationFact<string>
    status: ContractGenerationFact<Wedding['status']>
    workflowStage: ContractGenerationFact<Wedding['workflowStage']>
  }
  parties: ContractGenerationParty[]
  participantAssociations: ContractGenerationParticipantAssociation[]
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
  /** Semantic answer fields from the submitted form; question labels/UUIDs are intentionally excluded. */
  questionnaireFields?: Record<string, unknown>
  userProvidedAnswers?: Array<{ id: string; value: string }>
  /** Explicit associations supplied by an authoritative upstream record; never inferred by this adapter. */
  participantAssociations?: readonly ContractGenerationParticipantAssociation[]
  contractRecordId?: string | null
  /** Raw canonical contract/correspondence address when available before wedding-view hydration; the application model associates it with partner1. */
  genericContractAddress?: string | null
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function answerString(value: unknown): string | undefined {
  if (typeof value === 'string') return nonBlank(value)
  return undefined
}

function addressAnswerFact(
  fields: Record<string, unknown>,
  key: string,
  owner: GenerationPartyKey,
): ContractGenerationFact<string> | undefined {
  const raw = fields[key]
  const directValue = answerString(raw)
  if (directValue) return {
    value: directValue,
    source: `form_answers.answer_json.fields.${key}`,
    owner,
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const formattedAddress = answerString((raw as Record<string, unknown>).formattedAddress)
  return formattedAddress ? {
    value: formattedAddress,
    source: `form_answers.answer_json.fields.${key}.formattedAddress`,
    owner,
  } : undefined
}

function partyFromWedding(
  wedding: Wedding,
  key: GenerationPartyKey,
  fields: Record<string, unknown>,
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
  const formAddress = addressAnswerFact(fields, `${key}.address`, key)
  const explicitModelAddress = p1 ? undefined : nonBlank(couple.partner2Address)
  const address = formAddress ?? (explicitModelAddress ? {
    value: explicitModelAddress,
    source: `wedding.couple.${key}Address`,
    owner: key,
  } : undefined)

  return {
    sourceKey: key,
    ...(fullName ? { fullName: { value: fullName, source: `wedding.couple.${key}`, owner: key } } : {}),
    ...(firstName ? { firstName: { value: firstName, source: `wedding.couple.${key}FirstName`, owner: key } } : {}),
    ...(lastName ? { lastName: { value: lastName, source: `wedding.couple.${key}LastName`, owner: key } } : {}),
    ...(phone ? { phone: { value: phone, source: phoneSource, owner: key } } : {}),
    ...(email ? { email: { value: email, source: emailSource, owner: key } } : {}),
    ...(address ? { address } : {}),
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
  const partner1FormAddress = addressAnswerFact(fields, 'partner1.address', 'partner1')
  const correspondenceAddress = nonBlank(options.genericContractAddress) ??
    (!partner1FormAddress ? nonBlank(wedding.couple.partner1Address) : undefined)
  const contractAddressFact: ContractGenerationFact<string> | undefined = correspondenceAddress ? {
    value: correspondenceAddress,
    source: options.genericContractAddress?.trim()
      ? 'public.weddings.contract_address'
      : 'wedding.couple.partner1Address (mapped from public.weddings.contract_address)',
    owner: 'partner1',
  } : undefined

  return {
    wedding: {
      id: { value: wedding.id, source: 'public.weddings.id' },
      date: { value: wedding.date, source: 'public.weddings.wedding_date' },
      status: { value: wedding.status, source: 'public.weddings.status' },
      workflowStage: { value: wedding.workflowStage, source: 'public.weddings.workflow_stage' },
    },
    parties: [
      {
        ...partyFromWedding(wedding, 'partner1', fields),
        ...(contractAddressFact ? { address: contractAddressFact } : {}),
      },
      partyFromWedding(wedding, 'partner2', fields),
    ],
    participantAssociations: (options.participantAssociations ?? []).map(({ participant, association }) => ({
      participant,
      association: { ...association },
    })),
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
      ...((key === 'partner1.address' || key.startsWith('partner1.')) ? { owner: 'partner1' as const } : {}),
      ...((key === 'partner2.address' || key.startsWith('partner2.')) ? { owner: 'partner2' as const } : {}),
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
