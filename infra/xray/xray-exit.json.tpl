{
  "//": "Template for a regular VLESS+Reality exit (FI/DE). The node-agent regenerates this file with live per-device users from the control-plane desired-state; this template documents the shape. Reality keys come from env (FI_/DE_REALITY_*).",
  "log": { "loglevel": "warning" },
  "api": { "tag": "api", "services": ["HandlerService", "StatsService"] },
  "stats": {},
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
    "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" },
      "tag": "api"
    },
    {
      "listen": "0.0.0.0",
      "port": 1443,
      "protocol": "vless",
      "tag": "vless-reality",
      "settings": {
        "clients": [
          { "id": "PER_DEVICE_UUID", "email": "u:..:d:..:p:vless:n:..:m:regular", "flow": "xtls-rprx-vision" }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${REALITY_SERVER_NAME}:443",
          "serverNames": ["${REALITY_SERVER_NAME}"],
          "privateKey": "${REALITY_PRIVATE_KEY}",
          "shortIds": ["${REALITY_SHORT_ID}"]
        }
      },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "blocked" }
  ],
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      { "type": "field", "inboundTag": ["api"], "outboundTag": "api" },
      { "type": "field", "ip": ["geoip:private", "geoip:ru"], "outboundTag": "direct" },
      { "type": "field", "domain": ["geosite:category-ru"], "outboundTag": "direct" }
    ]
  }
}
