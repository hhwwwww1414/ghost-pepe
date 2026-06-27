import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta, buildSubscriptionUserInfo } from '../src/index.js';

test('traffic delta uses positive monotonic difference', () => {
  assert.equal(computeDelta(100n, 175n), 75n);
});

test('traffic delta treats counter reset as current value', () => {
  assert.equal(computeDelta(500n, 42n), 42n);
});

test('subscription userinfo header matches Happ format', () => {
  assert.equal(
    buildSubscriptionUserInfo({ upload: 1n, download: 2n, total: 100n, expireUnix: 123 }),
    'upload=1; download=2; total=100; expire=123',
  );
});
