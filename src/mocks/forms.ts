import type { Form } from '@/types/form'

/**
 * Public form instances — /forms/:token
 *
 * demo  → Scenario A (existing wedding w3)
 * nowe  → Scenario B (no wedding → Pending Wedding)
 * ankieta → Wedding questionnaire (coming soon)
 */
export const mockForms: Form[] = [
  {
    id: 'form-demo',
    token: 'demo',
    templateId: 'tpl-contract',
    weddingId: 'w3',
    status: 'open',
    createdAt: '2026-06-20',
  },
  {
    id: 'form-nowe',
    token: 'nowe',
    templateId: 'tpl-contract',
    weddingId: null,
    status: 'open',
    createdAt: '2026-07-10',
  },
  {
    id: 'form-ankieta',
    token: 'ankieta',
    templateId: 'tpl-wedding-q',
    weddingId: 'w1',
    status: 'open',
    createdAt: '2026-07-01',
  },
]
