{
  "//": "Template for the Yandex Cloud whitelist bridge (docs 06 §16.3/§17.2). One VLESS Reality inbound per exit, each routed to a dedicated VLESS outbound that connects to the matching FI/DE exit. Traffic egresses through FI/DE, never directly out of YC. The node-agent regenerates this with live users.",
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 11400,
      "protocol": "vless",
      "tag": "wl-vless-to-fi",
      "settings": { "clients": [{ "id": "PER_DEVICE_UUID", "email": "u:..:m:whitelist" }], "decryption": "none" },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": { "dest": "${YC_REALITY_SERVER_NAME}:443", "serverNames": ["${YC_REALITY_SERVER_NAME}"], "privateKey": "${YC_REALITY_PRIVATE_KEY}", "shortIds": ["${YC_REALITY_SHORT_ID}"] }
      }
    },
    {
      "listen": "0.0.0.0",
      "port": 11401,
      "protocol": "vless",
      "tag": "wl-vless-to-de",
      "settings": { "clients": [{ "id": "PER_DEVICE_UUID", "email": "u:..:m:whitelist" }], "decryption": "none" },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": { "dest": "${YC_REALITY_SERVER_NAME}:443", "serverNames": ["${YC_REALITY_SERVER_NAME}"], "privateKey": "${YC_REALITY_PRIVATE_KEY}", "shortIds": ["${YC_REALITY_SHORT_ID}"] }
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "vless",
      "tag": "out-wl-vless-to-fi",
      "settings": { "vnext": [{ "address": "${FI_VLESS_DOMAIN}", "port": 443, "users": [{ "id": "BRIDGE_UUID", "encryption": "none", "flow": "xtls-rprx-vision" }] }] },
      "streamSettings": { "network": "tcp", "security": "reality", "realitySettings": { "publicKey": "${FI_REALITY_PUBLIC_KEY}", "shortId": "${FI_REALITY_SHORT_ID}", "serverName": "${FI_REALITY_SERVER_NAME}", "fingerprint": "chrome" } }
    },
    {
      "protocol": "vless",
      "tag": "out-wl-vless-to-de",
      "settings": { "vnext": [{ "address": "${DE_VLESS_DOMAIN}", "port": 443, "users": [{ "id": "BRIDGE_UUID", "encryption": "none", "flow": "xtls-rprx-vision" }] }] },
      "streamSettings": { "network": "tcp", "security": "reality", "realitySettings": { "publicKey": "${DE_REALITY_PUBLIC_KEY}", "shortId": "${DE_REALITY_SHORT_ID}", "serverName": "${DE_REALITY_SERVER_NAME}", "fingerprint": "chrome" } }
    },
    { "protocol": "freedom", "tag": "direct" }
  ],
  "routing": {
    "rules": [
      { "type": "field", "inboundTag": ["wl-vless-to-fi"], "outboundTag": "out-wl-vless-to-fi" },
      { "type": "field", "inboundTag": ["wl-vless-to-de"], "outboundTag": "out-wl-vless-to-de" }
    ]
  }
}
