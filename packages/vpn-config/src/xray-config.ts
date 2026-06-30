import { buildXrayRoutingRules } from '@ghostpepe/routing-rules';
import type { Mode } from '@ghostpepe/shared';

export interface XrayUser {
  uuid: string;
  email: string; // stable client identifier for stats
  flow?: string;
  profileCode?: string;
}

export interface RealityServerParams {
  privateKey: string;
  shortIds: string[];
  serverNames: string[];
  /** real TLS target xray borrows the handshake from, e.g. www.cloudflare.com:443 */
  dest: string;
}

export interface XrayExitParams {
  listenPort: number;
  apiPort: number; // localhost only
  users: XrayUser[];
  reality: RealityServerParams;
  mode: Mode;
}

/**
 * Regular VLESS+Reality exit (docs 06 §17.1). Stats enabled, API on localhost.
 */
export function renderXrayExitConfig(p: XrayExitParams): Record<string, unknown> {
  return {
    log: { loglevel: 'warning' },
    api: { tag: 'api', services: ['HandlerService', 'StatsService'] },
    stats: {},
    policy: {
      levels: { '0': { statsUserUplink: true, statsUserDownlink: true } },
      system: { statsInboundUplink: true, statsInboundDownlink: true },
    },
    inbounds: [
      {
        listen: '127.0.0.1',
        port: p.apiPort,
        protocol: 'dokodemo-door',
        settings: { address: '127.0.0.1' },
        tag: 'api',
      },
      {
        listen: '0.0.0.0',
        port: p.listenPort,
        protocol: 'vless',
        tag: 'vless-reality',
        settings: {
          clients: p.users.map((u) => ({ id: u.uuid, email: u.email, flow: u.flow ?? 'xtls-rprx-vision' })),
          decryption: 'none',
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            show: false,
            dest: p.reality.dest,
            xver: 0,
            serverNames: p.reality.serverNames,
            privateKey: p.reality.privateKey,
            shortIds: p.reality.shortIds,
          },
        },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
    ],
    outbounds: [
      { protocol: 'freedom', tag: 'direct' },
      { protocol: 'blackhole', tag: 'blocked' },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', inboundTag: ['api'], outboundTag: 'api' },
        ...(buildXrayRoutingRules(p.mode) as Array<Record<string, unknown>>),
        { type: 'field', outboundTag: 'blocked', ip: ['geoip:private'], domain: ['geosite:category-ads-all'] },
      ],
    },
  };
}

export interface BridgeRoute {
  /** public bridge inbound tag, e.g. wl-vless */
  inboundTag: string;
  listenPort: number;
  users: XrayUser[];
  reality: RealityServerParams;
  /** exit endpoint this inbound forwards to (the real FI/DE VLESS exit). */
  exitHost: string;
  exitPort: number;
  exitPublicKey: string;
  exitShortId: string;
  exitServerName: string;
}

export interface BridgeSocksRoute {
  inboundTag: string;
  listenPort: number;
  exitHost: string;
  exitPort: number;
  exitUuid: string;
  exitPublicKey: string;
  exitShortId: string;
  exitServerName: string;
}

/**
 * Whitelist bridge on Yandex Cloud (docs 06 §17.2, §16.3). Each inbound is a
 * VLESS Reality entry that forwards to the matching FI/DE exit via a VLESS
 * outbound — traffic leaves through FI/DE, never directly out of YC.
 */
export function renderXrayBridgeConfig(routes: BridgeRoute[], socksRoutes: BridgeSocksRoute[] = []): Record<string, unknown> {
  const clientEmail = (u: XrayUser): string => (u.profileCode ? `${u.email}:profile:${u.profileCode}` : u.email);
  const routeTag = (r: BridgeRoute, u: XrayUser): string => {
    const profile = u.profileCode ?? 'user';
    return `out-${r.inboundTag}-${profile}-${u.uuid.slice(0, 8)}`;
  };

  const inboundMap = new Map<string, BridgeRoute & { users: XrayUser[] }>();
  for (const route of routes) {
    const key = `${route.inboundTag}:${route.listenPort}`;
    const existing = inboundMap.get(key);
    if (existing) {
      existing.users.push(...route.users);
    } else {
      inboundMap.set(key, { ...route, users: [...route.users] });
    }
  }

  const inbounds = [...inboundMap.values()].map((r) => ({
      listen: '0.0.0.0',
      port: r.listenPort,
      protocol: 'vless',
      tag: r.inboundTag,
      settings: {
        clients: r.users.map((u) => ({
          id: u.uuid,
          email: clientEmail(u),
          flow: u.flow ?? 'xtls-rprx-vision',
        })),
        decryption: 'none',
      },
      streamSettings: {
        network: 'tcp',
        security: 'reality',
        realitySettings: {
          show: false,
          dest: r.reality.dest,
          serverNames: r.reality.serverNames,
          privateKey: r.reality.privateKey,
          shortIds: r.reality.shortIds,
        },
      },
    }));

  const socksInbounds = socksRoutes.map((r) => ({
    listen: '127.0.0.1',
    port: r.listenPort,
    protocol: 'socks',
    tag: r.inboundTag,
    settings: { auth: 'noauth', udp: true },
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
  }));

  const outbounds = routes.flatMap((r) => r.users.map((u) => ({
    protocol: 'vless',
    tag: routeTag(r, u),
    settings: {
      vnext: [{
        address: r.exitHost,
        port: r.exitPort,
        users: [{ id: u.uuid, encryption: 'none', flow: u.flow ?? 'xtls-rprx-vision' }],
      }],
    },
    streamSettings: {
      network: 'tcp',
      security: 'reality',
      realitySettings: {
        publicKey: r.exitPublicKey,
        shortId: r.exitShortId,
        serverName: r.exitServerName,
        fingerprint: 'chrome',
      },
    },
  })));

  const socksOutbounds = socksRoutes.map((r) => ({
    protocol: 'vless',
    tag: `out-${r.inboundTag}`,
    settings: {
      vnext: [{
        address: r.exitHost,
        port: r.exitPort,
        users: [{ id: r.exitUuid, encryption: 'none', flow: 'xtls-rprx-vision' }],
      }],
    },
    streamSettings: {
      network: 'tcp',
      security: 'reality',
      realitySettings: {
        publicKey: r.exitPublicKey,
        shortId: r.exitShortId,
        serverName: r.exitServerName,
        fingerprint: 'chrome',
      },
    },
  }));

  return {
    log: { loglevel: 'warning' },
    inbounds: [...inbounds, ...socksInbounds],
    outbounds: [...outbounds, ...socksOutbounds, { protocol: 'freedom', tag: 'direct' }, { protocol: 'blackhole', tag: 'blocked' }],
    routing: {
      rules: [
        ...routes.flatMap((r) => r.users.map((u) => ({
          type: 'field',
          inboundTag: [r.inboundTag],
          user: [clientEmail(u)],
          outboundTag: routeTag(r, u),
        }))),
        ...socksRoutes.map((r) => ({
          type: 'field',
          inboundTag: [r.inboundTag],
          outboundTag: `out-${r.inboundTag}`,
        })),
      ],
    },
  };
}
