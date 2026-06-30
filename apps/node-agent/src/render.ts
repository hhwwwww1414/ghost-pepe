import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from '@ghostpepe/config';
import {
  renderXrayExitConfig,
  renderXrayBridgeConfig,
  renderHysteriaExitConfig,
  renderHysteriaBridgeConfig,
  toYaml,
  type BridgeRoute,
  type BridgeSocksRoute,
  type HysteriaBridgeRoute,
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
    serverNames: [cfg[`${p}_REALITY_SERVER_NAME`] ?? 'www.cloudflare.com'],
    dest: `${cfg[`${p}_REALITY_SERVER_NAME`] ?? 'www.cloudflare.com'}:443`,
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
    // Bridge: HAProxy exposes one public TCP/443 Reality entry and forwards it
    // to 11400, so all whitelist users are accepted on that single inbound and
    // routed to FI/DE by the credential profile.
    const reality = realityServerParams(cfg.NODE_CODE);
    const env = getConfig() as unknown as Record<string, string>;
    const routes: BridgeRoute[] = Object.entries(state.bridgeInbounds).map(([inboundTag, users]) => {
      const exitPrefix = inboundTag.endsWith('-to-de') ? 'DE' : 'FI';
      return {
        inboundTag: 'wl-vless',
        listenPort: 11400,
        users: users as XrayUser[],
        reality,
        exitHost: env[`${exitPrefix}_VLESS_DOMAIN`] ?? '',
        exitPort: 443,
        exitPublicKey: env[`${exitPrefix}_REALITY_PUBLIC_KEY`] ?? '',
        exitShortId: env[`${exitPrefix}_REALITY_SHORT_ID`] ?? '',
        exitServerName: env[`${exitPrefix}_REALITY_SERVER_NAME`] ?? 'www.cloudflare.com',
      };
    });
    const socksRoutes: BridgeSocksRoute[] = state.hysteriaBridgeRoutes.map((route) => {
      const exitPrefix = route.exitRegion === 'de' ? 'DE' : 'FI';
      return {
        inboundTag: `hy-socks-to-${route.exitRegion}`,
        listenPort: route.exitRegion === 'de' ? 11501 : 11500,
        exitHost: env[`${exitPrefix}_VLESS_DOMAIN`] ?? '',
        exitPort: 443,
        exitUuid: env[`${exitPrefix}_HYSTERIA_BRIDGE_VLESS_UUID`] ?? '',
        exitPublicKey: env[`${exitPrefix}_REALITY_PUBLIC_KEY`] ?? '',
        exitShortId: env[`${exitPrefix}_REALITY_SHORT_ID`] ?? '',
        exitServerName: env[`${exitPrefix}_REALITY_SERVER_NAME`] ?? 'www.cloudflare.com',
      };
    });
    const xray = renderXrayBridgeConfig(routes, socksRoutes);
    written.xrayPath = `${OUT_DIR}/xray/config.json`;
    write(written.xrayPath, JSON.stringify(xray, null, 2));
  } else {
    // Exit node: regular VLESS Reality inbound with all active users.
    const env = getConfig() as unknown as Record<string, string>;
    const p = nodeEnvPrefix(cfg.NODE_CODE);
    const users = state.vlessUsers.map((u) => ({ uuid: u.uuid, email: u.email, flow: 'xtls-rprx-vision' }));
    const bridgeUuid = env[`${p}_HYSTERIA_BRIDGE_VLESS_UUID`];
    if (bridgeUuid) {
      users.push({ uuid: bridgeUuid, email: `bridge:hysteria:${cfg.NODE_CODE}`, flow: 'xtls-rprx-vision' });
    }
    const xray = renderXrayExitConfig({
      listenPort: cfg.PORT_MODE === 'B' ? 8443 : 1443,
      apiPort: 10085,
      users,
      reality: realityServerParams(cfg.NODE_CODE),
      mode: 'regular',
    });
    written.xrayPath = `${OUT_DIR}/xray/config.json`;
    write(written.xrayPath, JSON.stringify(xray, null, 2));
  }

  const env = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(cfg.NODE_CODE);
  if (isBridge) {
    for (const route of state.hysteriaBridgeRoutes) {
      const hyBridge: HysteriaBridgeRoute = {
        name: route.name,
        listenPort: route.listenPort,
        authUrl: `http://127.0.0.1:${cfg.HYSTERIA_AUTH_PORT}/hysteria/auth`,
        trafficStatsListen: route.exitRegion === 'de' ? '127.0.0.1:10000' : cfg.HYSTERIA_STATS_ADDR,
        trafficStatsSecret: env[`${p}_HYSTERIA_TRAFFIC_API_SECRET`] ?? 'changeme',
        tlsCert: `${OUT_DIR}/certs/hysteria.crt`,
        tlsKey: `${OUT_DIR}/certs/hysteria.key`,
        obfsPassword: env[`${p}_HYSTERIA_OBFS_PASSWORD`] || undefined,
        socksAddr: `127.0.0.1:${route.exitRegion === 'de' ? 11501 : 11500}`,
      };
      const hyPath = `${OUT_DIR}/hysteria/${route.name}.yaml`;
      write(hyPath, toYaml(renderHysteriaBridgeConfig(hyBridge)) + '\n');
      written.hysteriaPaths.push(hyPath);
    }
  } else {
    // Hysteria exit config (auth delegated to node-agent local endpoint).
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
  }

  return written;
}
