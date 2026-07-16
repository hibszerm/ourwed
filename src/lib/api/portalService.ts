import { mockPackages } from '@/mocks/packages'
import { mockPortalSettings, mockPortals, PORTAL_SECTIONS } from '@/mocks/portal'
import { applyPackageChangeToWedding } from '@/lib/utils/packageChange'
import { weddingService } from '@/lib/api/weddingService'
import type {
  ContractQuestionnaire,
  Portal,
  PortalSection,
  PortalSettings,
  SubmitContractQuestionnaireResult,
} from '@/types/portal'
import type { Wedding } from '@/types/wedding'

/**
 * @deprecated Couple Portal v1.
 * Recommended architecture: Form Engine (`formService` + `/forms/:token`).
 * Kept for Sprint 04 demos only — do not extend.
 *
 * Abstrakcja portalu pary — gotowa do podmiany na Supabase.
 * Przyszłość: supabase.from('portals').select().eq('token', token)
 */
export const portalService = {
  async getByToken(token: string): Promise<Portal | null> {
    await delay(80)
    return mockPortals.find((p) => p.token === token) ?? null
  },

  async getSettings(): Promise<PortalSettings> {
    await delay(40)
    return { ...mockPortalSettings }
  },

  getSections(): PortalSection[] {
    return [...PORTAL_SECTIONS]
  },

  async getWeddingForToken(token: string): Promise<Wedding | null> {
    const portal = await this.getByToken(token)
    if (!portal) return null
    return weddingService.getById(portal.weddingId)
  },

  /**
   * Mock submit — updates wedding in memory store.
   * Architecture ready for package change side-effects.
   */
  async submitContractQuestionnaire(
    token: string,
    data: ContractQuestionnaire,
  ): Promise<SubmitContractQuestionnaireResult | null> {
    await delay(250)

    const portal = await this.getByToken(token)
    if (!portal) return null

    const wedding = await weddingService.getById(portal.weddingId)
    if (!wedding) return null

    const pkg = mockPackages.find((p) => p.id === data.packageId)
    let next = wedding
    let packageChanged = false

    if (pkg && pkg.name !== wedding.packageName) {
      next = applyPackageChangeToWedding(wedding, pkg)
      packageChanged = true
    }

    const today = new Date().toISOString().slice(0, 10)

    next = {
      ...next,
      date: data.weddingDate || next.date,
      ceremonyLocation: data.ceremonyLocation || next.ceremonyLocation,
      receptionLocation: data.receptionLocation || next.receptionLocation,
      price: pkg?.price ?? next.price,
      packageName: pkg?.name ?? next.packageName,
      accentColor: pkg?.color ?? next.accentColor,
      couple: {
        ...next.couple,
        partner1: data.partner1.firstName || next.couple.partner1,
        partner2: data.partner2.firstName || next.couple.partner2,
        partner1Phone: data.partner1.phone || next.couple.partner1Phone,
        partner1Email: data.partner1.email || next.couple.partner1Email,
        partner2Phone: data.partner2.phone || next.couple.partner2Phone,
        partner2Email: data.partner2.email || next.couple.partner2Email,
        phone: data.partner1.phone || next.couple.phone,
        email: data.partner1.email || next.couple.email,
        city: data.partner1.city || next.couple.city,
        venue: data.receptionLocation || next.couple.venue,
      },
      questionnaires: {
        ...next.questionnaires,
        contractData: {
          status: 'completed',
          sentAt: next.questionnaires.contractData.sentAt ?? today,
          completedAt: today,
        },
      },
      notes: data.additionalNotes
        ? [
            {
              id: `n-portal-${Date.now()}`,
              content: data.additionalNotes,
              createdAt: today,
              author: 'Para',
            },
            ...next.notes,
          ]
        : next.notes,
    }

    await weddingService.update(next)
    return { success: true, packageChanged }
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
