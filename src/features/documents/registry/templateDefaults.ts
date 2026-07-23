/**
 * Template default catalog — contract-fixed values stored on the Document Template.
 * Never written to Studio Settings. Polish labels only in the UI.
 */

export type TemplateDefaultValueType =
  | 'money'
  | 'number'
  | 'boolean'
  | 'string'
  | 'days'

export interface TemplateDefaultDef {
  /** Canonical AI id */
  id: string
  /** Internal key stored on the template */
  registryKey: string
  labelPl: string
  valueType: TemplateDefaultValueType
  /** Hint for empty inputs */
  placeholder?: string
  unit?: string
}

/**
 * Defaults AI may extract from fixed wording in the contract.
 * Presence may also appear in `variables`; values live in `defaults`.
 */
export const TEMPLATE_DEFAULT_DEFS: TemplateDefaultDef[] = [
  {
    id: 'deposit_amount',
    registryKey: 'template.depositAmount',
    labelPl: 'Zadatek',
    valueType: 'money',
    placeholder: 'np. 2000',
    unit: 'PLN',
  },
  {
    id: 'deposit_percent',
    registryKey: 'template.depositPercent',
    labelPl: 'Zadatek (%)',
    valueType: 'number',
    placeholder: 'np. 30',
    unit: '%',
  },
  {
    id: 'contract_price',
    registryKey: 'template.contractPrice',
    labelPl: 'Wartość umowy',
    valueType: 'money',
    placeholder: 'np. 8000',
    unit: 'PLN',
  },
  {
    id: 'price',
    registryKey: 'template.contractPrice',
    labelPl: 'Wartość umowy',
    valueType: 'money',
    placeholder: 'np. 8000',
    unit: 'PLN',
  },
  {
    id: 'remaining_payment',
    registryKey: 'template.remainingPayment',
    labelPl: 'Pozostała płatność',
    valueType: 'money',
    placeholder: 'np. 6000',
    unit: 'PLN',
  },
  {
    id: 'payment_due_days',
    registryKey: 'template.paymentDueDays',
    labelPl: 'Termin płatności (dni)',
    valueType: 'days',
    placeholder: 'np. 7',
    unit: 'dni',
  },
  {
    id: 'payment_installments',
    registryKey: 'template.paymentInstallments',
    labelPl: 'Liczba rat',
    valueType: 'number',
    placeholder: 'np. 2',
  },
  {
    id: 'delivery_days',
    registryKey: 'template.deliveryDays',
    labelPl: 'Termin dostawy galerii (dni)',
    valueType: 'days',
    placeholder: 'np. 60',
    unit: 'dni',
  },
  {
    id: 'photographers_count',
    registryKey: 'template.photographersCount',
    labelPl: 'Liczba fotografów',
    valueType: 'number',
    placeholder: 'np. 1',
  },
  {
    id: 'videographers_count',
    registryKey: 'template.videographersCount',
    labelPl: 'Liczba wideografów',
    valueType: 'number',
    placeholder: 'np. 1',
  },
  {
    id: 'working_hours',
    registryKey: 'template.workingHours',
    labelPl: 'Godziny pracy',
    valueType: 'number',
    placeholder: 'np. 10',
    unit: 'h',
  },
  {
    id: 'overtime_price',
    registryKey: 'template.overtimePrice',
    labelPl: 'Cena za godzinę nadliczbową',
    valueType: 'money',
    placeholder: 'np. 300',
    unit: 'PLN',
  },
  {
    id: 'mileage_limit',
    registryKey: 'template.mileageLimit',
    labelPl: 'Limit kilometrów',
    valueType: 'number',
    placeholder: 'np. 50',
    unit: 'km',
  },
  {
    id: 'mileage_price',
    registryKey: 'template.mileagePrice',
    labelPl: 'Cena za km',
    valueType: 'money',
    placeholder: 'np. 2',
    unit: 'PLN',
  },
  {
    id: 'album_included',
    registryKey: 'template.albumIncluded',
    labelPl: 'Album w cenie',
    valueType: 'boolean',
  },
  {
    id: 'usb_included',
    registryKey: 'template.usbIncluded',
    labelPl: 'Pendrive w cenie',
    valueType: 'boolean',
  },
  {
    id: 'online_gallery',
    registryKey: 'template.onlineGallery',
    labelPl: 'Galeria online',
    valueType: 'boolean',
  },
  {
    id: 'engagement_session',
    registryKey: 'template.engagementSession',
    labelPl: 'Sesja narzeczeńska',
    valueType: 'boolean',
  },
  {
    id: 'wedding_session',
    registryKey: 'template.weddingSession',
    labelPl: 'Sesja ślubna',
    valueType: 'boolean',
  },
  {
    id: 'number_of_revisions',
    registryKey: 'template.numberOfRevisions',
    labelPl: 'Liczba poprawek',
    valueType: 'number',
    placeholder: 'np. 2',
  },
  {
    id: 'assistants',
    registryKey: 'template.assistants',
    labelPl: 'Asystenci',
    valueType: 'number',
    placeholder: 'np. 1',
  },
]

const byId = new Map(TEMPLATE_DEFAULT_DEFS.map((d) => [d.id, d]))
const byRegistry = new Map(
  TEMPLATE_DEFAULT_DEFS.map((d) => [d.registryKey, d]),
)

/** Unique by registryKey for UI add-lists. */
export const TEMPLATE_DEFAULT_DEFS_UNIQUE: TemplateDefaultDef[] = [
  ...new Map(TEMPLATE_DEFAULT_DEFS.map((d) => [d.registryKey, d])).values(),
]

export function getTemplateDefaultDef(
  idOrKey: string,
): TemplateDefaultDef | undefined {
  return byId.get(idOrKey) ?? byRegistry.get(idOrKey)
}

export function isTemplateDefaultId(id: string): boolean {
  return byId.has(id) || byRegistry.has(id)
}

export function templateDefaultPolishLabel(idOrKey: string): string {
  return getTemplateDefaultDef(idOrKey)?.labelPl ?? 'Wartość z umowy'
}

/** Map legacy package.* money keys → template default registry keys. */
export const LEGACY_PACKAGE_TO_TEMPLATE_DEFAULT: Record<string, string> = {
  'package.price': 'template.contractPrice',
  'package.deposit': 'template.depositAmount',
  'package.remaining': 'template.remainingPayment',
}
