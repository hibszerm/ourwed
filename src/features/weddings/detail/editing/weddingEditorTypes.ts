/**
 * Shared Wedding Detail editor section focus (page-owned).
 */

export type WeddingEditorSection =
  | 'couple'
  | 'contacts'
  | 'wedding'
  | 'package'
  | 'finances'
  | 'tasks'
  | 'notes'
  | 'locations'
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'
  | null

export function normalizeEditorSection(
  section: WeddingEditorSection,
): Exclude<WeddingEditorSection, null> {
  if (!section || section === 'locations') return 'contacts'
  if (section === 'couple') return 'contacts'
  return section
}

export function getEditorSectionMeta(
  section: Exclude<WeddingEditorSection, null>,
): { title: string; description: string } {
  switch (section) {
    case 'contacts':
    case 'couple':
      return {
        title: 'Edytuj dane pary',
        description: 'Imiona, telefony, e-maile i adresy kontaktowe.',
      }
    case 'wedding':
      return {
        title: 'Edytuj szczegóły ślubu',
        description: 'Data, godzina ceremonii oraz status zlecenia.',
      }
    case 'package':
      return {
        title: 'Edytuj pakiet',
        description: 'Wybór pakietu, snapshot warunków i usługi dodatkowe.',
      }
    case 'finances':
      return {
        title: 'Edytuj finanse',
        description: 'Wartość umowy, zadatek i lista wpłat.',
      }
    case 'tasks':
      return {
        title: 'Edytuj zadania',
        description: 'Lista zadań przypisanych do tego ślubu.',
      }
    case 'notes':
      return {
        title: 'Edytuj notatki',
        description: 'Notatki wewnętrzne do zlecenia.',
      }
    case 'locations':
      return {
        title: 'Edytuj lokalizacje',
        description: 'Wszystkie lokalizacje dnia ślubu.',
      }
    case 'bride_preparation':
      return {
        title: 'Edytuj przygotowania Panny Młodej',
        description: 'Adres i miejsce przygotowań Panny Młodej.',
      }
    case 'groom_preparation':
      return {
        title: 'Edytuj przygotowania Pana Młodego',
        description: 'Adres i miejsce przygotowań Pana Młodego.',
      }
    case 'ceremony':
      return {
        title: 'Edytuj ceremonię',
        description: 'Adres i miejsce ceremonii.',
      }
    case 'reception':
      return {
        title: 'Edytuj przyjęcie weselne',
        description: 'Adres i miejsce przyjęcia weselnego.',
      }
  }
}

export function isLocationEditorSection(
  section: WeddingEditorSection,
): section is
  | 'locations'
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception' {
  return (
    section === 'locations' ||
    section === 'bride_preparation' ||
    section === 'groom_preparation' ||
    section === 'ceremony' ||
    section === 'reception'
  )
}
