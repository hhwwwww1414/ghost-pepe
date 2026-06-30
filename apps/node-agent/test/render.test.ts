import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

test('renders whitelist Hysteria bridge configs for both exits', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ghostpepe-agent-'));
  process.env.AGENT_CONFIG_DIR = outDir;
  process.env.NODE_ENV = 'test';
  process.env.NODE_CODE = 'yc-bridge-01';
  process.env.YC_HYSTERIA_TRAFFIC_API_SECRET = 'yc-stats';
  process.env.YC_HYSTERIA_OBFS_PASSWORD = 'yc-obfs';
  process.env.FI_HYSTERIA_DOMAIN = 'fi-hy.example.com';
  process.env.DE_HYSTERIA_DOMAIN = 'de-hy.example.com';
  process.env.FI_HYSTERIA_BRIDGE_VLESS_UUID = '00000000-0000-4000-8000-0000000000f1';
  process.env.DE_HYSTERIA_BRIDGE_VLESS_UUID = '00000000-0000-4000-8000-0000000000d1';
  process.env.FI_REALITY_PUBLIC_KEY = 'fi-public';
  process.env.DE_REALITY_PUBLIC_KEY = 'de-public';
  process.env.FI_REALITY_SHORT_ID = 'fi-short';
  process.env.DE_REALITY_SHORT_ID = 'de-short';
  process.env.FI_REALITY_SERVER_NAME = 'www.cloudflare.com';
  process.env.DE_REALITY_SERVER_NAME = 'www.cloudflare.com';
  process.env.HYSTERIA_AUTH_PORT = '18081';
  process.env.HYSTERIA_STATS_ADDR = '127.0.0.1:9999';

  const { renderConfigs } = await import('../src/render.js');

  const rendered = renderConfigs({
    nodeCode: 'yc-bridge-01',
    role: 'whitelist_ingress',
    generatedAt: new Date(0).toISOString(),
    vlessUsers: [],
    bridgeInbounds: {},
    hysteriaBridgeRoutes: [
      { name: 'wl-hysteria-to-fi', exitRegion: 'fi', listenPort: 443 },
      { name: 'wl-hysteria-to-de', exitRegion: 'de', listenPort: 444 },
    ],
  });

  assert.deepEqual(rendered.hysteriaPaths.map((p) => normalize(p)).sort(), [
    join(outDir, 'hysteria/wl-hysteria-to-de.yaml'),
    join(outDir, 'hysteria/wl-hysteria-to-fi.yaml'),
  ].sort());

  const fi = readFileSync(join(outDir, 'hysteria/wl-hysteria-to-fi.yaml'), 'utf8');
  const de = readFileSync(join(outDir, 'hysteria/wl-hysteria-to-de.yaml'), 'utf8');
  const xray = readFileSync(join(outDir, 'xray/config.json'), 'utf8');
  assert.match(fi, /listen: ":443"/);
  assert.match(fi, /ignoreClientBandwidth: true/);
  assert.match(fi, /maxIdleTimeout: 60s/);
  assert.match(fi, /maxIncomingStreams: 2048/);
  assert.match(fi, /type: socks5/);
  assert.match(fi, /addr: "127\.0\.0\.1:11500"/);
  assert.match(de, /listen: ":444"/);
  assert.match(de, /type: socks5/);
  assert.match(de, /addr: "127\.0\.0\.1:11501"/);
  assert.doesNotMatch(fi, /masquerade:/);
  assert.doesNotMatch(de, /masquerade:/);
  assert.match(xray, /"tag": "hy-socks-to-fi"/);
  assert.match(xray, /"port": 11500/);
  assert.match(xray, /"id": "00000000-0000-4000-8000-0000000000f1"/);
  assert.match(xray, /"tag": "hy-socks-to-de"/);
  assert.match(xray, /"port": 11501/);
  assert.match(xray, /"id": "00000000-0000-4000-8000-0000000000d1"/);
});
