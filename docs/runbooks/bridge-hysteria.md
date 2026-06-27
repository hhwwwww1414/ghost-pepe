# Whitelist Hysteria2 bridge — egress proof (docs 06 §18.2)

**Requirement:** when a user picks `Whitelist Hysteria` for FI/DE, the client must
connect to the Yandex Cloud whitelisted IP, and traffic must egress through the
**FI/DE Hysteria2 exit**, NOT directly out of Yandex Cloud.

## Chosen implementation (v1)

Run one Hysteria2 **bridge** instance per exit on the YC node. Each bridge:

1. Listens on its own UDP port (e.g. `wl-hysteria-to-fi` → `:443`,
   `wl-hysteria-to-de` → `:444`).
2. Authenticates the client via the node-agent HTTP auth (same central backend).
3. Has an `outbounds` entry of type `hysteria2` pointing at the FI/DE exit
   endpoint, and an `acl` that sends **all** accepted traffic to that outbound:

   ```yaml
   outbounds:
     - name: exit
       type: hysteria2
       hysteria2:
         server: ${FI_HYSTERIA_DOMAIN}:443
   acl:
     inline:
       - exit(all)
   ```

Because `acl: exit(all)` forwards every request to the `exit` outbound, the YC
node never uses its own `freedom`/direct egress for whitelist Hysteria traffic.
The public egress IP observed by the destination is the **FI/DE** exit IP.

## Verification

From a client on the whitelist Hysteria profile:

```bash
curl https://api.ipify.org      # must return the FI (or DE) exit IP, NOT the YC IP
```

If the returned IP is the Yandex Cloud IP, the whitelist Hysteria profile is
**not ready** — check the `outbounds`/`acl` block and that the exit endpoint is
reachable from YC.

## User-facing endpoint

The subscription body always uses `WL_HYSTERIA_DOMAIN` (the YC IP) as the client
endpoint — never `FI_HYSTERIA_DOMAIN`/`DE_HYSTERIA_DOMAIN`. The exit selection is
encoded in which bridge port/credential the user's profile maps to.
