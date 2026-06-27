import type { Mode } from '@ghostpepe/shared';

/**
 * RU-direct routing (docs 02 §6, 06 §19). Used to generate both the Xray
 * routing block on exit nodes AND the Happ "onadd" routing profile.
 *
 * HARD RULES:
 *  - regular mode  => RU resources go DIRECT, everything else through proxy.
 *  - whitelist mode => NO local direct rules at all (everything via the tunnel).
 *  - never rely on the `.ru` TLD alone — many RU services live on .com/.net/CDN.
 */

/** Explicit RU domains that must stay direct even though they are not .ru. */
export const RU_EXTRA_DOMAINS: string[] = [
  'yandex.ru', 'ya.ru', 'yandex.net', 'yastatic.net', 'yandex.com',
  'sberbank.ru', 'sber.ru', 'sberbank.com', 'gosuslugi.ru', 'mos.ru',
  'vk.com', 'vk.ru', 'vkontakte.ru', 'userapi.com', 'vk-cdn.net', 'mail.ru',
  'ok.ru', 'wb.ru', 'wildberries.ru', 'ozon.ru', 'avito.ru', 'tinkoff.ru',
  'alfabank.ru', 'rt.ru', 'mts.ru', 'megafon.ru', 'beeline.ru', 'nalog.ru',
  'rutube.ru', 'kinopoisk.ru', '2gis.ru', 'dzen.ru', 'gismeteo.ru',
];

/** Geosite/geoip categories that map to "Russia". */
export const RU_GEOSITE = ['geosite:category-ru', 'geosite:yandex', 'geosite:category-gov-ru'];
export const RU_GEOIP = ['geoip:ru', 'geoip:private'];

export interface HappRoutingProfile {
  name: string;
  mode: Mode;
  rules: Array<{ type: string; value: string; outbound: 'direct' | 'proxy' | 'block' }>;
}

export function buildHappRoutingProfile(mode: Mode, serviceName = 'Ghost Pepe'): HappRoutingProfile {
  if (mode === 'whitelist') {
    // Whitelist: everything through the tunnel, no local direct. (docs 02 §7)
    return {
      name: `${serviceName} Whitelist (all proxy)`,
      mode,
      rules: [{ type: 'final', value: 'all', outbound: 'proxy' }],
    };
  }
  const rules: HappRoutingProfile['rules'] = [
    { type: 'ip', value: 'private', outbound: 'direct' },
    ...RU_GEOSITE.map((v) => ({ type: 'domain' as const, value: v, outbound: 'direct' as const })),
    ...RU_EXTRA_DOMAINS.map((v) => ({ type: 'domain' as const, value: `domain:${v}`, outbound: 'direct' as const })),
    ...RU_GEOIP.map((v) => ({ type: 'ip' as const, value: v, outbound: 'direct' as const })),
    { type: 'final', value: 'all', outbound: 'proxy' },
  ];
  return { name: `${serviceName} RU Direct`, mode, rules };
}

/** Build Xray routing.rules array for an exit node serving regular profiles. */
export function buildXrayRoutingRules(mode: Mode): unknown[] {
  if (mode === 'whitelist') {
    // Bridge/exit for whitelist: no RU direct; default outbound only.
    return [];
  }
  return [
    { type: 'field', ip: ['geoip:private', 'geoip:ru'], outboundTag: 'direct' },
    { type: 'field', domain: [...RU_GEOSITE, ...RU_EXTRA_DOMAINS.map((d) => `domain:${d}`)], outboundTag: 'direct' },
  ];
}

/** Domains used by smoke tests (docs 02 §9, 06 §19). */
export const SMOKE_DIRECT = ['yandex.ru', 'sberbank.ru', 'gosuslugi.ru', 'vk.com'];
export const SMOKE_PROXY = ['google.com', 'youtube.com'];

/** Encode a Happ routing profile to the happ://routing/onadd/<base64> link. */
export function encodeHappRoutingLink(profile: HappRoutingProfile): string {
  const json = JSON.stringify(profile);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return `happ://routing/onadd/${b64}`;
}
