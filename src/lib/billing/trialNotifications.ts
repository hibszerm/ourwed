import type { AccountEntitlement } from '@/lib/billing/entitlement'
import { getTrialTimeRemaining } from '@/lib/billing/entitlement'
import { notificationService } from '@/lib/api/notificationService'

type Milestone = '7d' | '3d' | '1d' | 'expired'

function storageKey(subId: string, milestone: Milestone) {
  return `ourwed.trialNotice.${subId}.${milestone}`
}

function alreadyNotified(subId: string, milestone: Milestone): boolean {
  try {
    return localStorage.getItem(storageKey(subId, milestone)) === '1'
  } catch {
    return false
  }
}

function markNotified(subId: string, milestone: Milestone) {
  try {
    localStorage.setItem(storageKey(subId, milestone), '1')
  } catch {
    /* ignore */
  }
}

function milestoneFor(entitlement: AccountEntitlement): Milestone | null {
  if (entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt)
    if (rem.ended) return 'expired'
    if (rem.kind === 'today' || rem.fullDays <= 1) return '1d'
    if (rem.fullDays <= 3) return '3d'
    if (rem.fullDays <= 7) return '7d'
    return null
  }
  if (entitlement.accessLevel === 'expired' && entitlement.trialEndsAt) {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt)
    if (rem.ended) return 'expired'
  }
  return null
}

function copyFor(milestone: Milestone): { title: string; message: string } {
  switch (milestone) {
    case '7d':
      return {
        title: 'Trial PRO kończy się wkrótce',
        message:
          'Twój Trial PRO kończy się za kilka dni. Wybierz plan, aby zachować pełny dostęp.',
      }
    case '3d':
      return {
        title: 'Trial PRO kończy się za 3 dni',
        message:
          'Wybierz plan, aby zachować pełny dostęp do funkcji. Twoje dane pozostaną dostępne.',
      }
    case '1d':
      return {
        title: 'Trial PRO kończy się dzisiaj',
        message: 'Wybierz plan, aby dalej tworzyć i obsługiwać zlecenia.',
      }
    case 'expired':
      return {
        title: 'Trial PRO zakończony',
        message:
          'Twoje dane pozostają bezpieczne i dostępne. Wybierz PRO, aby dalej tworzyć i obsługiwać zlecenia.',
      }
  }
}

/**
 * Deduplicated in-app trial reminders (7 / 3 / 1 / expired).
 * Client-side key prevents duplicate inserts across reloads.
 */
export async function ensureTrialNotifications(
  entitlement: AccountEntitlement,
): Promise<void> {
  const milestone = milestoneFor(entitlement)
  if (!milestone) return
  const subId = entitlement.subscriptionId ?? entitlement.billingAccountId ?? 'unknown'
  if (alreadyNotified(subId, milestone)) return

  const copy = copyFor(milestone)
  await notificationService.create({
    title: copy.title,
    message: copy.message,
    type: milestone === 'expired' ? 'warning' : 'info',
    entityType: 'subscription_trial',
    link: '/ustawienia/subskrypcja',
  })
  markNotified(subId, milestone)
}
