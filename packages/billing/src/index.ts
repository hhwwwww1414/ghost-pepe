import { randomToken } from '@ghostpepe/shared';

/**
 * Telegram Stars billing helpers (docs 05 §3, 06 §13.1).
 * currency = XTR, provider_token empty. Access only after successful_payment.
 */

export const STARS_CURRENCY = 'XTR';

export interface InvoiceIntent {
  payload: string;
  telegramId: bigint;
  planId: string;
  starsAmount: number;
  currency: 'XTR';
  title: string;
  description: string;
}

/** Unique, parseable invoice payload tying the Telegram update to an intent. */
export function buildInvoicePayload(telegramId: bigint, planCode: string): string {
  return `gp:${telegramId}:${planCode}:${randomToken(12)}`;
}

export function parseInvoicePayload(payload: string): { telegramId: bigint; planCode: string } | null {
  const m = payload.match(/^gp:(\d+):([^:]+):/);
  if (!m) return null;
  return { telegramId: BigInt(m[1]!), planCode: m[2]! };
}

/**
 * Compute the new subscription expiry when a payment is applied.
 * If the subscription is still active, extend from its current expiry;
 * otherwise extend from now (docs 05 §5).
 */
export function computeNewExpiry(currentExpiry: Date | null, durationDays: number, now = new Date()): Date {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

/** Stars price for a plan rendered to the Telegram invoice prices array. */
export function buildStarsPrices(starsAmount: number, label: string): Array<{ label: string; amount: number }> {
  // For XTR the amount is the number of Stars (not multiplied by 100).
  return [{ label, amount: starsAmount }];
}
