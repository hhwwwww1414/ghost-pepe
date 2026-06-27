import { getConfig } from '@ghostpepe/config';
import { prisma, Prisma } from '@ghostpepe/db';
import {
  PROFILE_DEFINITIONS,
  DEVICE_STATUS,
  ERROR_CODES,
  buildClientIdentifier,
  encryptSecret,
  hashToken,
  newUuid,
  randomToken,
  type Platform,
} from '@ghostpepe/shared';
import { tokenHash, newDeviceSubscriptionToken } from '../lib/tokens.js';
import { audit } from '../lib/audit.js';

export class DeviceLimitError extends Error {
  code = ERROR_CODES.DEVICE_LIMIT_REACHED;
  constructor() {
    super('Device limit reached');
  }
}

export interface CreateDeviceInput {
  subscriptionId: string;
  platform: Platform;
  displayName: string;
  installId?: string | null;
  happInstallId?: string | null;
  hwid?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  actorIp?: string | null;
}

function hashOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  return hashToken(v, getConfig().TOKEN_HASH_SECRET);
}

/**
 * Idempotent device creation with the hard 5-device limit (docs 04 §4).
 * Uses a transaction + SELECT ... FOR UPDATE on the subscription so two
 * concurrent imports can never create a 6th device.
 *
 * Repeat import from the same device (same install/hwid hash) returns the
 * SAME device — never creates a duplicate.
 */
export async function createOrFindDeviceWithCredentials(input: CreateDeviceInput) {
  const cfg = getConfig();
  const installIdHash = hashOrNull(input.installId);
  const happInstallIdHash = hashOrNull(input.happInstallId);
  const hwidHash = hashOrNull(input.hwid);
  const userAgentHash = hashOrNull(input.userAgent);

  return prisma.$transaction(async (tx) => {
    // Lock the subscription row to serialise concurrent imports.
    const locked = await tx.$queryRaw<Array<{ id: string; user_id: string; device_limit: number }>>(
      Prisma.sql`SELECT id, user_id, device_limit FROM subscriptions WHERE id = ${input.subscriptionId}::uuid FOR UPDATE`,
    );
    const sub = locked[0];
    if (!sub) throw new Error('subscription not found');
    const userId = sub.user_id;
    const deviceLimit = sub.device_limit;

    // 1. Try to find an existing device by any stable fingerprint.
    const existing = await tx.device.findFirst({
      where: {
        userId,
        status: { not: DEVICE_STATUS.REVOKED },
        OR: [
          installIdHash ? { installIdHash } : undefined,
          happInstallIdHash ? { happInstallIdHash } : undefined,
          hwidHash ? { hwidHash } : undefined,
        ].filter(Boolean) as Prisma.DeviceWhereInput[],
      },
      include: { credentials: true },
    });

    if (existing) {
      // Re-activate if it was disabled by a re-import? No — only user/admin
      // re-enables. Just refresh last seen and return same device+credentials.
      await tx.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), lastIpHash: input.ipHash ?? existing.lastIpHash },
      });
      const creds = await tx.deviceCredential.findMany({ where: { deviceId: existing.id } });
      return { device: existing, credentials: creds, created: false };
    }

    // 2. Enforce the limit (only count active devices).
    const activeCount = await tx.device.count({ where: { userId, status: DEVICE_STATUS.ACTIVE } });
    if (activeCount >= deviceLimit) {
      throw new DeviceLimitError();
    }

    // 3. Create the device.
    const device = await tx.device.create({
      data: {
        userId,
        subscriptionId: input.subscriptionId,
        publicDeviceId: `dev_${randomToken(10)}`,
        displayName: input.displayName,
        platform: input.platform,
        status: DEVICE_STATUS.ACTIVE,
        installIdHash,
        happInstallIdHash,
        hwidHash,
        userAgentHash,
        firstIpHash: input.ipHash ?? null,
        lastIpHash: input.ipHash ?? null,
        lastSeenAt: new Date(),
      },
    });

    // 4. Create credentials for ALL 8 profile combinations.
    const nodeCache = new Map<string, string>();
    const nodeIdByCode = async (code: string): Promise<string> => {
      if (nodeCache.has(code)) return nodeCache.get(code)!;
      const node = await tx.node.findUnique({ where: { code } });
      if (!node) throw new Error(`node ${code} missing — run db:seed`);
      nodeCache.set(code, node.id);
      return node.id;
    };

    const credentials = [];
    for (const def of PROFILE_DEFINITIONS) {
      const ingressNodeId = await nodeIdByCode(def.ingressNodeCode);
      const exitNodeId = await nodeIdByCode(def.exitNodeCode);
      const xrayEmail = buildClientIdentifier({
        userId,
        deviceId: device.id,
        protocol: def.protocol,
        nodeCode: def.ingressNodeCode,
        mode: def.mode,
      });

      const vlessUuid = def.protocol === 'vless' ? newUuid() : null;
      const hyAuth = def.protocol === 'hysteria' ? randomToken(32) : null;

      const cred = await tx.deviceCredential.create({
        data: {
          userId,
          subscriptionId: input.subscriptionId,
          deviceId: device.id,
          profileCode: def.code,
          protocol: def.protocol,
          mode: def.mode,
          nodeId: ingressNodeId,
          exitNodeId,
          credentialPublicId: newDeviceSubscriptionToken(),
          xrayEmail,
          vlessUuidEncrypted: vlessUuid ? encryptSecret(vlessUuid, cfg.ENCRYPTION_MASTER_KEY) : null,
          hysteriaAuthTokenEncrypted: hyAuth ? encryptSecret(hyAuth, cfg.ENCRYPTION_MASTER_KEY) : null,
          hysteriaAuthTokenHash: hyAuth ? tokenHash(hyAuth) : null,
          status: DEVICE_STATUS.ACTIVE,
        },
      });
      credentials.push(cred);
    }

    await audit({
      actorType: 'user',
      actorId: userId,
      action: 'device.created',
      entityType: 'device',
      entityId: device.id,
      after: { platform: device.platform, displayName: device.displayName },
      ip: input.actorIp ?? null,
    });

    return { device, credentials, created: true };
  });
}

/**
 * Disable a device + all its credentials (docs 04 §4.3). Does NOT delete — keeps
 * traffic history. Hysteria auth will then fail and node-agent kicks sessions.
 */
export async function disableDevice(deviceId: string, by: 'user' | 'admin' | 'system', actorId?: string, ip?: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new Error('device not found');
  await prisma.$transaction([
    prisma.device.update({
      where: { id: deviceId },
      data: { status: DEVICE_STATUS.DISABLED, disabledAt: new Date(), disabledBy: by },
    }),
    prisma.deviceCredential.updateMany({
      where: { deviceId },
      data: { status: DEVICE_STATUS.DISABLED },
    }),
  ]);
  await audit({
    actorType: by,
    actorId: actorId ?? null,
    action: 'device.disabled',
    entityType: 'device',
    entityId: deviceId,
    before: { status: device.status },
    after: { status: DEVICE_STATUS.DISABLED, by },
    ip: ip ?? null,
  });
}
