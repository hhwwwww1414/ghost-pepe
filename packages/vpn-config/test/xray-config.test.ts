import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHysteriaExitConfig, renderXrayBridgeConfig, type BridgeRoute } from '../src/index.js';

const reality = {
  privateKey: 'yc-private',
  shortIds: ['yc-short'],
  serverNames: ['www.cloudflare.com'],
  dest: 'www.cloudflare.com:443',
};

test('routes whitelist bridge users through their selected exit outbounds', () => {
  const routes: BridgeRoute[] = [
    {
      inboundTag: 'wl-vless',
      listenPort: 11400,
      users: [{ uuid: '00000000-0000-4000-8000-000000000001', email: 'fi-user', profileCode: 'fi_vless_whitelist' }],
      reality,
      exitHost: '38.244.193.28',
      exitPort: 443,
      exitPublicKey: 'fi-public',
      exitShortId: 'fi-short',
      exitServerName: 'www.cloudflare.com',
    },
    {
      inboundTag: 'wl-vless',
      listenPort: 11400,
      users: [{ uuid: '00000000-0000-4000-8000-000000000002', email: 'de-user', profileCode: 'de_vless_whitelist' }],
      reality,
      exitHost: '72.56.30.210',
      exitPort: 443,
      exitPublicKey: 'de-public',
      exitShortId: 'de-short',
      exitServerName: 'www.cloudflare.com',
    },
  ];

  const config = renderXrayBridgeConfig(routes) as {
    inbounds: Array<{ tag: string; port: number; settings: { clients: Array<{ email: string }> } }>;
    outbounds: Array<{ tag: string; settings?: { vnext: Array<{ address: string }> } }>;
    routing: { rules: Array<{ user?: string[]; outboundTag: string }> };
  };

  assert.equal(config.inbounds.length, 1);
  const inbound = config.inbounds[0];
  assert.ok(inbound);
  assert.equal(inbound.tag, 'wl-vless');
  assert.equal(inbound.port, 11400);
  assert.deepEqual(inbound.settings.clients.map((c) => c.email), [
    'fi-user:profile:fi_vless_whitelist',
    'de-user:profile:de_vless_whitelist',
  ]);

  const fiRule = config.routing.rules.find((r) => r.user?.[0] === 'fi-user:profile:fi_vless_whitelist');
  const deRule = config.routing.rules.find((r) => r.user?.[0] === 'de-user:profile:de_vless_whitelist');
  assert.ok(fiRule);
  assert.ok(deRule);
  assert.notEqual(fiRule.outboundTag, 'direct');
  assert.notEqual(deRule.outboundTag, 'direct');

  const fiOutbound = config.outbounds.find((o) => o.tag === fiRule.outboundTag);
  const deOutbound = config.outbounds.find((o) => o.tag === deRule.outboundTag);
  assert.ok(fiOutbound);
  assert.ok(deOutbound);
  const fiVnext = fiOutbound.settings?.vnext[0];
  const deVnext = deOutbound.settings?.vnext[0];
  assert.ok(fiVnext);
  assert.ok(deVnext);
  assert.equal(fiVnext.address, '38.244.193.28');
  assert.equal(deVnext.address, '72.56.30.210');
});

test('renders Hysteria2 configs with LTE-friendly QUIC and bandwidth tuning', () => {
  const config = renderHysteriaExitConfig({
    listenPort: 443,
    authUrl: 'http://127.0.0.1:18081/hysteria/auth',
    trafficStatsListen: '127.0.0.1:9999',
    trafficStatsSecret: 'secret',
    tlsCert: '/etc/ghostpepe/certs/hysteria.crt',
    tlsKey: '/etc/ghostpepe/certs/hysteria.key',
    obfsPassword: 'obfs',
  }) as {
    bandwidth: { up: string; down: string };
    ignoreClientBandwidth: boolean;
    quic: {
      maxIdleTimeout: string;
      maxIncomingStreams: number;
      disablePathMTUDiscovery: boolean;
    };
  };

  assert.deepEqual(config.bandwidth, { up: '1 gbps', down: '1 gbps' });
  assert.equal(config.ignoreClientBandwidth, true);
  assert.equal(config.quic.maxIdleTimeout, '60s');
  assert.equal(config.quic.maxIncomingStreams, 2048);
  assert.equal(config.quic.disablePathMTUDiscovery, false);
});
