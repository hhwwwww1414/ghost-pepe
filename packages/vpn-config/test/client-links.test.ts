import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHysteriaLink, buildVlessLink } from '../src/index.js';

test('builds VLESS Reality client links', () => {
  const link = buildVlessLink({
    uuid: '00000000-0000-4000-8000-000000000000',
    host: 'fi-vless.example.com',
    port: 443,
    publicKey: 'public',
    shortId: 'abcd',
    serverName: 'www.microsoft.com',
    label: 'Finland VLESS',
  });
  assert.match(link, /^vless:\/\/00000000-0000-4000-8000-000000000000@fi-vless\.example\.com:443\?/);
  assert.match(link, /security=reality/);
  assert.match(link, /#Finland%20VLESS$/);
});

test('builds Hysteria2 links with salamander obfs', () => {
  const link = buildHysteriaLink({
    auth: 'secret',
    host: 'wl-hy.example.com',
    port: 443,
    serverName: 'wl-hy.example.com',
    obfsPassword: 'obfs',
    label: 'Finland Whitelist Hysteria',
  });
  assert.match(link, /^hy2:\/\/secret@wl-hy\.example\.com:443\?/);
  assert.match(link, /obfs=salamander/);
  assert.match(link, /#Finland%20Whitelist%20Hysteria$/);
});
