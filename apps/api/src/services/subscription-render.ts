import { getConfig } from '@ghostpepe/config';
import { prisma } from '@ghostpepe/db';
import {
  DEVICE_STATUS,
  decryptSecret,
  buildSubscriptionUserInfo,
} from '@ghostpepe/shared';
import { buildVlessLink, buildHysteriaLink } from '@ghostpepe/vpn-config';
import { buildHappRoutingProfile, encodeHappRoutingLink } from '@ghostpepe/routing-rules';
import { realityClientParams, hysteriaObfs } from '../lib/reality.js';
import { evaluateAccess } from './access.js';

export interface RenderedSubscription {
  headers: Record<string, string>;
  body: string;
}

/**
 * Build the Happ subscription body for one device (docs 03 §10–12).
 * Returns null with a reason when access is denied — caller maps to 403.
 * Only active credentials of active devices for serving subscriptions are
 * included; whitelist links use the WL domain, never the FI/DE endpoint.
 */
export async function renderDeviceSubscription(
  publicDeviceId: string,
): Promise<{ ok: true; result: RenderedSubscription } | { ok: false; code: string; reason: string }> {
  const cfg = getConfig();
  const device = await prisma.device.findUnique({
    where: { publicDeviceId },
    include: {
      user: true,
      subscription: true,
      credentials: { where: { status: DEVICE_STATUS.ACTIVE }, include: { node: true } },
    },
  });

  if (!device) return { ok: false, code: 'NOT_FOUND', reason: 'Ссылка устарела. Получите новую ссылку в боте.' };
  if (device.status !== DEVICE_STATUS.ACTIVE) {
    return { ok: false, code: 'DEVICE_DISABLED', reason: 'Устройство отключено.' };
  }

  const access = evaluateAccess(device.user, device.subscription);
  if (!access.ok) return { ok: false, code: access.code ?? 'INACTIVE', reason: access.reason ?? 'Нет доступа.' };

  // Profile endpoints come from node_profiles (source of truth for host/port).
  const profiles = await prisma.nodeProfile.findMany({
    where: { profileCode: { in: device.credentials.map((c) => c.profileCode) } },
  });
  const profileByCode = new Map(profiles.map((p) => [p.profileCode, p]));

  const lines: string[] = [];
  // Stable order: FI regular, FI hysteria, FI wl..., DE...
  const ordered = [...device.credentials].sort((a, b) => a.profileCode.localeCompare(b.profileCode));
  for (const cred of ordered) {
    const profile = profileByCode.get(cred.profileCode);
    if (!profile || !profile.isActive) continue;
    const ingressNodeCode = cred.node.code;

    if (cred.protocol === 'vless' && cred.vlessUuidEncrypted) {
      const uuid = decryptSecret(cred.vlessUuidEncrypted, cfg.ENCRYPTION_MASTER_KEY);
      const reality = realityClientParams(ingressNodeCode);
      lines.push(
        buildVlessLink({
          uuid,
          host: profile.endpointHost,
          port: profile.endpointPort,
          publicKey: reality.publicKey,
          shortId: reality.shortId,
          serverName: reality.serverName,
          label: profile.label,
        }),
      );
    } else if (cred.protocol === 'hysteria' && cred.hysteriaAuthTokenEncrypted) {
      const auth = decryptSecret(cred.hysteriaAuthTokenEncrypted, cfg.ENCRYPTION_MASTER_KEY);
      lines.push(
        buildHysteriaLink({
          auth,
          host: profile.endpointHost,
          port: profile.endpointPort,
          serverName: profile.endpointHost,
          obfsPassword: hysteriaObfs(ingressNodeCode),
          insecure: true,
          label: profile.label,
        }),
      );
    }
  }

  const sub = device.subscription;
  const expireUnix = Math.floor(sub.expiresAt.getTime() / 1000);
  const total = sub.trafficLimitBytes;
  const used = sub.trafficUsedBytes;
  // We track combined used; split is informational for Happ.
  const userInfo = buildSubscriptionUserInfo({
    upload: used / 2n,
    download: used - used / 2n,
    total,
    expireUnix,
  });

  // RU-direct routing (regular). Whitelist links carry no local direct.
  const routingLink = encodeHappRoutingLink(buildHappRoutingProfile('regular', cfg.HAPP_SUBSCRIPTION_NAME));

  const headers: Record<string, string> = {
    'content-type': 'text/plain; charset=utf-8',
    'profile-title': cfg.HAPP_SUBSCRIPTION_NAME,
    'profile-update-interval': String(cfg.HAPP_PROFILE_UPDATE_INTERVAL),
    'subscription-userinfo': userInfo,
    'support-url': cfg.HAPP_SUPPORT_URL,
    routing: routingLink,
  };

  const headerBlock = [
    `#profile-title: ${cfg.HAPP_SUBSCRIPTION_NAME}`,
    `#subscription-userinfo: ${userInfo}`,
    `#support-url: ${cfg.HAPP_SUPPORT_URL}`,
    `#profile-update-interval: ${cfg.HAPP_PROFILE_UPDATE_INTERVAL}`,
  ].join('\n');

  return {
    ok: true,
    result: { headers, body: `${headerBlock}\n\n${lines.join('\n')}\n` },
  };
}
