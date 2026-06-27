import { getConfig } from '@ghostpepe/config';

/** Thin client over the API's /internal/bot endpoints. */
function base(): string {
  return getConfig().API_BASE_URL.replace(/\/$/, '');
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-internal-token': getConfig().INTERNAL_API_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface PlanDTO {
  code: string;
  title: string;
  starsPrice: number;
  durationDays: number;
  trafficLimitBytes: string;
}

export interface SubscriptionDTO {
  hasSubscription: boolean;
  status?: string;
  plan?: string;
  expiresAt?: string;
  trafficLimitBytes?: string;
  trafficUsedBytes?: string;
  deviceLimit?: number;
  deviceCount?: number;
  importPageUrl?: string;
  profiles?: Array<{ code: string; label: string }>;
  userBlocked?: boolean;
}

export interface DeviceDTO {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
}

export interface InvoiceIntentDTO {
  invoicePayload: string;
  title: string;
  description: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
  starsAmount: number;
}

export const api = {
  upsertUser: (u: { telegramId: bigint; username?: string | null; firstName?: string | null; lastName?: string | null; languageCode?: string | null }) =>
    call('/internal/bot/users/upsert', 'POST', { ...u, telegramId: u.telegramId.toString() }),
  plans: () => call<PlanDTO[]>('/internal/bot/plans', 'GET'),
  subscription: (telegramId: bigint) => call<SubscriptionDTO>(`/internal/bot/users/${telegramId}/subscription`, 'GET'),
  devices: (telegramId: bigint) => call<DeviceDTO[]>(`/internal/bot/devices?telegramId=${telegramId}`, 'GET'),
  disableDevice: (telegramId: bigint, publicId: string) => call(`/internal/bot/devices/${publicId}/disable`, 'POST', { telegramId: telegramId.toString() }),
  createIntent: (telegramId: bigint, planCode: string) => call<InvoiceIntentDTO>('/internal/bot/payments/create-intent', 'POST', { telegramId: telegramId.toString(), planCode }),
  preCheckout: (invoicePayload: string) => call<{ ok: boolean }>('/internal/bot/payments/pre-checkout', 'POST', { invoicePayload }),
  successful: (p: { telegramId: bigint; invoicePayload: string; telegramPaymentChargeId: string; providerPaymentChargeId?: string | null; rawUpdate: unknown }) =>
    call<{ ok: boolean; importPageUrl: string; alreadyApplied: boolean }>('/internal/bot/payments/successful', 'POST', { ...p, telegramId: p.telegramId.toString() }),
};
