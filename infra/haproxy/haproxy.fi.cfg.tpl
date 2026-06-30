# HAProxy L4 SNI router for FI (Variant A — docs 06 §5).
# Public TCP 443 is split by SNI:
#   api/admin/sub  -> Caddy on 127.0.0.1:8443 (HTTPS web)
#   Reality SNI    -> Xray VLESS Reality on 127.0.0.1:1443
# Hysteria2 uses UDP 443 separately (no conflict with TCP 443).
#
# Render with scripts/generate-configs (replaces ${...}).

global
    log /dev/log local0
    maxconn 20000

defaults
    mode tcp
    timeout connect 5s
    timeout client  1h
    timeout server  1h
    timeout tunnel  1h
    timeout client-fin 30s
    timeout server-fin 30s
    log global

frontend tls_in
    bind :443
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }

    # Web domains must terminate in Caddy.
    use_backend web_caddy if { req_ssl_sni -i ${SUB_DOMAIN} }
    use_backend web_caddy if { req_ssl_sni -i ${ADMIN_DOMAIN} }

    # Everything else on TCP 443 is VPN traffic. This also makes IP/no-SNI
    # client checks reach Reality instead of the web proxy.
    default_backend xray_vless

backend xray_vless
    server xray 127.0.0.1:1443

backend web_caddy
    server caddy 127.0.0.1:8443
