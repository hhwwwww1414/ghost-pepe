[Unit]
# Hysteria2 port hopping (docs 02 §5). Mobile carriers / TSPU throttle QUIC on a
# fixed UDP 443; the client hops across UDP 20000-50000 and this rule NATs that
# whole range to the Hysteria listen port (443). The range MUST match
# HYSTERIA_PORT_HOP_RANGE in .env (20000-50000). Idempotent; survives reboot.
Description=Hysteria2 port-hopping NAT (UDP 20000-50000 -> 443) — Ghost Pepe
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'IF=$(ip route show default | awk "{print \$5; exit}"); iptables -t nat -C PREROUTING -i "$IF" -p udp --dport 20000:50000 -j REDIRECT --to-ports 443 2>/dev/null || iptables -t nat -A PREROUTING -i "$IF" -p udp --dport 20000:50000 -j REDIRECT --to-ports 443'
ExecStop=/bin/sh -c 'IF=$(ip route show default | awk "{print \$5; exit}"); iptables -t nat -D PREROUTING -i "$IF" -p udp --dport 20000:50000 -j REDIRECT --to-ports 443 2>/dev/null || true'

[Install]
WantedBy=multi-user.target
