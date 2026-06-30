# Hysteria2 whitelist bridge on Yandex Cloud (docs 06 §18.2).
# The bridge accepts whitelist clients and FORWARDS to a local SOCKS listener.
# Xray owns that listener and tunnels traffic to FI/DE, so egress is FI/DE —
# NOT directly out of YC.
# Run ONE bridge instance per exit (separate ports), e.g.:
#   wl-hysteria-to-fi : listen :443  -> socks5 127.0.0.1:11500 -> FI
#   wl-hysteria-to-de : listen :444  -> socks5 127.0.0.1:11501 -> DE
# See docs/runbooks/bridge-hysteria.md for the egress proof.

listen: :443

bandwidth:
  up: 1 gbps
  down: 1 gbps
ignoreClientBandwidth: true

quic:
  initStreamReceiveWindow: 26843545
  maxStreamReceiveWindow: 26843545
  initConnReceiveWindow: 67108864
  maxConnReceiveWindow: 67108864
  maxIdleTimeout: 60s
  maxIncomingStreams: 2048
  disablePathMTUDiscovery: false

tls:
  cert: /etc/ghostpepe/certs/hysteria.crt
  key: /etc/ghostpepe/certs/hysteria.key

auth:
  type: http
  http:
    url: http://127.0.0.1:${HYSTERIA_AUTH_PORT}/hysteria/auth
    insecure: false

trafficStats:
  listen: 127.0.0.1:9999
  secret: ${YC_HYSTERIA_TRAFFIC_API_SECRET}

obfs:
  type: salamander
  salamander:
    password: ${YC_HYSTERIA_OBFS_PASSWORD}

# Forward all accepted traffic to Xray's local SOCKS listener for FI.
outbounds:
  - name: exit
    type: socks5
    socks5:
      addr: 127.0.0.1:11500

acl:
  inline:
    - exit(all)
