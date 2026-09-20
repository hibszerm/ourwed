import { loadOperationalWeddingDay } from '@/features/assistant/v4/capabilities/loadOperationalWeddingDay'
import { contactService } from '@/lib/api/contactService'
import { contractService } from '@/lib/api/contractService'
import { paymentService } from '@/lib/api/paymentService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { sessionService } from '@/lib/api/sessionService'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import type { OperationalWeddingDayLoad } from '@/features/assistant/v4/capabilities/loadOperationalWeddingDay'
import {
  buildOperationalDayStops,
  type OperationalDayStop,
  type OperationalTimeMap,
} from '@/features/wedding-day/operationalDayPlan'
import type { WeddingExtraService } from '@/types/package'
import type { WeddingQuestionnaire } from '@/types/preweddingQuestionnaire'
import type { Session } from '@/types/session'
import type {
  Payment,
  Wedding,
  WeddingContact,
  WeddingContract,
} from '@/types/wedding'
import {
  loadWeddingLogisticsReadOnly,
  type WeddingLogisticsSnapshot,
} from './logisticsAuthority'

export type WeddingReadContextOverrides = {
  loadWedding?: (weddingId: string) => Promise<Wedding | null>
  loadPayments?: (weddingId: string) => Promise<Payment[]>
  loadContract?: (weddingId: string) => Promise<WeddingContract | null>
  loadTasks?: (weddingId: string) => Promise<StudioTask[]>
  loadSessions?: (weddingId: string) => Promise<Session[]>
  loadExtras?: (weddingId: string) => Promise<WeddingExtraService[]>
  loadContacts?: (weddingId: string) => Promise<WeddingContact[]>
  loadOperationalDay?: (weddingId: string) => Promise<OperationalWeddingDayLoad>
  loadOperationalStops?: (weddingId: string) => Promise<OperationalDayStop[]>
  loadOperationalTimes?: (weddingId: string) => Promise<OperationalTimeMap>
  loadPrewedding?: (weddingId: string) => Promise<WeddingQuestionnaire | null>
  loadLogistics?: (weddingId: string) => Promise<WeddingLogisticsSnapshot>
  seeded?: Partial<{
    wedding: Wedding | null
    payments: Payment[]
    contract: WeddingContract | null
    tasks: StudioTask[]
    sessions: Session[]
    extras: WeddingExtraService[]
    contacts: WeddingContact[]
    operationalDay: OperationalWeddingDayLoad
    operationalStops: OperationalDayStop[]
    operationalTimes: OperationalTimeMap
    prewedding: WeddingQuestionnaire | null
    logistics: WeddingLogisticsSnapshot
  }>
}

type CacheKey = keyof NonNullable<WeddingReadContextOverrides['seeded']>

export class WeddingReadContext {
  readonly weddingId: string
  private readonly overrides: WeddingReadContextOverrides
  private readonly cache = new Map<CacheKey, Promise<unknown>>()

  constructor(weddingId: string, options: WeddingReadContextOverrides = {}) {
    this.weddingId = weddingId
    this.overrides = options
  }

  private once<T>(key: CacheKey, load: () => Promise<T>): Promise<T> {
    const current = this.cache.get(key)
    if (current) return current as Promise<T>
    const seeded = this.overrides.seeded
    const promise =
      seeded && Object.prototype.hasOwnProperty.call(seeded, key)
        ? Promise.resolve(seeded[key] as T)
        : load()
    this.cache.set(key, promise)
    return promise
  }

  getWedding(): Promise<Wedding | null> {
    return this.once('wedding', () =>
      (this.overrides.loadWedding ?? weddingService.getById)(this.weddingId),
    )
  }

  getPayments(): Promise<Payment[]> {
    return this.once('payments', () =>
      this.overrides.loadPayments
        ? this.overrides.loadPayments(this.weddingId)
        : paymentService.listByWeddingId(this.weddingId),
    )
  }

  getContract(): Promise<WeddingContract | null> {
    return this.once('contract', () =>
      this.overrides.loadContract
        ? this.overrides.loadContract(this.weddingId)
        : contractService.getByWeddingId(this.weddingId),
    )
  }

  getTasks(): Promise<StudioTask[]> {
    return this.once('tasks', async () => {
      if (this.overrides.loadTasks) {
        return this.overrides.loadTasks(this.weddingId)
      }
      const all = await taskService.listForStudio()
      return all.filter((task) => task.weddingId === this.weddingId)
    })
  }

  getSessions(): Promise<Session[]> {
    return this.once('sessions', () =>
      this.overrides.loadSessions
        ? this.overrides.loadSessions(this.weddingId)
        : sessionService.listByWeddingId(this.weddingId),
    )
  }

  getExtras(): Promise<WeddingExtraService[]> {
    return this.once('extras', () =>
      (this.overrides.loadExtras ??
        weddingExtraServiceService.listByWeddingId)(this.weddingId),
    )
  }

  getContacts(): Promise<WeddingContact[]> {
    return this.once('contacts', () =>
      (this.overrides.loadContacts ?? contactService.listByWeddingId)(
        this.weddingId,
      ),
    )
  }

  getOperationalDay(): Promise<OperationalWeddingDayLoad> {
    return this.once('operationalDay', () =>
      (this.overrides.loadOperationalDay ?? loadOperationalWeddingDay)(
        this.weddingId,
      ),
    )
  }

  getOperationalTimes(): Promise<OperationalTimeMap> {
    return this.once('operationalTimes', () =>
      (this.overrides.loadOperationalTimes ??
        weddingOperationalTimesService.listByWeddingId)(this.weddingId),
    )
  }

  getOperationalStops(): Promise<OperationalDayStop[]> {
    return this.once('operationalStops', async () => {
      if (this.overrides.loadOperationalStops) {
        return this.overrides.loadOperationalStops(this.weddingId)
      }
      const [wedding, places, operationalTimes] = await Promise.all([
        this.getWedding(),
        weddingPlaceService.listByWeddingId(this.weddingId),
        this.getOperationalTimes(),
      ])
      if (!wedding) return []
      return buildOperationalDayStops({
        studio: null,
        places,
        operationalTimes,
        weddingCeremonyTime: wedding.ceremonyTime,
      })
    })
  }

  getPrewedding(): Promise<WeddingQuestionnaire | null> {
    return this.once('prewedding', () =>
      (this.overrides.loadPrewedding ??
        weddingQuestionnaireService.getByWeddingId)(this.weddingId),
    )
  }

  getLogistics(): Promise<WeddingLogisticsSnapshot> {
    return this.once('logistics', () =>
      this.overrides.loadLogistics
        ? this.overrides.loadLogistics(this.weddingId)
        : loadWeddingLogisticsReadOnly(this.weddingId),
    )
  }
}
