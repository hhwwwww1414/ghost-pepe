# Hysteria2 whitelist bridge on Yandex Cloud (docs 06 §18.2).
# The bridge accepts whitelist clients and FORWARDS to the FI/DE Hysteria exit
# via an outbound, so traffic egresses through FI/DE — NOT directly out of YC.
# Run ONE bridge instance per exit (separate ports), e.g.:
#   wl-hysteria-to-fi : listen :443  -> outbound exit ${FI_HYSTERIA_DOMAIN}:443
#   wl-hysteria-to-de : listen :444  -> outbound exit ${DE_HYSTERIA_DOMAIN}:443
# See docs/runbooks/bridge-hysteria.md for the egress proof.

listen: :443

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

# Forward all accepted traffic to the FI exit Hysteria2 endpoint.
outbounds:
  - name: exit
    type: hysteria2
    hysteria2:
      server: ${FI_HYSTERIA_DOMAIN}:443

acl:
  inline:
    - exit(all)
