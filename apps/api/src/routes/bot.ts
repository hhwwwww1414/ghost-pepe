import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@ghostpepe/db';
import { PROFILE_DEFINITIONS } from '@ghostpepe/shared';
import { buildInvoicePayload, buildStarsPrices } from '@ghostpepe/billing';
import { upsertUser, findUserByTelegramId } from '../services/users.js';
import { createPaymentIntent, approvePreCheckout, applySuccessfulPayment } from '../services/payments.js';
import { currentSubscription, getOrIssuePageToken, buildImportPageUrl } from '../services/subscriptions.js';
import { disableDevice } from '../services/devices.js';

/** Internal API consumed by the Telegram bot worker. Guarded by internal token. */
export async function registerBotRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/internal/bot')) return;
    return app.internalAuth(req, reply);
  });

  app.get('/internal/bot/plans', async () => {
    const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { starsPrice: 'asc' } });
    return plans.map((p) => ({ code: p.code, title: p.title, starsPrice: p.starsPrice, durationDays: p.durationDays, trafficLimitBytes: p.trafficLimitBytes.toString() }));
  });

  app.post('/internal/bot/users/upsert', async (req) => {
    const body = z
      .object({ telegramId: z.coerce.bigint(), username: z.string().nullish(), firstName: z.string().nullish(), lastName: z.string().nullish(), languageCode: z.string().nullish() })
      .parse(req.body);
    const user = await upsertUser(body);
    return { id: user.id, status: user.status };
  });

  app.get('/internal/bot/users/:telegramId/subscription', async (req, reply) => {
    const telegramId = BigInt((req.params as { telegramId: string }).telegramId);
    const user = await findUserByTelegramId(telegramId);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const sub = await currentSubscription(user.id);
    if (!sub) return { hasSubscription: false };

    const deviceCount = await prisma.device.count({ where: { userId: user.id, status: 'active' } });
    const pageToken = await getOrIssuePageToken(sub.id);

    return {
      hasSubscription: true,
      status: sub.status,
      plan: sub.plan.title,
      expiresAt: sub.expiresAt.toISOString(),
      trafficLimitBytes: sub.trafficLimitBytes.toString(),
      trafficUsedBytes: sub.trafficUsedBytes.toString(),
      deviceLimit: sub.deviceLimit,
      deviceCount,
      importPageUrl: buildImportPageUrl(pageToken),
      profiles: PROFILE_DEFINITIONS.map((p) => ({ code: p.code, label: p.label })),
      userBlocked: user.status === 'blocked',
    };
  });

  app.get('/internal/bot/devices', async (req, reply) => {
    const telegramId = BigInt((req.query as { telegramId: string }).telegramId);
    const user = await findUserByTelegramId(telegramId);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const devices = await prisma.device.findMany({ where: { userId: user.id, status: { not: 'revoked' } }, orderBy: { firstSeenAt: 'asc' } });
    return devices.map((d) => ({ id: d.publicDeviceId, name: d.displayName, platform: d.platform, status: d.status, lastSeenAt: d.lastSeenAt?.toISOString() ?? null }));
  });

  app.post('/internal/bot/devices/:publicId/disable', async (req, reply) => {
    const publicId = (req.params as { publicId: string }).publicId;
    const telegramId = BigInt((z.object({ telegramId: z.coerce.bigint() }).parse(req.body)).telegramId.toString());
    const user = await findUserByTelegramId(telegramId);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const device = await prisma.device.findFirst({ where: { publicDeviceId: publicId, userId: user.id } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });
    await disableDevice(device.id, 'user', user.id);
    return { ok: true };
  });

  // ── Payments (Stars) ───────────────────────────────────────────────────────
  app.post('/internal/bot/payments/create-intent', async (req, reply) => {
    const body = z.object({ telegramId: z.coerce.bigint(), planCode: z.string() }).parse(req.body);
    const user = await findUserByTelegramId(body.telegramId);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const payload = buildInvoicePayload(body.telegramId, body.planCode);
    const { plan } = await createPaymentIntent({ userId: user.id, telegramId: body.telegramId, planCode: body.planCode, invoicePayload: payload });
    return {
      invoicePayload: payload,
      title: plan.title,
      description: `Подписка ${plan.title}`,
      currency: 'XTR',
      prices: buildStarsPrices(plan.starsPrice, plan.title),
      starsAmount: plan.starsPrice,
    };
  });

  app.post('/internal/bot/payments/pre-checkout', async (req) => {
    const body = z.object({ invoicePayload: z.string() }).parse(req.body);
    const ok = await approvePreCheckout(body.invoicePayload);
    return { ok };
  });

  app.post('/internal/bot/payments/successful', async (req) => {
    const body = z
      .object({ telegramId: z.coerce.bigint(), invoicePayload: z.string(), telegramPaymentChargeId: z.string(), providerPaymentChargeId: z.string().nullish(), rawUpdate: z.unknown() })
      .parse(req.body);
    const result = await applySuccessfulPayment({
      telegramId: body.telegramId,
      invoicePayload: body.invoicePayload,
      telegramPaymentChargeId: body.telegramPaymentChargeId,
      providerPaymentChargeId: body.providerPaymentChargeId ?? null,
      rawUpdate: body.rawUpdate,
    });
    return { ok: true, importPageUrl: buildImportPageUrl(result.pageToken), alreadyApplied: result.alreadyApplied };
  });
}
