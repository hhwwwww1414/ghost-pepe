import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hysteriaAuth } from '../services/nodes.js';

/**
 * Hysteria2 HTTP auth backend (docs 02 §5). The node-agent proxies the Hysteria
 * auth callback to this endpoint. Returns the stable client id used for
 * stats/online. Blocked/expired/over-quota => ok:false (permanent block lives
 * here, not /kick).
 */
export async function registerHysteriaAuthRoutes(app: FastifyInstance): Promise<void> {
  // Hysteria sends { addr, auth, tx }; we only need `auth`.
  app.post('/hysteria/auth', async (req, reply) => {
    const body = z.object({ auth: z.string(), addr: z.string().optional(), tx: z.number().optional() }).safeParse(req.body);
    if (!body.success) return reply.send({ ok: false });
    const result = await hysteriaAuth(body.data.auth);
    return reply.send(result);
  });
}
