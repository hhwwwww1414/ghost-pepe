import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_DEFINITIONS, YC_BRIDGE_CODE, ruDirectForMode } from '../src/index.js';

test('profile matrix has eight profile combinations', () => {
  assert.equal(PROFILE_DEFINITIONS.length, 8);
  assert.equal(new Set(PROFILE_DEFINITIONS.map((p) => p.code)).size, 8);
});

test('regular profiles use direct RU routing and whitelist profiles do not', () => {
  for (const profile of PROFILE_DEFINITIONS) {
    assert.equal(profile.ruDirect, ruDirectForMode(profile.mode));
  }
});

test('whitelist profiles connect through the Yandex bridge and exit elsewhere', () => {
  const whitelist = PROFILE_DEFINITIONS.filter((p) => p.mode === 'whitelist');
  assert.equal(whitelist.length, 4);
  for (const profile of whitelist) {
    assert.equal(profile.ingressNodeCode, YC_BRIDGE_CODE);
    assert.notEqual(profile.exitNodeCode, YC_BRIDGE_CODE);
    assert.match(profile.endpointDomainEnv, /^WL_/);
  }
});

test('subscription labels use compact country/protocol format and EU marker for whitelist', () => {
  assert.deepEqual(
    Object.fromEntries(PROFILE_DEFINITIONS.map((p) => [p.code, p.label])),
    {
      fi_vless_regular: '🇫🇮 FI | VLESS',
      fi_hysteria_regular: '🇫🇮 FI | HY',
      fi_vless_whitelist: '🇪🇺 LTE #2 | VLESS',
      fi_hysteria_whitelist: '🇪🇺 LTE #1 | HY',
      de_vless_regular: '🇩🇪 DE | VLESS',
      de_hysteria_regular: '🇩🇪 DE | HY',
      de_vless_whitelist: '🇪🇺 LTE #4 | VLESS',
      de_hysteria_whitelist: '🇪🇺 LTE #3 | HY',
    },
  );
});
