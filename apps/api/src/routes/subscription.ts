import type { FastifyInstance } from 'fastify';
import { renderDeviceSubscription } from '../services/subscription-render.js';
import { prisma } from '@ghostpepe/db';

/**
 * Happ subscription body endpoint (docs 03 §10). Returns text/plain (not HTML).
 * Re-checks access on EVERY request — never returns working links for a
 * disabled device / non-serving subscription.
 */
export async function registerSubscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sub/:deviceToken', async (req, reply) => {
    const { deviceToken } = req.params as { deviceToken: string };
    const result = await renderDeviceSubscription(deviceToken);

    if (!result.ok) {
      // For Happ, returning 403 with empty body prevents stale-link usage.
      return reply.code(result.code === 'NOT_FOUND' ? 404 : 403).header('content-type', 'text/plain; charset=utf-8').send(result.reason);
    }

    // Touch last seen.
    await prisma.device.update({ where: { publicDeviceId: deviceToken }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    for (const [k, v] of Object.entries(result.result.headers)) reply.header(k, v);
    return reply.send(result.result.body);
  });

  // Subscription routing endpoint (docs 06 §15.1).
  app.get('/api/subscription/:deviceToken/routing', async (req, reply) => {
    const { deviceToken } = req.params as { deviceToken: string };
    const result = await renderDeviceSubscription(deviceToken);
    if (!result.ok) return reply.code(403).send({ error: result.code, message: result.reason });
    return reply.header('content-type', 'text/plain; charset=utf-8').send(result.result.headers.routing ?? '');
  });
}
