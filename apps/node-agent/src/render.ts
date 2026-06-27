import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from '@ghostpepe/config';
import {
  renderXrayExitConfig,
  renderXrayBridgeConfig,
  renderHysteriaExitConfig,
  toYaml,
  type BridgeRoute,
  type XrayUser,
} from '@ghostpepe/vpn-config';
import { nodeEnvPrefix } from './node-env.js';
import type { DesiredState } from './control-client.js';

const OUT_DIR = process.env.AGENT_CONFIG_DIR ?? '/etc/ghostpepe';

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function realityServerParams(nodeCode: string) {
  const cfg = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(nodeCode);
  return {
    privateKey: cfg[`${p}_REALITY_PRIVATE_KEY`] ?? '',
    shortIds: [cfg[`${p}_REALITY_SHORT_ID`] ?? ''],
    serverNames: [cfg[`${p}_REALITY_SERVER_NAME`] ?? 'www.microsoft.com'],
    dest: `${cfg[`${p}_REALITY_SERVER_NAME`] ?? 'www.microsoft.com'}:443`,
  };
}

/**
 * Render Xray + Hysteria configs to disk from desired state (docs 06 §16).
 * Returns the file paths written so the caller can restart services.
 */
export function renderConfigs(state: DesiredState): { xrayPath?: string; hysteriaPaths: string[] } {
  const cfg = getConfig();
  const written: { xrayPath?: string; hysteriaPaths: string[] } = { hysteriaPaths: [] };
  const isBridge = state.role === 'whitelist_ingress' || state.role === 'mixed';

  if (isBridge && Object.keys(state.bridgeInbounds).length >= 0) {
    // Bridge: build a VLESS Reality inbound per exit, forwarding to that exit.
    const reality = realityServerParams(cfg.NODE_CODE);
    const routes: BridgeRoute[] = Object.entries(state.bridgeInbounds).map(([inboundTag, users], i) => {
      const exitRegion = inboundTag.endsWith('-de') ? 'de' : 'fi';
      const exitPrefix = exitRegion === 'de' ? 'DE' : 'FI';
      const env = getConfig() as unknown as Record<string, string>;
      return {
        inboundTag,
        listenPort: 11400 + i,
        users: users as XrayUser[],
        reality,
        exitHost: env[`${exitPrefix}_VLESS_DOMAIN`] ?? '',
        exitPort: 443,
        exitPublicKey: env[`${exitPrefix}_REALITY_PUBLIC_KEY`] ?? '',
        exitShortId: env[`${exitPrefix}_REALITY_SHORT_ID`] ?? '',
        exitServerName: env[`${exitPrefix}_REALITY_SERVER_NAME`] ?? 'www.microsoft.com',
      };
    });
    const xray = renderXrayBridgeConfig(routes);
    written.xrayPath = `${OUT_DIR}/xray/config.json`;
    write(written.xrayPath, JSON.stringify(xray, null, 2));
  } else {
    // Exit node: regular VLESS Reality inbound with all active users.
    const xray = renderXrayExitConfig({
      listenPort: cfg.PORT_MODE === 'B' ? 8443 : 1443,
      apiPort: 10085,
      users: state.vlessUsers.map((u) => ({ uuid: u.uuid, email: u.email, flow: 'xtls-rprx-vision' })),
      reality: realityServerParams(cfg.NODE_CODE),
      mode: 'regular',
    });
    written.xrayPath = `${OUT_DIR}/xray/config.json`;
    write(written.xrayPath, JSON.stringify(xray, null, 2));
  }

  // Hysteria exit config (auth delegated to node-agent local endpoint).
  const env = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(cfg.NODE_CODE);
  const hyExit = renderHysteriaExitConfig({
    listenPort: 443,
    authUrl: `http://127.0.0.1:${cfg.HYSTERIA_AUTH_PORT}/hysteria/auth`,
    trafficStatsListen: cfg.HYSTERIA_STATS_ADDR,
    trafficStatsSecret: env[`${p}_HYSTERIA_TRAFFIC_API_SECRET`] ?? 'changeme',
    tlsCert: `${OUT_DIR}/certs/hysteria.crt`,
    tlsKey: `${OUT_DIR}/certs/hysteria.key`,
    obfsPassword: env[`${p}_HYSTERIA_OBFS_PASSWORD`] || undefined,
  });
  const hyPath = `${OUT_DIR}/hysteria/config.yaml`;
  write(hyPath, toYaml(hyExit) + '\n');
  written.hysteriaPaths.push(hyPath);

  return written;
}
