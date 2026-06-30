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

export function isStableHappProfile(protocol: string, mode: string): boolean {
  return mode === 'whitelist' && (protocol === 'vless' || protocol === 'hysteria');
}

const PROFILE_ORDER = [
  'fi_hysteria_regular',
  'fi_vless_regular',
  'de_hysteria_regular',
  'de_vless_regular',
  'fi_hysteria_whitelist',
  'fi_vless_whitelist',
  'de_hysteria_whitelist',
  'de_vless_whitelist',
];

export function compareSubscriptionProfiles(a: string, b: string): number {
  const ai = PROFILE_ORDER.indexOf(a);
  const bi = PROFILE_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

export function subscriptionNoticeLines(): string[] {
  return [
    '🇪🇺 LTE ОБХОДЫ НЕ ГАРАНТИРОВАНЫ - в конце списка стран👇',
    '🎬 YT - YouTube без рекламы',
    '✅ Torrent - на сервере разрешены торренты',
    '💬 Поддержка @ghostpepe_support',
    '👻 Ghost Pepe VPN',
  ];
}

export function happHysteriaPinSha256(): undefined {
  return undefined;
}

export function hysteriaPortHopForProfile(
  profileCode: string,
  mode: string,
): { range?: string; interval?: number } {
  const cfg = getConfig();
  if (mode === 'regular' && cfg.HYSTERIA_PORT_HOP_RANGE.length > 0) {
    return { range: cfg.HYSTERIA_PORT_HOP_RANGE, interval: cfg.HYSTERIA_PORT_HOP_INTERVAL };
  }
  if (profileCode === 'fi_hysteria_whitelist' && cfg.WL_HYSTERIA_FI_PORT_HOP_RANGE.length > 0) {
    return { range: cfg.WL_HYSTERIA_FI_PORT_HOP_RANGE, interval: cfg.WL_HYSTERIA_PORT_HOP_INTERVAL };
  }
  if (profileCode === 'de_hysteria_whitelist' && cfg.WL_HYSTERIA_DE_PORT_HOP_RANGE.length > 0) {
    return { range: cfg.WL_HYSTERIA_DE_PORT_HOP_RANGE, interval: cfg.WL_HYSTERIA_PORT_HOP_INTERVAL };
  }
  return {};
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
  // Keep regular profiles first and whitelist/LTE-style profiles at the end.
  const ordered = [...device.credentials].sort((a, b) => compareSubscriptionProfiles(a.profileCode, b.profileCode));
  for (const cred of ordered) {
    const profile = profileByCode.get(cred.profileCode);
    if (!profile || !profile.isActive) continue;
    if (cfg.HAPP_STABLE_ONLY && !isStableHappProfile(cred.protocol, cred.mode)) continue;
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
      const portHop = hysteriaPortHopForProfile(cred.profileCode, cred.mode);
      lines.push(
        buildHysteriaLink({
          auth,
          host: profile.endpointHost,
          port: profile.endpointPort,
          serverName: cfg.HAPP_HYSTERIA_SERVER_NAME || cfg.SUB_DOMAIN,
          obfsPassword: hysteriaObfs(ingressNodeCode),
          pinSha256: happHysteriaPinSha256(),
          portHopRange: portHop.range,
          hopInterval: portHop.interval,
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
    'subscription-ping-onopen-enabled': '1',
    'subscriptions-sort-type': 'none',
    routing: routingLink,
  };

  const headerBlock = [
    `#profile-title: ${cfg.HAPP_SUBSCRIPTION_NAME}`,
    `#subscription-userinfo: ${userInfo}`,
    `#support-url: ${cfg.HAPP_SUPPORT_URL}`,
    `#profile-update-interval: ${cfg.HAPP_PROFILE_UPDATE_INTERVAL}`,
    '#subscription-ping-onopen-enabled: 1',
    '#subscriptions-sort-type: none',
    '',
    ...subscriptionNoticeLines().map((line) => `# ${line}`),
  ].join('\n');

  return {
    ok: true,
    result: { headers, body: `${headerBlock}\n\n${lines.join('\n')}\n` },
  };
}
