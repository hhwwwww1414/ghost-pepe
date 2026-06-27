# Generating Reality keys

On any host with `xray` installed:

```bash
xray x25519
# Private key: <PRIVATE>   -> FI_REALITY_PRIVATE_KEY (server)
# Public key:  <PUBLIC>    -> FI_REALITY_PUBLIC_KEY  (client / bridge outbound)
```

Short id (1–16 hex chars):

```bash
openssl rand -hex 8        # -> FI_REALITY_SHORT_ID
```

Server name (SNI to borrow handshake from — must be a real TLS 1.3 site):

```
FI_REALITY_SERVER_NAME=www.microsoft.com
```

Repeat per node (FI / DE / YC). Put the values in `.env.production` /
`infra/secrets/secrets.local.md` — never commit them.
