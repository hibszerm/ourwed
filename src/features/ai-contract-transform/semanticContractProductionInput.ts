import { buildContractTransformationDataset } from './transformationDataset'
import type { SemanticContractCanonicalDataset } from './semanticContractGenerationService'
import type { Wedding } from '@/types/wedding'
import type { StudioPackage, WeddingExtraService } from '@/types/package'
import type { WeddingPlace } from '@/types/travel'

function structuredTarget(place: WeddingPlace) {
  const address = place.formattedAddress.trim()
  const label = place.label?.trim() || ''
  const segments = [label, address].filter(Boolean)
  if (!segments.length) return undefined
  return { text: segments.join(', '), segments }
}

/** Build the semantic generator snapshot from existing authoritative records. */
export function buildSemanticContractProductionDataset(input: {
  wedding: Wedding
  package: Pick<StudioPackage, 'id' | 'name'>
  currentDate: string
  extras: readonly WeddingExtraService[]
  weddingPlaces: readonly WeddingPlace[]
}): SemanticContractCanonicalDataset {
  const base = buildContractTransformationDataset({
    wedding: input.wedding,
    package: input.package,
    currentDate: input.currentDate,
    extras: [...input.extras],
    weddingPlaces: input.weddingPlaces,
  })
  const locations = { ...base.locations }
  const placeFor = (role: WeddingPlace['role']) => input.weddingPlaces.find((place) => place.role === role)
  const preparationPlaces = [...(locations.preparationLocations ?? [])]
  const preparationRoles = [
    { place: placeFor('bride_preparation'), person: 'bride' as const },
    { place: placeFor('groom_preparation'), person: 'groom' as const },
    { place: placeFor('preparation'), person: 'shared' as const },
  ]
  for (const { place, person } of preparationRoles) {
    if (!place) continue
    const target = structuredTarget(place)
    if (!target) continue
    const entry = {
      person,
      label: place.label?.trim() || (person === 'bride' ? 'Przygotowania Panny Młodej' : person === 'groom' ? 'Przygotowania Pana Młodego' : 'Przygotowania'),
      fullAddress: place.formattedAddress.trim() || target.text,
      target,
    }
    const existingIndex = preparationPlaces.findIndex((item) => item.person === person)
    if (existingIndex < 0) preparationPlaces.push(entry)
    else preparationPlaces[existingIndex] = entry
  }
  if (preparationPlaces.length) {
    locations.preparationLocations = preparationPlaces
    const primary = preparationPlaces.find((place) => place.person === 'shared')
      ?? preparationPlaces.find((place) => place.person === 'bride')
      ?? preparationPlaces[0]!
    locations.preparation = {
      ...locations.preparation,
      displayName: primary.label,
      fullAddress: primary.fullAddress,
      ...(primary.target ? { target: primary.target } : {}),
    }
  }
  for (const role of ['ceremony', 'reception'] as const) {
    const place = placeFor(role)
    if (!place) continue
    const target = structuredTarget(place)
    if (!target) continue
    locations[role] = {
      ...(place.label?.trim() ? { displayName: place.label.trim() } : {}),
      ...(place.formattedAddress.trim() ? { fullAddress: place.formattedAddress.trim() } : {}),
      target,
    }
  }
  return {
    ...base,
    locations,
    clients: { ...base.clients, customers: [...(base.clients.customers ?? [])] },
    ...(base.additionalServices
      ? { additionalServices: base.additionalServices.map(({ name }) => ({ name })) }
      : {}),
  }
}
