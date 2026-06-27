[Unit]
Description=Ghost Pepe node-agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ghostpepe
EnvironmentFile=/opt/ghostpepe/.env.production
ExecStart=/usr/bin/node --import tsx /opt/ghostpepe/apps/node-agent/src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
