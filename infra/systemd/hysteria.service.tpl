[Unit]
Description=Hysteria2 server — Ghost Pepe
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hysteria server -c /etc/ghostpepe/hysteria/config.yaml
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
NoNewPrivileges=true
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
