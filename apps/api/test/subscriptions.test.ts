import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHappImportUrl } from '../src/services/subscriptions.js';

test('builds Happ crypto import deep link for subscription URLs', async () => {
  const bodyUrl = 'https://api.example.com/sub/dev_ALiGLQ8VO2PlVw';
  const deepLink = await buildHappImportUrl(bodyUrl, async (_url, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), { url: bodyUrl });
    return new Response(JSON.stringify({ encrypted_link: 'happ://crypt5/encrypted' }), { status: 200 });
  });

  assert.equal(deepLink, 'happ://crypt5/encrypted');
});

test('falls back to generic Happ add link when crypto API is unavailable', async () => {
  const bodyUrl = 'https://api.example.com/sub/dev_ALiGLQ8VO2PlVw';
  const deepLink = await buildHappImportUrl(bodyUrl, async () => new Response('bad gateway', { status: 502 }));

  assert.equal(deepLink, 'happ:add/aHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vc3ViL2Rldl9BTGlHTFE4Vk8yUGxWdw');
});
