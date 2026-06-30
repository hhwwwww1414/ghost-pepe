[Unit]
# Hysteria2 port hopping for the Yandex whitelist bridge. FI and DE bridge
# instances listen on different UDP ports, so they need distinct hop ranges.
Description=Hysteria2 whitelist bridge port-hopping NAT - Ghost Pepe
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'IF=$(ip route show default | awk "{print \$5; exit}"); iptables -t nat -C PREROUTING -i "$IF" -p udp --dport 20000:34999 -j REDIRECT --to-ports 443 2>/dev/null || iptables -t nat -A PREROUTING -i "$IF" -p udp --dport 20000:34999 -j REDIRECT --to-ports 443; iptables -t nat -C PREROUTING -i "$IF" -p udp --dport 35000:50000 -j REDIRECT --to-ports 444 2>/dev/null || iptables -t nat -A PREROUTING -i "$IF" -p udp --dport 35000:50000 -j REDIRECT --to-ports 444'
ExecStop=/bin/sh -c 'IF=$(ip route show default | awk "{print \$5; exit}"); iptables -t nat -D PREROUTING -i "$IF" -p udp --dport 20000:34999 -j REDIRECT --to-ports 443 2>/dev/null || true; iptables -t nat -D PREROUTING -i "$IF" -p udp --dport 35000:50000 -j REDIRECT --to-ports 444 2>/dev/null || true'

[Install]
WantedBy=multi-user.target
