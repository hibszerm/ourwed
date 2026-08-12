/**
 * Provider-agnostic billing boundary.
 * No Stripe/Paddle SDK — unavailable until a provider is connected.
 */

export type CheckoutInterval = 'month' | 'year'

export type StartCheckoutInput = {
  billingAccountId: string
  plan: 'pro'
  interval: CheckoutInterval
}

export type BillingProviderResult =
  | { ok: true; url?: string }
  | { ok: false; code: 'payments_unavailable'; message: string }

export interface BillingProviderAdapter {
  createCheckout(input: StartCheckoutInput): Promise<BillingProviderResult>
  createPortal(billingAccountId: string): Promise<BillingProviderResult>
  cancelAtPeriodEnd(billingAccountId: string): Promise<BillingProviderResult>
  resumeSubscription(billingAccountId: string): Promise<BillingProviderResult>
}

const UNAVAILABLE: BillingProviderResult = {
  ok: false,
  code: 'payments_unavailable',
  message: 'Płatności online będą dostępne wkrótce.',
}

export class UnavailableBillingProvider implements BillingProviderAdapter {
  async createCheckout(): Promise<BillingProviderResult> {
    return UNAVAILABLE
  }
  async createPortal(): Promise<BillingProviderResult> {
    return UNAVAILABLE
  }
  async cancelAtPeriodEnd(): Promise<BillingProviderResult> {
    return UNAVAILABLE
  }
  async resumeSubscription(): Promise<BillingProviderResult> {
    return UNAVAILABLE
  }
}

let adapter: BillingProviderAdapter = new UnavailableBillingProvider()

export function getBillingProvider(): BillingProviderAdapter {
  return adapter
}

/** Test/future wiring only — production stays unavailable until Phase 2 provider. */
export function setBillingProvider(next: BillingProviderAdapter) {
  adapter = next
}

export async function startCheckout(input: StartCheckoutInput) {
  return getBillingProvider().createCheckout(input)
}

export async function openBillingPortal(billingAccountId: string) {
  return getBillingProvider().createPortal(billingAccountId)
}

export async function cancelAtPeriodEnd(billingAccountId: string) {
  return getBillingProvider().cancelAtPeriodEnd(billingAccountId)
}

export async function resumeSubscription(billingAccountId: string) {
  return getBillingProvider().resumeSubscription(billingAccountId)
}
