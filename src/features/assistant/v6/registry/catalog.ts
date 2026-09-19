import { V6_BUSINESS_CONCEPTS } from './concepts'
import type { ConceptFilterShape } from './types'

function formatFilterShape(
  shape: ConceptFilterShape | readonly ConceptFilterShape[] | undefined,
): string | null {
  if (shape == null) return null
  if (typeof shape === 'string') return shape
  return [...shape].join('|')
}

/**
 * Builds the compact capability catalog injected into the V6 planner prompt.
 * Registry order is preserved within each namespace.
 * Filterable concepts include registry-derived comparator affordances.
 */
export function buildPlannerConceptCatalogText(): string {
  const groups = new Map<string, string[]>()

  for (const concept of V6_BUSINESS_CONCEPTS) {
    if (!concept.plannerVisible) continue

    const namespace = concept.key.split('.')[0] ?? 'OTHER'
    const lines = groups.get(namespace) ?? []
    const filter = formatFilterShape(
      'filterShape' in concept
        ? (concept.filterShape as
            | ConceptFilterShape
            | readonly ConceptFilterShape[]
            | undefined)
        : undefined,
    )
    const filterPart = filter ? ` filter:${filter}` : ''
    const sortPart =
      'sortKey' in concept && concept.sortKey === true ? ' sort:yes' : ''
    lines.push(
      `${concept.key} — ${concept.semanticDescription} [${concept.operations.join(', ')}]${filterPart}${sortPart}`,
    )
    groups.set(namespace, lines)
  }

  return [...groups]
    .map(([namespace, lines]) => `${namespace}\n${lines.join('\n')}`)
    .join('\n\n')
}
