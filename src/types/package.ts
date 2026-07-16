/** Definicja materiału w pakiecie — szablon kopiowany do ślubu przy tworzeniu. */
export interface PackageDeliverable {
  id: string
  name: string
}

export interface Package {
  id: string
  name: string
  price: number
  color: string
  deliverables: PackageDeliverable[]
}
