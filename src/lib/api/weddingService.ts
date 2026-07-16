import { mockWeddings } from '@/mocks/weddings'
import { mockPackages } from '@/mocks/packages'
import { addTask } from '@/mocks/tasks'
import { createWeddingDeliverablesFromPackage } from '@/lib/utils/deliverables'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type { CreateWeddingInput, Wedding } from '@/types/wedding'

/**
 * Abstrakcja warstwy danych – gotowa do podmiany na Supabase.
 * W przyszłości: supabase.from('weddings').insert(...)
 */
let weddingsStore: Wedding[] = [...mockWeddings]

export const weddingService = {
  async getAll(): Promise<Wedding[]> {
    await delay(150)
    return [...weddingsStore].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
  },

  async getById(id: string): Promise<Wedding | null> {
    await delay(100)
    return weddingsStore.find((w) => w.id === id) ?? null
  },

  async create(input: CreateWeddingInput): Promise<Wedding> {
    await delay(200)

    const pkg = mockPackages.find((p) => p.name === input.packageName)
    const id = `w${Date.now()}`
    const today = new Date().toISOString().slice(0, 10)

    const workflowStage = input.depositPaid ? 'deposit' : 'reservation'

    const wedding: Wedding = {
      id,
      couple: {
        partner1: input.partner1,
        partner2: input.partner2,
        email: '',
        phone: '',
        venue: input.receptionLocation ?? input.ceremonyLocation ?? '',
        city: '',
      },
      date: input.date,
      workflowStage,
      packageName: input.packageName,
      price: input.price,
      ceremonyLocation: input.ceremonyLocation,
      receptionLocation: input.receptionLocation,
      accentColor: pkg?.color ?? '#7c5cbf',
      createdAt: today,
      checklist: [],
      schedule: [],
      payments: input.depositPaid
        ? [
            {
              id: `p-${id}-dep`,
              label: 'Zaliczka',
              amount: input.depositAmount ?? Math.round(input.price * 0.3),
              type: 'deposit',
              paid: true,
              paidAt: input.depositPaymentDate ?? today,
            },
          ]
        : [],
      finances: [],
      questionnaires: createDefaultQuestionnaires(),
      contract: { status: 'none' },
      notes: input.notes
        ? [
            {
              id: `n-${id}`,
              content: input.notes,
              createdAt: today,
              author: 'Karolina',
            },
          ]
        : [],
      deliverables: pkg
        ? createWeddingDeliverablesFromPackage(id, pkg)
        : [],
      timeline: [
        {
          id: `tl-${id}-1`,
          title: 'Dodano zlecenie',
          date: today,
          type: 'created',
        },
      ],
    }

    weddingsStore = [...weddingsStore, wedding]

    addTask({
      id: `t-${id}`,
      weddingId: id,
      title: 'Wyślij ankietę do umowy',
      dueDate: today,
      completed: false,
      priority: 'high',
    })

    return wedding
  },

  async update(wedding: Wedding): Promise<Wedding> {
    await delay(100)
    const index = weddingsStore.findIndex((w) => w.id === wedding.id)
    if (index === -1) {
      weddingsStore = [...weddingsStore, wedding]
    } else {
      weddingsStore = weddingsStore.map((w) => (w.id === wedding.id ? wedding : w))
    }
    return wedding
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
