# Rotating secrets

## Reality keys (per node)
```bash
xray x25519           # new private/public
openssl rand -hex 8   # new short id
```
Update `*_REALITY_*` in `.env.production`, re-render configs, restart xray on the
node and (for whitelist) the YC bridge outbound public key. Existing clients must
re-import the subscription (the body endpoint serves the new pbk/sid).

## Hysteria stats/obfs secret
```bash
bash scripts/generate-configs/rotate-hysteria-secret.sh   # helper (TODO host-side)
```
Update `*_HYSTERIA_TRAFFIC_API_SECRET` / `*_HYSTERIA_OBFS_PASSWORD`, restart
hysteria-server + node-agent.

## Internal tokens
Rotate `INTERNAL_API_TOKEN`, `NODE_AGENT_TOKEN`, `ADMIN_JWT_SECRET`,
`SUBSCRIPTION_TOKEN_SECRET`, `ENCRYPTION_MASTER_KEY` carefully:
- `ENCRYPTION_MASTER_KEY` change requires re-encrypting `*_encrypted` columns —
  do a migration that decrypts with old key, encrypts with new. Do NOT rotate
  blindly or existing credentials become unreadable.
- `TOKEN_HASH_SECRET` change invalidates all stored token/fingerprint hashes
  (devices must re-import, page tokens reissue). Plan for it.
