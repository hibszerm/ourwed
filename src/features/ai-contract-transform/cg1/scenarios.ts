/**
 * CG1 synthetic wedding/extras scenarios (no real customer data).
 */

import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import type { TortureTemplateId } from './tortureTemplates'
import { TORTURE_TEMPLATE_META } from './tortureTemplates'

export type PartyMode = 'one' | 'two'
export type ExtrasMode = 'none' | 'one' | 'many'

export type Cg1Scenario = {
  templateId: TortureTemplateId
  scenarioId: string
  partyMode: PartyMode
  extrasMode: ExtrasMode
  wedding: Wedding
  package: { id: string; name: string }
  extras: WeddingExtraService[]
}

const SYNTHETIC_EXTRAS_CATALOG = [
  'dodatkowy operator',
  'film w wersji rozszerzonej',
  'ujęcie z drona',
  'ekspresowy montaż',
] as const

function weddingFor(partyMode: PartyMode, seed: string): Wedding {
  const base = {
    id: `cg1-w-${seed}`,
    date: '2027-06-19',
    price: 12500,
    depositAmount: 3500,
    currency: 'PLN' as const,
    packageId: `cg1-pkg-${seed}`,
    packageName: 'Pakiet QA Premium',
    couple: {
      partner1: 'Anna Testowa',
      partner1Address: 'ul. Kwiatowa 12',
      partner1City: 'Kraków',
      partner1PostalCode: '30-001',
      partner1Phone: '+48 500 100 200',
      ...(partyMode === 'two'
        ? {
            partner2: 'Jan Próbny',
            partner2Address: 'ul. Kwiatowa 12',
            partner2City: 'Kraków',
            partner2PostalCode: '30-001',
            partner2Phone: '+48 500 100 201',
          }
        : {}),
    },
  }
  return base as unknown as Wedding
}

function extrasFor(
  mode: ExtrasMode,
  weddingId: string,
): WeddingExtraService[] {
  if (mode === 'none') return []
  const names =
    mode === 'one'
      ? [SYNTHETIC_EXTRAS_CATALOG[0]]
      : [...SYNTHETIC_EXTRAS_CATALOG]
  return names.map((name, i) => ({
    id: `cg1-e-${weddingId}-${i}`,
    weddingId,
    extraServiceId: `cg1-s-${i}`,
    priceSnapshot: 500 + i * 250,
    quantity: 1,
    createdAt: '2026-01-01',
    name,
  }))
}

/** Compact matrix: each template × BASE + EXTRAS; parties from template default. */
export function buildCg1ScenarioMatrix(): Cg1Scenario[] {
  const out: Cg1Scenario[] = []
  for (const meta of TORTURE_TEMPLATE_META) {
    const partyMode: PartyMode = meta.partiesDefault === 1 ? 'one' : 'two'
    for (const extrasMode of ['none', 'many'] as ExtrasMode[]) {
      // T05 gets single extra to keep minimal docs from exploding
      const mode: ExtrasMode =
        extrasMode === 'many' && meta.id === 'T05' ? 'one' : extrasMode
      const seed = `${meta.id}-${mode}`
      const wedding = weddingFor(partyMode, seed)
      out.push({
        templateId: meta.id,
        scenarioId: `${meta.id}_${mode === 'none' ? 'BASE' : 'EXTRAS'}`,
        partyMode,
        extrasMode: mode,
        wedding,
        package: { id: wedding.packageId!, name: 'Pakiet QA Premium' },
        extras: extrasFor(mode, wedding.id),
      })
    }
  }
  return out
}

export { SYNTHETIC_EXTRAS_CATALOG }
