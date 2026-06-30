/**
 * Hysteria2 server config renderers (docs 06 §18, 02 §5).
 * Auth is delegated to node-agent HTTP endpoint, which checks the central
 * backend. Traffic Stats API listens on localhost only.
 */

export interface HysteriaExitParams {
  listenPort: number;
  /** node-agent local auth endpoint, e.g. http://127.0.0.1:18081/hysteria/auth */
  authUrl: string;
  trafficStatsListen: string; // 127.0.0.1:9999
  trafficStatsSecret: string;
  tlsCert: string;
  tlsKey: string;
  obfsPassword?: string;
  /** masquerade target to look like a normal HTTPS site */
  masqueradeUrl?: string;
}

function hysteriaPerformanceOptions(): Record<string, unknown> {
  return {
    bandwidth: { up: '1 gbps', down: '1 gbps' },
    ignoreClientBandwidth: true,
    quic: {
      initStreamReceiveWindow: 26843545,
      maxStreamReceiveWindow: 26843545,
      initConnReceiveWindow: 67108864,
      maxConnReceiveWindow: 67108864,
      maxIdleTimeout: '60s',
      maxIncomingStreams: 2048,
      disablePathMTUDiscovery: false,
    },
  };
}

export function renderHysteriaExitConfig(p: HysteriaExitParams): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    listen: `:${p.listenPort}`,
    ...hysteriaPerformanceOptions(),
    tls: { cert: p.tlsCert, key: p.tlsKey },
    auth: { type: 'http', http: { url: p.authUrl, insecure: false } },
    trafficStats: { listen: p.trafficStatsListen, secret: p.trafficStatsSecret },
    masquerade: { type: 'proxy', proxy: { url: p.masqueradeUrl ?? 'https://news.ycombinator.com/', rewriteHost: true } },
  };
  if (p.obfsPassword) {
    cfg.obfs = { type: 'salamander', salamander: { password: p.obfsPassword } };
  }
  return cfg;
}

export interface HysteriaBridgeRoute {
  /** logical inbound name e.g. wl-hysteria-to-fi */
  name: string;
  listenPort: number;
  authUrl: string;
  trafficStatsListen: string;
  trafficStatsSecret: string;
  tlsCert: string;
  tlsKey: string;
  obfsPassword?: string;
  /** local SOCKS listener that forwards to the selected FI/DE exit */
  socksAddr: string;
}

/**
 * Hysteria whitelist bridge (docs 06 §18.2). The bridge accepts the client and
 * forwards through an outbound SOCKS/relay that points at the FI/DE Hysteria
 * exit so traffic egresses through the exit, NOT directly from Yandex Cloud.
 *
 * For Hysteria2 the bridge uses the `outbounds` direct-to-exit relay: each
 * bridge instance is a separate process/port with an `acl`/`outbounds` chain to
 * the selected exit. See docs/runbooks/bridge-hysteria.md for the proof.
 */
export function renderHysteriaBridgeConfig(r: HysteriaBridgeRoute): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    listen: `:${r.listenPort}`,
    ...hysteriaPerformanceOptions(),
    tls: { cert: r.tlsCert, key: r.tlsKey },
    auth: { type: 'http', http: { url: r.authUrl, insecure: false } },
    trafficStats: { listen: r.trafficStatsListen, secret: r.trafficStatsSecret },
    // Hysteria server supports SOCKS outbounds, not Hysteria2 outbounds.
    // Xray owns the local SOCKS listener and tunnels to the selected exit.
    outbounds: [
      {
        name: 'exit',
        type: 'socks5',
        socks5: { addr: r.socksAddr },
      },
    ],
    acl: { inline: ['exit(all)'] },
  };
  if (r.obfsPassword) {
    cfg.obfs = { type: 'salamander', salamander: { password: r.obfsPassword } };
  }
  return cfg;
}
