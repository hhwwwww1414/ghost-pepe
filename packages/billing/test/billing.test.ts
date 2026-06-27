import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStarsPrices, computeNewExpiry, parseInvoicePayload, STARS_CURRENCY } from '../src/index.js';

test('Telegram Stars prices use XTR integer amounts', () => {
  assert.equal(STARS_CURRENCY, 'XTR');
  assert.deepEqual(buildStarsPrices(250, '30 days'), [{ label: '30 days', amount: 250 }]);
});

test('invoice payload parser extracts telegram id and plan code', () => {
  assert.deepEqual(parseInvoicePayload('gp:123456:month:random'), {
    telegramId: 123456n,
    planCode: 'month',
  });
  assert.equal(parseInvoicePayload('bad'), null);
});

test('renewal extends from current future expiry', () => {
  const now = new Date('2026-06-27T00:00:00Z');
  const current = new Date('2026-07-01T00:00:00Z');
  assert.equal(computeNewExpiry(current, 30, now).toISOString(), '2026-07-31T00:00:00.000Z');
});
