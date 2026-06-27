import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getConfig } from '@ghostpepe/config';
import { isSupportedPlatform, platformDisplayName, ERROR_CODES, type Platform } from '@ghostpepe/shared';
import { evaluateAccess } from '../services/access.js';
import { findSubscriptionByPageToken } from '../services/subscriptions.js';
import { createOrFindDeviceWithCredentials, DeviceLimitError } from '../services/devices.js';
import { prisma } from '@ghostpepe/db';
import { kvIncr } from '../lib/kv.js';
import { hashToken } from '@ghostpepe/shared';

/**
 * Subscription-page backend (docs 03, 06 §10/§12).
 * The page is served by apps/sub-page; these JSON endpoints power it.
 */
export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  // Page info (status, expiry, device count) for a public page token.
  app.get('/api/import/:publicToken', async (req, reply) => {
    const { publicToken } = req.params as { publicToken: string };
    const sub = await findSubscriptionByPageToken(publicToken);
    if (!sub) return reply.code(404).send({ error: ERROR_CODES.TOKEN_REVOKED, message: 'Ссылка устарела. Получите новую ссылку в боте.' });

    const access = evaluateAccess(sub.user, sub);
    const deviceCount = await prisma.device.count({ where: { userId: sub.userId, status: 'active' } });

    return {
      serviceName: getConfig().HAPP_SUBSCRIPTION_NAME,
      status: sub.status,
      access: access.ok,
      accessReason: access.reason ?? null,
      expiresAt: sub.expiresAt.toISOString(),
      trafficLimitBytes: sub.trafficLimitBytes.toString(),
      trafficUsedBytes: sub.trafficUsedBytes.toString(),
      deviceLimit: sub.deviceLimit,
      deviceCount,
      supportUrl: getConfig().HAPP_SUPPORT_URL,
    };
  });

  // Start an import: create/find device, return Happ import url + body url.
  const startBody = z.object({
    publicToken: z.string(),
    platform: z.string(),
    installId: z.string().optional(),
    happInstallId: z.string().optional(),
    hwid: z.string().optional(),
  });
  app.post('/api/subscription/import/start', async (req, reply) => {
    const parsed = startBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const { publicToken, platform, installId, happInstallId, hwid } = parsed.data;

    // Rate limit per token+ip.
    const ip = req.ip;
    const rl = await kvIncr(`import:${hashToken(publicToken + ip, getConfig().TOKEN_HASH_SECRET)}`, 60);
    if (rl > 20) return reply.code(429).send({ error: ERROR_CODES.RATE_LIMITED });

    if (!isSupportedPlatform(platform)) {
      return reply.code(400).send({ error: ERROR_CODES.PLATFORM_UNSUPPORTED, message: 'Откройте эту кнопку с нужного устройства.' });
    }

    const sub = await findSubscriptionByPageToken(publicToken);
    if (!sub) return reply.code(404).send({ error: ERROR_CODES.TOKEN_REVOKED, message: 'Ссылка устарела.' });

    const access = evaluateAccess(sub.user, sub);
    if (!access.ok) return reply.code(403).send({ error: access.code, message: access.reason });

    const userAgent = req.headers['user-agent'] ?? '';
    const ipHash = hashToken(ip, getConfig().TOKEN_HASH_SECRET);
    const displayName = `${platformDisplayName(platform as Platform)} • ${new Date().toLocaleDateString('ru-RU')}`;

    try {
      const { device } = await createOrFindDeviceWithCredentials({
        subscriptionId: sub.id,
        platform: platform as Platform,
        displayName,
        installId: installId ?? null,
        happInstallId: happInstallId ?? null,
        hwid: hwid ?? null,
        userAgent,
        ipHash,
        actorIp: ip,
      });

      const apiBase = getConfig().API_BASE_URL.replace(/\/$/, '');
      const bodyUrl = `${apiBase}/sub/${device.publicDeviceId}`;
      // Happ import deeplink: happ://add/<base64(url)> per Happ docs.
      const happImportUrl = `happ://add/${Buffer.from(bodyUrl, 'utf8').toString('base64')}`;

      return {
        ok: true,
        deviceId: device.publicDeviceId,
        subscriptionBodyUrl: bodyUrl,
        happImportUrl,
        deviceName: device.displayName,
      };
    } catch (err) {
      if (err instanceof DeviceLimitError) {
        return reply.code(409).send({ error: ERROR_CODES.DEVICE_LIMIT_REACHED, message: 'У вас уже 5 устройств. Удалите одно устройство в боте.' });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // Android TV import: record event, don't count as a device yet (docs 03 §14).
  app.post('/api/subscription/tv/send', async (req, reply) => {
    const body = z.object({ publicToken: z.string(), tvCode: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const sub = await findSubscriptionByPageToken(body.data.publicToken);
    if (!sub) return reply.code(404).send({ error: ERROR_CODES.TOKEN_REVOKED });
    const access = evaluateAccess(sub.user, sub);
    if (!access.ok) return reply.code(403).send({ error: access.code, message: access.reason });
    // In production: call Happ TV API with tvCode + body url. Here we record the event.
    await prisma.auditLog.create({
      data: { actorType: 'user', actorId: sub.userId, action: 'tv_import_sent', entityType: 'subscription', entityId: sub.id, afterJson: { tvCode: body.data.tvCode } as never },
    });
    return { ok: true };
  });
}
