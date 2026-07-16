/**
 * Studio Catalog types — packages, items, extra services.
 * Live catalog prices apply to future weddings only; weddings store snapshots.
 */

export interface PackageItem {
  id: string
  packageId: string
  title: string
  description: string | null
  sortOrder: number
  createdAt: string
}

export interface StudioPackage {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  depositAmount: number
  currency: string
  color: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  items: PackageItem[]
}

export interface ExtraService {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  currency: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface WeddingExtraService {
  id: string
  weddingId: string
  extraServiceId: string
  priceSnapshot: number
  quantity: number
  createdAt: string
  /** Joined catalog name when loaded. */
  name?: string
}

/** @deprecated Prefer StudioPackage — kept for deliverable helpers during migration. */
export type PackageDeliverable = { id: string; name: string }

/** @deprecated Prefer StudioPackage */
export type Package = {
  id: string
  name: string
  price: number
  color: string
  deliverables: PackageDeliverable[]
  depositAmount?: number
  currency?: string
}

export function studioPackageToLegacyPackage(pkg: StudioPackage): Package {
  return {
    id: pkg.id,
    name: pkg.name,
    price: pkg.price,
    color: pkg.color ?? '#7c5cbf',
    depositAmount: pkg.depositAmount,
    currency: pkg.currency,
    deliverables: pkg.items.map((item) => ({
      id: item.id,
      name: item.title,
    })),
  }
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'pakiet'
}
