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

test('builds Happ-compatible Hysteria2 links with salamander obfs and cert pin', () => {
  const link = buildHysteriaLink({
    auth: 'secret',
    host: 'wl-hy.example.com',
    port: 443,
    serverName: 'wl-hy.example.com',
    obfsPassword: 'obfs',
    pinSha256: 'deadbeef',
    label: 'Finland Whitelist Hysteria',
  });
  assert.match(link, /^hy2:\/\/secret@wl-hy\.example\.com:443\?/);
  assert.match(link, /obfs=salamander/);
  assert.match(link, /pinSHA256=deadbeef/);
  assert.doesNotMatch(link, /insecure/);
  assert.match(link, /#Finland%20Whitelist%20Hysteria$/);
});

test('emits port-hopping range and interval when configured', () => {
  const link = buildHysteriaLink({
    auth: 'secret',
    host: '38.244.193.28',
    port: 443,
    serverName: 'sub.example.com',
    obfsPassword: 'obfs',
    portHopRange: '20000-50000',
    hopInterval: 30,
    label: 'FI | HY',
  });
  // Range lives in the authority, not the fixed port.
  assert.match(link, /^hy2:\/\/secret@38\.244\.193\.28:20000-50000\?/);
  assert.match(link, /mportHopInt=30/);
  assert.match(link, /sni=sub\.example\.com/);
});

test('falls back to the fixed port when no hop range is set', () => {
  const link = buildHysteriaLink({
    auth: 'secret',
    host: '38.244.193.28',
    port: 443,
    serverName: 'sub.example.com',
    label: 'FI | HY',
  });
  assert.match(link, /^hy2:\/\/secret@38\.244\.193\.28:443\?/);
  assert.doesNotMatch(link, /mportHopInt/);
});
