import { SUBSCRIPTION_STATUS, NON_SERVING_SUBSCRIPTION_STATUSES, ERROR_CODES } from '@ghostpepe/shared';
import type { Subscription, User } from '@ghostpepe/db';

export interface AccessResult {
  ok: boolean;
  code?: string;
  reason?: string;
}

/**
 * Single source of truth for "may this subscription be served working
 * credentials right now?" (docs 01 §10, 04 §8). Used by the subscription body
 * endpoint, the Hysteria auth endpoint and node-agent desired-state.
 */
export function evaluateAccess(user: Pick<User, 'status'>, sub: Pick<Subscription, 'status' | 'expiresAt' | 'trafficLimitBytes' | 'trafficUsedBytes'>, now = new Date()): AccessResult {
  if (user.status === 'blocked') {
    return { ok: false, code: ERROR_CODES.USER_BLOCKED, reason: 'Доступ ограничен. Напишите в поддержку.' };
  }
  if (NON_SERVING_SUBSCRIPTION_STATUSES.includes(sub.status as never)) {
    if (sub.status === SUBSCRIPTION_STATUS.TRAFFIC_LIMITED) {
      return { ok: false, code: 'TRAFFIC_LIMITED', reason: 'Лимит трафика исчерпан. Продлите подписку.' };
    }
    if (sub.status === SUBSCRIPTION_STATUS.EXPIRED) {
      return { ok: false, code: ERROR_CODES.SUBSCRIPTION_EXPIRED, reason: 'Подписка закончилась. Продлите её в боте.' };
    }
    return { ok: false, code: ERROR_CODES.SUBSCRIPTION_INACTIVE, reason: 'Подписка неактивна.' };
  }
  if (sub.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, code: ERROR_CODES.SUBSCRIPTION_EXPIRED, reason: 'Подписка закончилась. Продлите её в боте.' };
  }
  if (sub.trafficLimitBytes > 0n && sub.trafficUsedBytes >= sub.trafficLimitBytes) {
    return { ok: false, code: 'TRAFFIC_LIMITED', reason: 'Лимит трафика исчерпан. Продлите подписку.' };
  }
  return { ok: true };
}
