/**
 * Register a node in the control-plane from infra/nodes/nodes.local.yml.
 * Usage: tsx scripts/add-node/add-node.ts <node_code>
 *
 * For the three base regions (FI/DE/YC) the profiles are seeded by db:seed.
 * For a brand-new region, also add its profiles to packages/shared/profiles.ts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@ghostpepe/db';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function loadNode(code: string): Record<string, string> | null {
  const file = resolve(repoRoot, 'infra/nodes/nodes.local.yml');
  if (!existsSync(file)) throw new Error('infra/nodes/nodes.local.yml not found — copy from nodes.example.yml');
  const text = readFileSync(file, 'utf8');
  // Minimal block parser: split on "- node_code:" markers.
  const blocks = text.split(/-\s*node_code:/).slice(1);
  for (const raw of blocks) {
    const block = 'node_code:' + raw;
    const nc = /node_code:\s*([^\n]+)/.exec(block)?.[1]?.trim();
    if (nc !== code) continue;
    const get = (k: string) => /(?:^|\n)\s*([\w_]+):\s*"?([^"\n]+)"?/g && new RegExp(`${k}:\\s*"?([^"\\n]+)"?`).exec(block)?.[1]?.trim();
    return {
      node_code: code,
      country_code: get('country_code') ?? 'XX',
      role: get('role') ?? 'exit',
      public_ipv4: get('public_ipv4') ?? '',
      ssh_host: get('ssh_host') ?? '',
      ssh_user: get('ssh_user') ?? 'root',
      ssh_port: get('ssh_port') ?? '22',
      is_control_plane: String(/is_control_plane:\s*true/.test(block)),
      is_exit_node: String(/is_exit_node:\s*true/.test(block)),
      is_whitelist_bridge: String(/is_whitelist_bridge:\s*true/.test(block)),
      vless: /vless:\s*"?([^"\n]+)"?/.exec(block)?.[1]?.trim() ?? '',
      hysteria: /hysteria:\s*"?([^"\n]+)"?/.exec(block)?.[1]?.trim() ?? '',
    };
  }
  return null;
}

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error('usage: add-node <node_code>');
  const n = loadNode(code);
  if (!n) throw new Error(`node ${code} not found in infra/nodes/nodes.local.yml`);

  const node = await prisma.node.upsert({
    where: { code },
    update: {
      countryCode: n.country_code, role: n.role, publicIpv4: n.public_ipv4 || null,
      sshHost: n.ssh_host || null, sshUser: n.ssh_user, sshPort: Number(n.ssh_port),
      isControlPlane: n.is_control_plane === 'true', isExitNode: n.is_exit_node === 'true', isWhitelistBridge: n.is_whitelist_bridge === 'true',
      vlessDomain: n.vless || null, hysteriaDomain: n.hysteria || null, vlessPort: 443, hysteriaPort: 443, isActive: true,
    },
    create: {
      code, title: code, countryCode: n.country_code, role: n.role, publicIpv4: n.public_ipv4 || null,
      sshHost: n.ssh_host || null, sshUser: n.ssh_user, sshPort: Number(n.ssh_port),
      isControlPlane: n.is_control_plane === 'true', isExitNode: n.is_exit_node === 'true', isWhitelistBridge: n.is_whitelist_bridge === 'true',
      vlessDomain: n.vless || null, hysteriaDomain: n.hysteria || null, vlessPort: 443, hysteriaPort: 443, isActive: true,
    },
  });
  // eslint-disable-next-line no-console
  console.log(`Registered node ${node.code} (${node.role}). Run: make deploy-node NODE_CODE=${node.code}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
