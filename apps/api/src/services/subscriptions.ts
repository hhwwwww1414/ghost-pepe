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

function normalizeBaseUrl(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`invalid_${label}:${raw || '<empty>'}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`invalid_${label}:${raw}`);
  }
  return url.toString().replace(/\/$/, '');
}

/** Sub-page origin (https://sub…/s/{token}). */
export function subPageBaseUrl(): string {
  const cfg = getConfig();
  return normalizeBaseUrl(cfg.PUBLIC_BASE_URL || cfg.API_BASE_URL, 'sub_page_base_url');
}

/** API origin (https://api…/sub/{deviceToken}, /api/…). */
export function apiBaseUrl(): string {
  const cfg = getConfig();
  return normalizeBaseUrl(cfg.API_BASE_URL, 'api_base_url');
}

/** @deprecated Use subPageBaseUrl() or apiBaseUrl() explicitly. */
export function publicBaseUrl(): string {
  return subPageBaseUrl();
}

export function buildImportPageUrl(rawPageToken: string): string {
  return `${subPageBaseUrl()}/s/${rawPageToken}`;
}

export function buildSubscriptionBodyUrl(publicDeviceId: string): string {
  return `${apiBaseUrl()}/sub/${publicDeviceId}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function buildGenericHappAddUrl(subscriptionBodyUrl: string): string {
  return `happ:add/${Buffer.from(subscriptionBodyUrl, 'utf8').toString('base64url')}`;
}

export async function buildHappImportUrl(
  subscriptionBodyUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl('https://crypto.happ.su/api-v2.php', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: subscriptionBodyUrl }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return buildGenericHappAddUrl(subscriptionBodyUrl);
    const body = await res.json() as { encrypted_link?: unknown };
    if (typeof body.encrypted_link === 'string' && body.encrypted_link.startsWith('happ://crypt')) {
      return body.encrypted_link;
    }
  } catch {
    // Copy-link fallback still works when Happ's crypto service is unavailable.
  }
  return buildGenericHappAddUrl(subscriptionBodyUrl);
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
