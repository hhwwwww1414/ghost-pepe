import { getConfig } from '@ghostpepe/config';
import { prisma } from '@ghostpepe/db';
import { SUBSCRIPTION_STATUS } from '@ghostpepe/shared';
import { kvGet, kvSet } from '../lib/kv.js';
import { newPublicPageToken, tokenHash } from '../lib/tokens.js';

const PAGE_TOKEN_TTL = 60 * 60 * 24 * 90; // 90 days

/**
 * Return the raw public page token for a subscription, reproducing the /s/ link.
 * Stored hashed in DB (revocable); raw cached in KV. If the cache is gone we
 * rotate the token (updates the stored hash) so the link stays issuable.
 */
export async function getOrIssuePageToken(subscriptionId: string): Promise<string> {
  const cacheKey = `pagetoken:${subscriptionId}`;
  const cached = await kvGet(cacheKey);
  if (cached) return cached;

  const raw = newPublicPageToken();
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { publicPageTokenHash: tokenHash(raw) },
  });
  await kvSet(cacheKey, raw, PAGE_TOKEN_TTL);
  return raw;
}

export function buildImportPageUrl(rawPageToken: string): string {
  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}/s/${rawPageToken}`;
}

/** Find a subscription by its public page token (hash lookup). */
export async function findSubscriptionByPageToken(rawToken: string) {
  return prisma.subscription.findUnique({
    where: { publicPageTokenHash: tokenHash(rawToken) },
    include: { user: true, plan: true },
  });
}

/** The user's current (most recent) subscription. */
export async function currentSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
}

/** Recompute and persist status from dates/traffic (used by workers + reads). */
export async function refreshSubscriptionStatus(subscriptionId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;
  if ([SUBSCRIPTION_STATUS.BLOCKED, SUBSCRIPTION_STATUS.REFUNDED].includes(sub.status as never)) return;
  let status: string = sub.status;
  const now = new Date();
  if (sub.expiresAt <= now) status = SUBSCRIPTION_STATUS.EXPIRED;
  else if (sub.trafficLimitBytes > 0n && sub.trafficUsedBytes >= sub.trafficLimitBytes)
    status = SUBSCRIPTION_STATUS.TRAFFIC_LIMITED;
  else if (sub.status !== SUBSCRIPTION_STATUS.TRIAL) status = SUBSCRIPTION_STATUS.ACTIVE;
  if (status !== sub.status) {
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { status } });
  }
}
