# HAProxy L4 SNI router for the Yandex Cloud whitelist bridge (docs 06 §16.3).
# Public TCP 443 -> Xray bridge by Reality SNI. Whitelist clients can use the
# bridge IP as address; Reality SNI is borrowed from YC_REALITY_SERVER_NAME.

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
    use_backend xray_bridge if { req_ssl_sni -i ${YC_REALITY_SERVER_NAME} }
    default_backend xray_bridge

backend xray_bridge
    # Xray bridge listens on 127.0.0.1:11400 and routes by credential profile.
    # HAProxy just hands off TLS.
    server xray 127.0.0.1:11400
