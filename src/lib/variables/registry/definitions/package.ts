import type { SystemVariableDef } from '@/lib/variables/registry/types'

type PkgInput = {
  id: string
  label: string
  legacyKey: string
  type?: SystemVariableDef['type']
  aliases?: string[]
  sortOrder: number
  /** Couple picks package in questionnaire. */
  questionnaireAvailable?: boolean
}

function pkg(input: PkgInput): SystemVariableDef {
  return {
    id: input.id,
    label: input.label,
    category: 'package',
    source: 'package',
    type: input.type ?? 'string',
    questionnaireAvailable: input.questionnaireAvailable ?? false,
    documentAvailable: true,
    crmAvailable: false,
    defaultProvider: 'package',
    legacyKey: input.legacyKey,
    aliases: input.aliases,
    documentSection: 'package',
    documentDataSource: 'package_snapshot',
    documentValueType:
      input.type === 'money' ||
      input.type === 'number' ||
      input.type === 'boolean'
        ? input.type
        : 'string',
    sortOrder: input.sortOrder,
    questionType: input.questionnaireAvailable ? 'select' : undefined,
  }
}

/** Package catalog slots — values from selected package snapshot. */
export const PACKAGE_VARIABLES: SystemVariableDef[] = [
  pkg({
    id: 'package_name',
    label: 'Nazwa pakietu',
    legacyKey: 'package.name',
    aliases: ['package'],
    sortOrder: 310,
    questionnaireAvailable: true,
  }),
  pkg({
    id: 'package_price',
    label: 'Wartość umowy',
    legacyKey: 'package.price',
    type: 'money',
    aliases: ['contract_price', 'price'],
    sortOrder: 320,
  }),
  pkg({
    id: 'deposit_amount',
    label: 'Zadatek',
    legacyKey: 'package.deposit',
    type: 'money',
    aliases: ['deposit'],
    sortOrder: 330,
  }),
  pkg({
    id: 'deposit_type',
    label: 'Typ zadatku',
    legacyKey: 'package.depositType',
    sortOrder: 335,
  }),
  pkg({
    id: 'deposit_percent',
    label: 'Zadatek (%)',
    legacyKey: 'package.depositPercent',
    type: 'number',
    sortOrder: 336,
  }),
  pkg({
    id: 'remaining_payment',
    label: 'Pozostała płatność',
    legacyKey: 'package.remaining',
    type: 'money',
    sortOrder: 340,
  }),
  pkg({
    id: 'payment_deadline',
    label: 'Termin płatności',
    legacyKey: 'package.paymentDeadline',
    aliases: ['payment_due_days'],
    sortOrder: 350,
  }),
  pkg({
    id: 'payment_installments',
    label: 'Liczba rat',
    legacyKey: 'package.installments',
    type: 'number',
    sortOrder: 360,
  }),
  pkg({
    id: 'delivery_time',
    label: 'Termin dostawy',
    legacyKey: 'package.deliveryTime',
    aliases: ['delivery_days', 'delivery_deadline'],
    sortOrder: 370,
  }),
  pkg({
    id: 'included_services',
    label: 'Usługi w pakiecie',
    legacyKey: 'package.includedServices',
    sortOrder: 380,
  }),
  pkg({
    id: 'photographers_count',
    label: 'Liczba fotografów',
    legacyKey: 'package.photographersCount',
    type: 'number',
    sortOrder: 390,
  }),
  pkg({
    id: 'videographers_count',
    label: 'Liczba wideografów',
    legacyKey: 'package.videographersCount',
    type: 'number',
    sortOrder: 391,
  }),
  pkg({
    id: 'working_hours',
    label: 'Godziny pracy',
    legacyKey: 'package.workingHours',
    type: 'number',
    sortOrder: 392,
  }),
  pkg({
    id: 'overtime_price',
    label: 'Cena za godzinę nadliczbową',
    legacyKey: 'package.overtimePrice',
    type: 'money',
    sortOrder: 393,
  }),
  pkg({
    id: 'mileage_limit',
    label: 'Limit kilometrów',
    legacyKey: 'package.mileageLimit',
    type: 'number',
    aliases: ['included_distance'],
    sortOrder: 394,
  }),
  pkg({
    id: 'mileage_price',
    label: 'Cena za km',
    legacyKey: 'package.mileagePrice',
    type: 'money',
    sortOrder: 395,
  }),
  pkg({
    id: 'accommodation',
    label: 'Nocleg',
    legacyKey: 'package.accommodation',
    sortOrder: 396,
  }),
  pkg({
    id: 'travel_fee',
    label: 'Opłata za dojazd',
    legacyKey: 'package.travelFee',
    type: 'money',
    sortOrder: 397,
  }),
  pkg({
    id: 'album_included',
    label: 'Album w cenie',
    legacyKey: 'package.albumIncluded',
    type: 'boolean',
    sortOrder: 398,
  }),
  pkg({
    id: 'usb_included',
    label: 'Pendrive w cenie',
    legacyKey: 'package.usbIncluded',
    type: 'boolean',
    sortOrder: 399,
  }),
  pkg({
    id: 'online_gallery',
    label: 'Galeria online',
    legacyKey: 'package.onlineGallery',
    type: 'boolean',
    sortOrder: 400,
  }),
  pkg({
    id: 'engagement_session',
    label: 'Sesja narzeczeńska',
    legacyKey: 'package.engagementSession',
    type: 'boolean',
    sortOrder: 401,
  }),
  pkg({
    id: 'wedding_session',
    label: 'Sesja ślubna',
    legacyKey: 'package.weddingSession',
    type: 'boolean',
    sortOrder: 402,
  }),
  pkg({
    id: 'number_of_revisions',
    label: 'Liczba poprawek',
    legacyKey: 'package.revisions',
    type: 'number',
    sortOrder: 403,
  }),
  pkg({
    id: 'assistants',
    label: 'Asystenci',
    legacyKey: 'package.assistants',
    type: 'number',
    sortOrder: 404,
  }),
]
