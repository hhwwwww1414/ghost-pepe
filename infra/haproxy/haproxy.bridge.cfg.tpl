# HAProxy L4 SNI router for the Yandex Cloud whitelist bridge (docs 06 §16.3).
# Public TCP 443 -> Xray bridge inbounds by SNI. Whitelist clients only ever see
# the WL_VLESS_DOMAIN; the bridge forwards to the chosen FI/DE exit.

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
    use_backend xray_bridge if { req_ssl_sni -i ${WL_VLESS_DOMAIN} }
    default_backend xray_bridge

backend xray_bridge
    # Xray bridge listens on 127.0.0.1:11400 (wl-vless-to-fi) and 11401 (wl-vless-to-de).
    # The bridge decides the exit per inbound; HAProxy just hands off TLS.
    server xray 127.0.0.1:11400
