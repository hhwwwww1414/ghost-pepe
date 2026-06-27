import { getConfig } from '@ghostpepe/config';
import { prisma } from '@ghostpepe/db';
import { DEVICE_STATUS, decryptSecret, NON_SERVING_SUBSCRIPTION_STATUSES } from '@ghostpepe/shared';

export interface DesiredVlessUser {
  uuid: string;
  email: string;
  profileCode: string;
  mode: string;
}

export interface DesiredState {
  nodeCode: string;
  role: string;
  generatedAt: string;
  /** exit-node regular VLESS inbound users */
  vlessUsers: DesiredVlessUser[];
  /** bridge inbound -> users (YC only) */
  bridgeInbounds: Record<string, DesiredVlessUser[]>;
}

/**
 * Compute the desired credential state for a node (docs 04 §8.4, 06 §16).
 * Only serves credentials of active devices on serving subscriptions; disabled
 * /revoked creds and expired/blocked/limited subs are excluded so the node-agent
 * reconciles them away.
 */
export async function getDesiredState(nodeCode: string): Promise<DesiredState> {
  const cfg = getConfig();
  const node = await prisma.node.findUnique({ where: { code: nodeCode } });
  if (!node) throw new Error(`unknown node ${nodeCode}`);

  const creds = await prisma.deviceCredential.findMany({
    where: {
      node: { code: nodeCode },
      protocol: 'vless',
      status: DEVICE_STATUS.ACTIVE,
      device: { status: DEVICE_STATUS.ACTIVE },
      subscription: { status: { notIn: NON_SERVING_SUBSCRIPTION_STATUSES as unknown as string[] } },
    },
    include: { exitNode: true },
  });

  const vlessUsers: DesiredVlessUser[] = [];
  const bridgeInbounds: Record<string, DesiredVlessUser[]> = {};

  for (const c of creds) {
    if (!c.vlessUuidEncrypted) continue;
    const user: DesiredVlessUser = {
      uuid: decryptSecret(c.vlessUuidEncrypted, cfg.ENCRYPTION_MASTER_KEY),
      email: c.xrayEmail ?? '',
      profileCode: c.profileCode,
      mode: c.mode,
    };
    if (c.mode === 'whitelist' && node.isWhitelistBridge) {
      const exitRegion = c.exitNode?.countryCode === 'DE' ? 'de' : 'fi';
      const inbound = `wl-vless-to-${exitRegion}`;
      (bridgeInbounds[inbound] ??= []).push(user);
    } else {
      vlessUsers.push(user);
    }
  }

  return {
    nodeCode,
    role: node.role,
    generatedAt: new Date().toISOString(),
    vlessUsers,
    bridgeInbounds,
  };
}

export interface HeartbeatInput {
  xrayAlive: boolean;
  hysteriaAlive: boolean;
  loadAvg: number;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  rxBytes5m: bigint;
  txBytes5m: bigint;
  activeVlessDevices: number;
  activeHysteriaDevices: number;
}

export async function recordHeartbeat(nodeCode: string, hb: HeartbeatInput): Promise<void> {
  const node = await prisma.node.findUnique({ where: { code: nodeCode } });
  if (!node) throw new Error(`unknown node ${nodeCode}`);
  await prisma.serverMetric.create({ data: { nodeId: node.id, ...hb } });
  if (!hb.xrayAlive) {
    await prisma.nodeHealthEvent.create({ data: { nodeId: node.id, level: 'error', kind: 'xray_down', message: 'Xray reported not alive' } });
  }
  if (!hb.hysteriaAlive) {
    await prisma.nodeHealthEvent.create({ data: { nodeId: node.id, level: 'error', kind: 'hysteria_down', message: 'Hysteria reported not alive' } });
  }
}

/** Hysteria HTTP auth check (docs 02 §5). Returns the stable client id when ok. */
export async function hysteriaAuth(authToken: string): Promise<{ ok: boolean; id?: string }> {
  const { tokenHash } = await import('../lib/tokens.js');
  const cred = await prisma.deviceCredential.findUnique({
    where: { hysteriaAuthTokenHash: tokenHash(authToken) },
    include: { device: true, subscription: true, user: true },
  });
  if (!cred) return { ok: false };
  if (cred.status !== DEVICE_STATUS.ACTIVE || cred.device.status !== DEVICE_STATUS.ACTIVE) return { ok: false };
  const { evaluateAccess } = await import('./access.js');
  const access = evaluateAccess(cred.user, cred.subscription);
  if (!access.ok) return { ok: false };
  return { ok: true, id: cred.xrayEmail ?? undefined };
}
