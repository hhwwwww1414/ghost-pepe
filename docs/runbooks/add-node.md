# Adding a new node (docs 06 §22)

A new exit/bridge node is added with one YAML entry and two commands.

## 1. Describe the node

Edit `infra/nodes/nodes.local.yml` (copy from `nodes.example.yml` first):

```yaml
  - node_code: nl-exit-01
    country_code: NL
    role: exit
    public_ipv4: "203.0.113.10"
    ssh_host: "203.0.113.10"
    ssh_port: 22
    ssh_user: "root"
    is_control_plane: false
    is_exit_node: true
    is_whitelist_bridge: false
    domains:
      vless: "nl-vless.example.com"
      hysteria: "nl-hy.example.com"
```

Add DNS A-records for the two domains → the node IP.

## 2. Register the node in the control-plane

```bash
make add-node NODE_CODE=nl-exit-01
```

This inserts the `nodes` row and creates its `node_profiles` (regular VLESS +
Hysteria, and — if you want whitelist for it — the whitelist profiles via the YC
bridge). New users automatically get credentials for the new node's profiles.

## 3. Deploy

```bash
make deploy-node NODE_CODE=nl-exit-01
```

Installs Docker/xray/hysteria/node-agent, uploads rendered configs, opens only
the needed ports, and registers heartbeat.

## 4. Verify

- Admin → Серверы → the node shows online with xray/hysteria alive.
- A test user's subscription now lists the new region's profiles.
