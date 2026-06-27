import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '@ghostpepe/config';
import { registerHealthRoutes } from './routes/health.js';
import { registerImportRoutes } from './routes/import.js';
import { registerSubscriptionRoutes } from './routes/subscription.js';
import { registerBotRoutes } from './routes/bot.js';
import { registerNodeAgentRoutes } from './routes/node-agent.js';
import { registerHysteriaAuthRoutes } from './routes/hysteria-auth.js';
import { registerAdminRoutes } from './routes/admin.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; email: string };
    user: { sub: string; role: string; email: string };
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = Fastify({
    logger: { level: cfg.LOG_LEVEL },
    // BigInt-safe JSON serialisation.
    serializerOpts: { rounding: 'trunc' },
  });

  // Serialise BigInt as string everywhere.
  app.setReplySerializer((payload) => JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: cfg.ADMIN_JWT_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // ── Auth guards ────────────────────────────────────────────────────────────
  app.decorate('internalAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['x-internal-token'] !== cfg.INTERNAL_API_TOKEN) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.decorate('nodeAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['x-node-token'] !== cfg.NODE_AGENT_TOKEN) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.decorate('adminAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  await registerHealthRoutes(app);
  await registerImportRoutes(app);
  await registerSubscriptionRoutes(app);
  await registerBotRoutes(app);
  await registerNodeAgentRoutes(app);
  await registerHysteriaAuthRoutes(app);
  await registerAdminRoutes(app);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    internalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    nodeAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    adminAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
