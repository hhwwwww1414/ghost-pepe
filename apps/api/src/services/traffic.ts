import { prisma } from '@ghostpepe/db';
import { SUBSCRIPTION_STATUS, computeDelta, parseClientIdentifier } from '@ghostpepe/shared';
import { audit } from '../lib/audit.js';
import { enforceCredentialAccess } from './enforcement.js';

export interface TrafficEntry {
  /** xray email / hysteria client id == credential identifier */
  clientId: string;
  /** current monotonic counters reported by the node */
  uplinkBytes: bigint;
  downlinkBytes: bigint;
  source: 'xray_stats' | 'hysteria_stats';
  windowStart: string;
  windowEnd: string;
}

/**
 * Ingest a batch of traffic counters from a node-agent (docs 04 §5–7, 06 §11).
 * Counters are absolute; we store last-seen offsets and persist only positive
 * deltas. A counter that shrank = service restart => delta is the new value.
 * Aggregates into subscription usage and trips traffic_limited on quota.
 */
export async function ingestTrafficBatch(nodeCode: string, entries: TrafficEntry[]): Promise<{ applied: number }> {
  const node = await prisma.node.findUnique({ where: { code: nodeCode } });
  if (!node) throw new Error(`unknown node ${nodeCode}`);

  let applied = 0;
  const affectedSubscriptions = new Set<string>();

  for (const entry of entries) {
    const parsed = parseClientIdentifier(entry.clientId);
    if (!parsed) continue;
    const cred = await prisma.deviceCredential.findFirst({ where: { xrayEmail: entry.clientId } });
    if (!cred) continue;

    const offset = await prisma.statsOffset.findUnique({
      where: { credentialId_source: { credentialId: cred.id, source: entry.source } },
    });
    const prevUp = offset?.lastUplinkCounter ?? 0n;
    const prevDown = offset?.lastDownlinkCounter ?? 0n;
    const deltaUp = computeDelta(prevUp, entry.uplinkBytes);
    const deltaDown = computeDelta(prevDown, entry.downlinkBytes);

    await prisma.statsOffset.upsert({
      where: { credentialId_source: { credentialId: cred.id, source: entry.source } },
      update: { lastUplinkCounter: entry.uplinkBytes, lastDownlinkCounter: entry.downlinkBytes },
      create: {
        credentialId: cred.id,
        source: entry.source,
        lastUplinkCounter: entry.uplinkBytes,
        lastDownlinkCounter: entry.downlinkBytes,
      },
    });

    if (deltaUp === 0n && deltaDown === 0n) continue;

    await prisma.trafficUsageEvent.create({
      data: {
        userId: cred.userId,
        subscriptionId: cred.subscriptionId,
        deviceId: cred.deviceId,
        credentialId: cred.id,
        nodeId: node.id,
        protocol: cred.protocol,
        mode: cred.mode,
        uplinkBytes: deltaUp,
        downlinkBytes: deltaDown,
        source: entry.source,
        statWindowStart: new Date(entry.windowStart),
        statWindowEnd: new Date(entry.windowEnd),
      },
    });

    await prisma.trafficCounter.upsert({
      where: { credentialId: cred.id },
      update: {
        uplinkBytes: { increment: deltaUp },
        downlinkBytes: { increment: deltaDown },
        totalBytes: { increment: deltaUp + deltaDown },
        lastSyncedAt: new Date(),
      },
      create: {
        userId: cred.userId,
        subscriptionId: cred.subscriptionId,
        deviceId: cred.deviceId,
        credentialId: cred.id,
        nodeId: node.id,
        protocol: cred.protocol,
        mode: cred.mode,
        uplinkBytes: deltaUp,
        downlinkBytes: deltaDown,
        totalBytes: deltaUp + deltaDown,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.subscription.update({
      where: { id: cred.subscriptionId },
      data: { trafficUsedBytes: { increment: deltaUp + deltaDown } },
    });
    affectedSubscriptions.add(cred.subscriptionId);
    applied++;
  }

  // Enforce quota after aggregation.
  for (const subId of affectedSubscriptions) {
    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    if (!sub) continue;
    if (sub.trafficLimitBytes > 0n && sub.trafficUsedBytes >= sub.trafficLimitBytes && sub.status === SUBSCRIPTION_STATUS.ACTIVE) {
      await prisma.subscription.update({ where: { id: subId }, data: { status: SUBSCRIPTION_STATUS.TRAFFIC_LIMITED } });
      await prisma.deviceCredential.updateMany({ where: { subscriptionId: subId, status: 'active' }, data: { status: 'disabled' } });
      await audit({
        actorType: 'system',
        action: 'subscription.traffic_limited',
        entityType: 'subscription',
        entityId: subId,
        after: { used: sub.trafficUsedBytes.toString(), limit: sub.trafficLimitBytes.toString() },
      });
      await enforceCredentialAccess(subId);
    }
  }

  return { applied };
}
