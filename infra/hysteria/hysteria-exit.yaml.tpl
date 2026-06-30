# Hysteria2 server (regular exit FI/DE) — docs 06 §18.1, 02 §5.
# Auth is delegated to the node-agent which checks the central backend.
# Traffic Stats API + auth both bind to localhost only.

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
  secret: ${HYSTERIA_TRAFFIC_API_SECRET}

obfs:
  type: salamander
  salamander:
    password: ${HYSTERIA_OBFS_PASSWORD}

masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
