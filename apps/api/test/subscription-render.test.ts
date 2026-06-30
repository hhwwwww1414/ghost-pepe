import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStableHappProfile,
  compareSubscriptionProfiles,
  subscriptionNoticeLines,
  happHysteriaPinSha256,
  hysteriaPortHopForProfile,
} from '../src/services/subscription-render.js';

test('stable Happ imports use the working whitelist VLESS bridge', () => {
  assert.equal(isStableHappProfile('vless', 'whitelist'), true);
  assert.equal(isStableHappProfile('hysteria', 'whitelist'), true);
  assert.equal(isStableHappProfile('vless', 'regular'), false);
  assert.equal(isStableHappProfile('hysteria', 'regular'), false);
});

test('subscription profiles keep whitelist entries after regular country entries', () => {
  const profileCodes = [
    'fi_vless_whitelist',
    'de_hysteria_whitelist',
    'fi_hysteria_regular',
    'de_vless_regular',
    'fi_vless_regular',
    'de_hysteria_regular',
    'de_vless_whitelist',
    'fi_hysteria_whitelist',
  ];

  assert.deepEqual(profileCodes.sort(compareSubscriptionProfiles), [
    'fi_hysteria_regular',
    'fi_vless_regular',
    'de_hysteria_regular',
    'de_vless_regular',
    'fi_hysteria_whitelist',
    'fi_vless_whitelist',
    'de_hysteria_whitelist',
    'de_vless_whitelist',
  ]);
});

test('subscription notice explains LTE profiles and support in the body', () => {
  assert.deepEqual(subscriptionNoticeLines(), [
    '🇪🇺 LTE ОБХОДЫ НЕ ГАРАНТИРОВАНЫ - в конце списка стран👇',
    '🎬 YT - YouTube без рекламы',
    '✅ Torrent - на сервере разрешены торренты',
    '💬 Поддержка @ghostpepe_support',
    '👻 Ghost Pepe VPN',
  ]);
});

test('Happ Hysteria subscriptions use public TLS validation instead of cert pin URI params', () => {
  assert.equal(happHysteriaPinSha256(), undefined);
});

test('Hysteria port hopping is selected for regular and whitelist profiles', () => {
  process.env.HYSTERIA_PORT_HOP_RANGE = '20000-50000';
  process.env.HYSTERIA_PORT_HOP_INTERVAL = '30';
  process.env.WL_HYSTERIA_FI_PORT_HOP_RANGE = '20000-34999';
  process.env.WL_HYSTERIA_DE_PORT_HOP_RANGE = '35000-50000';
  process.env.WL_HYSTERIA_PORT_HOP_INTERVAL = '20';

  assert.deepEqual(hysteriaPortHopForProfile('fi_hysteria_regular', 'regular'), {
    range: '20000-50000',
    interval: 30,
  });
  assert.deepEqual(hysteriaPortHopForProfile('fi_hysteria_whitelist', 'whitelist'), {
    range: '20000-34999',
    interval: 20,
  });
  assert.deepEqual(hysteriaPortHopForProfile('de_hysteria_whitelist', 'whitelist'), {
    range: '35000-50000',
    interval: 20,
  });
  assert.deepEqual(hysteriaPortHopForProfile('fi_vless_whitelist', 'whitelist'), {});
});
