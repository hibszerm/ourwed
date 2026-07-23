/**
 * Package variables — business values from Studio → Packages.
 * AI detects presence only (never stores amounts/dates from the contract text).
 */

export interface PackageVariableDef {
  /** Canonical AI id */
  id: string
  /** Internal registry / merge key */
  registryKey: string
  labelPl: string
}

/**
 * Allow-list of package slots the AI may detect in a contract.
 * Values are always resolved later from the selected Studio Package.
 */
export const PACKAGE_VARIABLE_DEFS: PackageVariableDef[] = [
  {
    id: 'package_name',
    registryKey: 'package.name',
    labelPl: 'Nazwa pakietu',
  },
  {
    id: 'package_price',
    registryKey: 'package.price',
    labelPl: 'Wartość umowy',
  },
  {
    id: 'contract_price',
    registryKey: 'package.price',
    labelPl: 'Wartość umowy',
  },
  {
    id: 'price',
    registryKey: 'package.price',
    labelPl: 'Wartość umowy',
  },
  {
    id: 'deposit_amount',
    registryKey: 'package.deposit',
    labelPl: 'Zadatek',
  },
  {
    id: 'deposit',
    registryKey: 'package.deposit',
    labelPl: 'Zadatek',
  },
  {
    id: 'deposit_type',
    registryKey: 'package.depositType',
    labelPl: 'Typ zadatku',
  },
  {
    id: 'deposit_percent',
    registryKey: 'package.depositPercent',
    labelPl: 'Zadatek (%)',
  },
  {
    id: 'remaining_payment',
    registryKey: 'package.remaining',
    labelPl: 'Pozostała płatność',
  },
  {
    id: 'payment_deadline',
    registryKey: 'package.paymentDeadline',
    labelPl: 'Termin płatności',
  },
  {
    id: 'payment_due_days',
    registryKey: 'package.paymentDeadline',
    labelPl: 'Termin płatności',
  },
  {
    id: 'payment_installments',
    registryKey: 'package.installments',
    labelPl: 'Liczba rat',
  },
  {
    id: 'delivery_time',
    registryKey: 'package.deliveryTime',
    labelPl: 'Termin dostawy',
  },
  {
    id: 'delivery_days',
    registryKey: 'package.deliveryTime',
    labelPl: 'Termin dostawy',
  },
  {
    id: 'included_services',
    registryKey: 'package.includedServices',
    labelPl: 'Usługi w pakiecie',
  },
  {
    id: 'photographers_count',
    registryKey: 'package.photographersCount',
    labelPl: 'Liczba fotografów',
  },
  {
    id: 'videographers_count',
    registryKey: 'package.videographersCount',
    labelPl: 'Liczba wideografów',
  },
  {
    id: 'working_hours',
    registryKey: 'package.workingHours',
    labelPl: 'Godziny pracy',
  },
  {
    id: 'overtime_price',
    registryKey: 'package.overtimePrice',
    labelPl: 'Cena za godzinę nadliczbową',
  },
  {
    id: 'mileage_limit',
    registryKey: 'package.mileageLimit',
    labelPl: 'Limit kilometrów',
  },
  {
    id: 'mileage_price',
    registryKey: 'package.mileagePrice',
    labelPl: 'Cena za km',
  },
  {
    id: 'accommodation',
    registryKey: 'package.accommodation',
    labelPl: 'Nocleg',
  },
  {
    id: 'travel_fee',
    registryKey: 'package.travelFee',
    labelPl: 'Opłata za dojazd',
  },
  {
    id: 'album_included',
    registryKey: 'package.albumIncluded',
    labelPl: 'Album w cenie',
  },
  {
    id: 'usb_included',
    registryKey: 'package.usbIncluded',
    labelPl: 'Pendrive w cenie',
  },
  {
    id: 'online_gallery',
    registryKey: 'package.onlineGallery',
    labelPl: 'Galeria online',
  },
  {
    id: 'engagement_session',
    registryKey: 'package.engagementSession',
    labelPl: 'Sesja narzeczeńska',
  },
  {
    id: 'wedding_session',
    registryKey: 'package.weddingSession',
    labelPl: 'Sesja ślubna',
  },
  {
    id: 'number_of_revisions',
    registryKey: 'package.revisions',
    labelPl: 'Liczba poprawek',
  },
  {
    id: 'assistants',
    registryKey: 'package.assistants',
    labelPl: 'Asystenci',
  },
]

/** Unique by registryKey for review add-lists. */
export const PACKAGE_VARIABLE_DEFS_UNIQUE: PackageVariableDef[] = [
  ...new Map(PACKAGE_VARIABLE_DEFS.map((d) => [d.registryKey, d])).values(),
]

const byId = new Map(PACKAGE_VARIABLE_DEFS.map((d) => [d.id, d]))
const byRegistry = new Map(
  PACKAGE_VARIABLE_DEFS.map((d) => [d.registryKey, d]),
)

export function getPackageVariableDef(
  idOrKey: string,
): PackageVariableDef | undefined {
  return byId.get(idOrKey) ?? byRegistry.get(idOrKey)
}

export function isPackageVariableId(id: string): boolean {
  return byId.has(id) || byRegistry.has(id)
}

export function packageVariablePolishLabel(idOrKey: string): string {
  return getPackageVariableDef(idOrKey)?.labelPl ?? 'Z pakietu'
}

export const PACKAGE_VARIABLE_IDS: string[] = [
  ...new Set(PACKAGE_VARIABLE_DEFS.map((d) => d.id)),
].sort()
