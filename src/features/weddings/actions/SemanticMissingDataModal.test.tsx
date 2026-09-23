import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SemanticContractCanonicalDataset, SemanticGenerationRequirement } from '@/features/ai-contract-transform/semanticContractGenerationService'

vi.mock('@/components/ui/ModalPortal', () => ({
  ModalPortal: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

import { SemanticMissingDataModal } from './SemanticMissingDataModal'

const requirements: SemanticGenerationRequirement[] = [
  { id: 'date-a', kind: 'date', valueType: 'DATE', label: 'Termin albumu', sourceBlockId: 'para-a', date: { unresolvedDateId: 'date-a', documentStateId: 'state', sourceBlockId: 'para-a', anchor: '12.07.2025', span: { start: 0, end: 10 }, reason: 'unknown_date' } },
  { id: 'email-b', kind: 'customer_email', valueType: 'EMAIL', label: 'E-mail klienta', customerIndexes: [1], sourceBlockId: 'para-b' },
]

function markup(busy = false) {
  return renderToStaticMarkup(createElement(SemanticMissingDataModal, {
    open: true,
    busy,
    requirements,
    dataset: { clients: { customers: [{ displayName: 'Anna Kowalska' }, { displayName: 'Jan Nowak' }] } } as SemanticContractCanonicalDataset,
    values: {},
    errors: {},
    onChange: () => undefined,
    onSubmit: () => undefined,
    onCancel: () => undefined,
  }))
}

describe('SemanticMissingDataModal', () => {
  it('renders one accessible form with all date and canonical-owner email requirements', () => {
    const html = markup()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Uzupełnij dane umowy')
    expect(html).toContain('Termin albumu')
    expect(html).toContain('E-mail — Jan Nowak')
    expect(html).toContain('type="date"')
    expect(html).toContain('type="email"')
    expect(html).toContain('Generuj')
    expect(html).toContain('Anuluj')
  })

  it('disables both actions while deterministic resume is running', () => {
    const html = markup(true)
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('Generujemy…')
  })
})
