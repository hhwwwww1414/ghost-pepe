import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@ghostpepe/db';
import { verifyPassword, maskSecret, SUBSCRIPTION_STATUS } from '@ghostpepe/shared';
import { computeNewExpiry } from '@ghostpepe/billing';
import { disableDevice } from '../services/devices.js';
import { audit } from '../lib/audit.js';

/** Admin API (docs 05 §12.4, 06 §15.3). All routes except /admin/login require JWT. */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/admin/')) return;
    if (req.url.startsWith('/admin/login')) return;
    return app.adminAuth(req, reply);
  });

  app.post('/admin/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const admin = await prisma.adminUser.findUnique({ where: { email: body.data.email } });
    if (!admin || !admin.isActive || !verifyPassword(body.data.password, admin.passwordHash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await audit({ actorType: 'admin', actorId: admin.id, action: 'admin.login', entityType: 'admin_user', entityId: admin.id, ip: req.ip });
    const token = await reply.jwtSign({ sub: admin.id, role: admin.role, email: admin.email }, { expiresIn: '12h' });
    return { token, role: admin.role, email: admin.email };
  });

  app.get('/admin/me', async (req) => ({ user: req.user }));

  app.get('/admin/dashboard', async () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const [activeSubs, expiringSubs, activeDevices, starsAgg, nodes, recentMetrics] = await Promise.all([
      prisma.subscription.count({ where: { status: SUBSCRIPTION_STATUS.ACTIVE } }),
      prisma.subscription.count({ where: { status: SUBSCRIPTION_STATUS.ACTIVE, expiresAt: { lte: soon } } }),
      prisma.device.count({ where: { status: 'active' } }),
      prisma.payment.aggregate({ _sum: { starsAmount: true }, where: { status: 'paid' } }),
      prisma.node.findMany(),
      prisma.serverMetric.findMany({ orderBy: { checkedAt: 'desc' }, take: 50 }),
    ]);
    const latestByNode = new Map<string, (typeof recentMetrics)[number]>();
    for (const m of recentMetrics) if (!latestByNode.has(m.nodeId)) latestByNode.set(m.nodeId, m);

    const traffic = await prisma.trafficUsageEvent.groupBy({
      by: ['mode', 'protocol'],
      _sum: { uplinkBytes: true, downlinkBytes: true },
      where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });

    return {
      activeSubscriptions: activeSubs,
      expiringSubscriptions: expiringSubs,
      activeDevices,
      revenueStars: starsAgg._sum.starsAmount ?? 0,
      nodes: nodes.map((n) => {
        const m = latestByNode.get(n.id);
        const online = m ? now.getTime() - m.checkedAt.getTime() < 2 * 60 * 1000 : false;
        return {
          code: n.code, country: n.countryCode, role: n.role, online,
          xrayAlive: m?.xrayAlive ?? false, hysteriaAlive: m?.hysteriaAlive ?? false,
          cpu: m?.cpuPercent ?? 0, ram: m?.ramPercent ?? 0, disk: m?.diskPercent ?? 0,
          lastHeartbeat: m?.checkedAt.toISOString() ?? null,
        };
      }),
      traffic24h: traffic.map((t) => ({ mode: t.mode, protocol: t.protocol, bytes: ((t._sum.uplinkBytes ?? 0n) + (t._sum.downlinkBytes ?? 0n)).toString() })),
    };
  });

  app.get('/admin/users', async (req) => {
    const q = z.object({ search: z.string().optional(), take: z.coerce.number().default(50), skip: z.coerce.number().default(0) }).parse(req.query);
    const where = q.search ? { OR: [{ username: { contains: q.search, mode: 'insensitive' as const } }] } : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, take: q.take, skip: q.skip, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return { total, users: users.map((u) => ({ id: u.id, telegramId: u.telegramId.toString(), username: u.username, status: u.status, createdAt: u.createdAt.toISOString() })) };
  });

  app.get('/admin/users/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        devices: { orderBy: { firstSeenAt: 'asc' } },
        payments: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const counters = await prisma.trafficCounter.findMany({ where: { userId: id } });
    return {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      status: user.status,
      subscriptions: user.subscriptions.map((s) => ({ id: s.id, status: s.status, plan: s.plan.title, expiresAt: s.expiresAt.toISOString(), trafficUsedBytes: s.trafficUsedBytes.toString(), trafficLimitBytes: s.trafficLimitBytes.toString() })),
      devices: user.devices.map((d) => ({ id: d.publicDeviceId, name: d.displayName, platform: d.platform, status: d.status, lastSeenAt: d.lastSeenAt?.toISOString() ?? null })),
      payments: user.payments.map((p) => ({ id: p.id, status: p.status, stars: p.starsAmount, plan: p.plan.title, paidAt: p.paidAt?.toISOString() ?? null })),
      traffic: counters.map((c) => ({ protocol: c.protocol, mode: c.mode, total: c.totalBytes.toString() })),
    };
  });

  app.post('/admin/users/:id/block', async (req) => {
    const id = (req.params as { id: string }).id;
    await prisma.user.update({ where: { id }, data: { status: 'blocked' } });
    await prisma.subscription.updateMany({ where: { userId: id }, data: { status: SUBSCRIPTION_STATUS.BLOCKED } });
    await prisma.deviceCredential.updateMany({ where: { userId: id, status: 'active' }, data: { status: 'disabled' } });
    await audit({ actorType: 'admin', actorId: req.user.sub, action: 'user.block', entityType: 'user', entityId: id, ip: req.ip });
    return { ok: true };
  });

  app.post('/admin/users/:id/unblock', async (req) => {
    const id = (req.params as { id: string }).id;
    await prisma.user.update({ where: { id }, data: { status: 'active' } });
    await audit({ actorType: 'admin', actorId: req.user.sub, action: 'user.unblock', entityType: 'user', entityId: id, ip: req.ip });
    return { ok: true };
  });

  app.get('/admin/subscriptions', async (req) => {
    const q = z.object({ take: z.coerce.number().default(50), skip: z.coerce.number().default(0) }).parse(req.query);
    const subs = await prisma.subscription.findMany({ include: { plan: true, user: true }, orderBy: { createdAt: 'desc' }, take: q.take, skip: q.skip });
    return subs.map((s) => ({ id: s.id, user: s.user.username ?? s.user.telegramId.toString(), plan: s.plan.title, status: s.status, expiresAt: s.expiresAt.toISOString() }));
  });

  app.patch('/admin/subscriptions/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ extendDays: z.number().optional(), status: z.string().optional() }).parse(req.body);
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return { ok: false };
    const data: Record<string, unknown> = {};
    if (body.extendDays) data.expiresAt = computeNewExpiry(sub.expiresAt, body.extendDays);
    if (body.status) data.status = body.status;
    await prisma.subscription.update({ where: { id }, data });
    await audit({ actorType: 'admin', actorId: req.user.sub, action: 'subscription.update', entityType: 'subscription', entityId: id, before: { status: sub.status }, after: data, ip: req.ip });
    return { ok: true };
  });

  app.post('/admin/subscriptions/:id/extend', async (req) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ days: z.number() }).parse(req.body);
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return { ok: false };
    await prisma.subscription.update({ where: { id }, data: { expiresAt: computeNewExpiry(sub.expiresAt, body.days), status: SUBSCRIPTION_STATUS.ACTIVE } });
    await audit({ actorType: 'admin', actorId: req.user.sub, action: 'subscription.extend', entityType: 'subscription', entityId: id, after: { days: body.days }, ip: req.ip });
    return { ok: true };
  });

  app.get('/admin/devices', async (req) => {
    const q = z.object({ take: z.coerce.number().default(50) }).parse(req.query);
    const devices = await prisma.device.findMany({ include: { user: true }, orderBy: { firstSeenAt: 'desc' }, take: q.take });
    return devices.map((d) => ({ id: d.publicDeviceId, user: d.user.username ?? d.user.telegramId.toString(), name: d.displayName, platform: d.platform, status: d.status }));
  });

  app.post('/admin/devices/:publicId/disable', async (req) => {
    const publicId = (req.params as { publicId: string }).publicId;
    const device = await prisma.device.findUnique({ where: { publicDeviceId: publicId } });
    if (!device) return { ok: false };
    await disableDevice(device.id, 'admin', req.user.sub, req.ip);
    return { ok: true };
  });

  app.get('/admin/nodes', async () => {
    const nodes = await prisma.node.findMany({ include: { profiles: true } });
    const result = [];
    for (const n of nodes) {
      const m = await prisma.serverMetric.findFirst({ where: { nodeId: n.id }, orderBy: { checkedAt: 'desc' } });
      result.push({
        id: n.id, code: n.code, title: n.title, country: n.countryCode, role: n.role,
        publicIpv4: n.publicIpv4 ? maskSecret(n.publicIpv4) : null,
        vlessDomain: n.vlessDomain, hysteriaDomain: n.hysteriaDomain,
        isActive: n.isActive, profiles: n.profiles.length,
        metric: m ? { xrayAlive: m.xrayAlive, hysteriaAlive: m.hysteriaAlive, cpu: m.cpuPercent, ram: m.ramPercent, disk: m.diskPercent, lastHeartbeat: m.checkedAt.toISOString() } : null,
      });
    }
    return result;
  });

  app.get('/admin/nodes/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const node = await prisma.node.findUnique({ where: { id }, include: { profiles: true } });
    if (!node) return reply.code(404).send({ error: 'not_found' });
    const metrics = await prisma.serverMetric.findMany({ where: { nodeId: id }, orderBy: { checkedAt: 'desc' }, take: 50 });
    const health = await prisma.nodeHealthEvent.findMany({ where: { nodeId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      code: node.code, title: node.title, role: node.role, country: node.countryCode,
      profiles: node.profiles.map((p) => ({ code: p.profileCode, label: p.label, protocol: p.protocol, mode: p.mode, ruDirect: p.ruDirect, endpoint: p.endpointHost })),
      metrics: metrics.map((m) => ({ at: m.checkedAt.toISOString(), cpu: m.cpuPercent, ram: m.ramPercent, disk: m.diskPercent, rx: m.rxBytes5m.toString(), tx: m.txBytes5m.toString(), activeVless: m.activeVlessDevices, activeHysteria: m.activeHysteriaDevices })),
      health: health.map((h) => ({ at: h.createdAt.toISOString(), level: h.level, kind: h.kind, message: h.message })),
    };
  });

  app.get('/admin/traffic', async (req) => {
    const q = z.object({ days: z.coerce.number().default(1) }).parse(req.query);
    const since = new Date(Date.now() - q.days * 24 * 60 * 60 * 1000);
    const [byNode, byProtocolMode] = await Promise.all([
      prisma.trafficUsageEvent.groupBy({ by: ['nodeId'], _sum: { uplinkBytes: true, downlinkBytes: true }, where: { createdAt: { gte: since } } }),
      prisma.trafficUsageEvent.groupBy({ by: ['protocol', 'mode'], _sum: { uplinkBytes: true, downlinkBytes: true }, where: { createdAt: { gte: since } } }),
    ]);
    const nodes = await prisma.node.findMany();
    const nodeName = new Map(nodes.map((n) => [n.id, n.code]));
    return {
      byNode: byNode.map((b) => ({ node: nodeName.get(b.nodeId) ?? b.nodeId, bytes: ((b._sum.uplinkBytes ?? 0n) + (b._sum.downlinkBytes ?? 0n)).toString() })),
      byProtocolMode: byProtocolMode.map((b) => ({ protocol: b.protocol, mode: b.mode, bytes: ((b._sum.uplinkBytes ?? 0n) + (b._sum.downlinkBytes ?? 0n)).toString() })),
    };
  });

  app.get('/admin/payments', async (req) => {
    const q = z.object({ take: z.coerce.number().default(50) }).parse(req.query);
    const payments = await prisma.payment.findMany({ include: { user: true, plan: true }, orderBy: { createdAt: 'desc' }, take: q.take });
    return payments.map((p) => ({ id: p.id, user: p.user.username ?? p.user.telegramId.toString(), plan: p.plan.title, stars: p.starsAmount, currency: p.currency, status: p.status, paidAt: p.paidAt?.toISOString() ?? null }));
  });

  app.get('/admin/audit-log', async (req) => {
    const q = z.object({ take: z.coerce.number().default(100) }).parse(req.query);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: q.take });
    return logs.map((l) => ({ at: l.createdAt.toISOString(), actorType: l.actorType, actorId: l.actorId, action: l.action, entityType: l.entityType, entityId: l.entityId }));
  });

  app.get('/admin/plans', async () => prisma.plan.findMany({ orderBy: { starsPrice: 'asc' } }));
}
