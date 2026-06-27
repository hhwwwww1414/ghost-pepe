import { getConfig } from '@ghostpepe/config';
import { hashToken, randomToken } from '@ghostpepe/shared';

/** Hash any public token before storing/looking up (docs 03 §17). */
export function tokenHash(raw: string): string {
  return hashToken(raw, getConfig().TOKEN_HASH_SECRET);
}

/** Public subscription-page token (the /s/:token link). */
export function newPublicPageToken(): string {
  return `sub_${randomToken(18)}`;
}

/** Per-device subscription body token (the /sub/:token link). */
export function newDeviceSubscriptionToken(): string {
  return `devsub_${randomToken(18)}`;
}
