# HAProxy L4 SNI router for FI (Variant A — docs 06 §5).
# Public TCP 443 is split by SNI:
#   api/admin/sub  -> Caddy on 127.0.0.1:8443 (HTTPS web)
#   fi-vless       -> Xray VLESS Reality on 127.0.0.1:1443
# Hysteria2 uses UDP 443 separately (no conflict with TCP 443).
#
# Render with scripts/generate-configs (replaces ${...}).

global
    log /dev/log local0
    maxconn 20000

defaults
    mode tcp
    timeout connect 5s
    timeout client  50s
    timeout server  50s
    log global

frontend tls_in
    bind :443
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }

    # Route VLESS Reality by its SNI to Xray.
    use_backend xray_vless if { req_ssl_sni -i ${FI_VLESS_DOMAIN} }

    # Everything else (api/admin/sub) goes to the web reverse proxy.
    default_backend web_caddy

backend xray_vless
    server xray 127.0.0.1:1443

backend web_caddy
    server caddy 127.0.0.1:8443
