/**
 * Central Variable Registry (app-side mirror of document_variable_registry).
 * All document types bind slots to these keys. Users never see placeholders.
 */

import type {
  DocumentVariableDef,
  DocumentVariableSection,
} from '@/types/documents'

export const DOCUMENT_VARIABLE_SECTIONS: {
  id: DocumentVariableSection
  label: string
}[] = [
  { id: 'bride', label: 'Panna młoda' },
  { id: 'groom', label: 'Pan młody' },
  { id: 'wedding', label: 'Ślub' },
  { id: 'package', label: 'Pakiet' },
  { id: 'payments', label: 'Płatności' },
  { id: 'locations', label: 'Lokalizacje' },
  { id: 'studio', label: 'Studio' },
  { id: 'additional', label: 'Dodatkowe' },
]

/** System variables — keep in sync with migration seed. */
export const DOCUMENT_VARIABLES: DocumentVariableDef[] = [
  {
    key: 'bride.firstName',
    section: 'bride',
    labelPl: 'Imię',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 10,
  },
  {
    key: 'bride.lastName',
    section: 'bride',
    labelPl: 'Nazwisko',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 20,
  },
  {
    key: 'bride.phone',
    section: 'bride',
    labelPl: 'Telefon',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 30,
  },
  {
    key: 'bride.email',
    section: 'bride',
    labelPl: 'E-mail',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 40,
  },
  {
    key: 'bride.address',
    section: 'bride',
    labelPl: 'Adres',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 50,
  },
  {
    key: 'groom.firstName',
    section: 'groom',
    labelPl: 'Imię',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 110,
  },
  {
    key: 'groom.lastName',
    section: 'groom',
    labelPl: 'Nazwisko',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 120,
  },
  {
    key: 'groom.phone',
    section: 'groom',
    labelPl: 'Telefon',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 130,
  },
  {
    key: 'groom.email',
    section: 'groom',
    labelPl: 'E-mail',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 140,
  },
  {
    key: 'groom.address',
    section: 'groom',
    labelPl: 'Adres',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 150,
  },
  {
    key: 'wedding.date',
    section: 'wedding',
    labelPl: 'Data ślubu',
    valueType: 'date',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 210,
  },
  {
    key: 'wedding.ceremonyTime',
    section: 'wedding',
    labelPl: 'Godzina ceremonii',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 220,
  },
  {
    key: 'wedding.coupleNames',
    section: 'wedding',
    labelPl: 'Imiona pary',
    valueType: 'string',
    dataSource: 'computed',
    isSystem: true,
    sortOrder: 230,
  },
  {
    key: 'package.name',
    section: 'package',
    labelPl: 'Nazwa pakietu',
    valueType: 'string',
    dataSource: 'package_snapshot',
    isSystem: true,
    sortOrder: 310,
  },
  {
    key: 'package.price',
    section: 'package',
    labelPl: 'Wartość umowy',
    valueType: 'money',
    dataSource: 'draft',
    isSystem: true,
    sortOrder: 320,
  },
  {
    key: 'package.deposit',
    section: 'package',
    labelPl: 'Zadatek',
    valueType: 'money',
    dataSource: 'draft',
    isSystem: true,
    sortOrder: 330,
  },
  {
    key: 'package.remaining',
    section: 'package',
    labelPl: 'Pozostała kwota',
    valueType: 'money',
    dataSource: 'draft',
    isSystem: true,
    sortOrder: 340,
  },
  {
    key: 'payments.depositPaid',
    section: 'payments',
    labelPl: 'Zadatek opłacony',
    valueType: 'boolean',
    dataSource: 'payments',
    isSystem: true,
    sortOrder: 410,
  },
  {
    key: 'payments.totalPaid',
    section: 'payments',
    labelPl: 'Suma wpłat',
    valueType: 'money',
    dataSource: 'payments',
    isSystem: true,
    sortOrder: 420,
  },
  {
    key: 'location.preparation',
    section: 'locations',
    labelPl: 'Przygotowania',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 510,
  },
  {
    key: 'location.ceremony',
    section: 'locations',
    labelPl: 'Ceremonia',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 520,
  },
  {
    key: 'location.reception',
    section: 'locations',
    labelPl: 'Przyjęcie',
    valueType: 'string',
    dataSource: 'wedding',
    isSystem: true,
    sortOrder: 530,
  },
  {
    key: 'studio.name',
    section: 'studio',
    labelPl: 'Nazwa studia',
    valueType: 'string',
    dataSource: 'studio',
    isSystem: true,
    sortOrder: 610,
  },
  {
    key: 'studio.nip',
    section: 'studio',
    labelPl: 'NIP',
    valueType: 'string',
    dataSource: 'studio',
    isSystem: true,
    sortOrder: 620,
  },
  {
    key: 'additional.contractNumber',
    section: 'additional',
    labelPl: 'Numer umowy',
    valueType: 'string',
    dataSource: 'draft',
    isSystem: true,
    sortOrder: 710,
  },
  {
    key: 'additional.city',
    section: 'additional',
    labelPl: 'Miasto',
    valueType: 'string',
    dataSource: 'draft',
    isSystem: true,
    sortOrder: 720,
  },
]

const byKey = new Map(DOCUMENT_VARIABLES.map((v) => [v.key, v]))

export function getVariableDef(key: string): DocumentVariableDef | undefined {
  return byKey.get(key)
}

export function variablesForSection(
  section: DocumentVariableSection,
): DocumentVariableDef[] {
  return DOCUMENT_VARIABLES.filter((v) => v.section === section)
}

export function isKnownVariableKey(key: string): boolean {
  return byKey.has(key)
}
