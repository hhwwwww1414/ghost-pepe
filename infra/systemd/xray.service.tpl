[Unit]
Description=Xray (VLESS+Reality) — Ghost Pepe
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/xray run -config /etc/ghostpepe/xray/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
