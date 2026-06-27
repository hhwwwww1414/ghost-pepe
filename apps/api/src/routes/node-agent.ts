import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@ghostpepe/db';
import { recordHeartbeat, getDesiredState } from '../services/nodes.js';
import { ingestTrafficBatch } from '../services/traffic.js';

/** Node-agent API — guarded by node token (docs 05 §12.3, 06 §15.4). */
export async function registerNodeAgentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/internal/nodes')) return;
    return app.nodeAuth(req, reply);
  });

  app.post('/internal/nodes/:nodeCode/heartbeat', async (req) => {
    const nodeCode = (req.params as { nodeCode: string }).nodeCode;
    const hb = z
      .object({
        xrayAlive: z.boolean(),
        hysteriaAlive: z.boolean(),
        loadAvg: z.number().default(0),
        cpuPercent: z.number().default(0),
        ramPercent: z.number().default(0),
        diskPercent: z.number().default(0),
        rxBytes5m: z.coerce.bigint().default(0n),
        txBytes5m: z.coerce.bigint().default(0n),
        activeVlessDevices: z.number().default(0),
        activeHysteriaDevices: z.number().default(0),
      })
      .parse(req.body);
    await recordHeartbeat(nodeCode, hb);
    return { ok: true };
  });

  app.post('/internal/nodes/:nodeCode/traffic', async (req) => {
    const nodeCode = (req.params as { nodeCode: string }).nodeCode;
    const body = z
      .object({
        entries: z.array(
          z.object({
            clientId: z.string(),
            uplinkBytes: z.coerce.bigint(),
            downlinkBytes: z.coerce.bigint(),
            source: z.enum(['xray_stats', 'hysteria_stats']),
            windowStart: z.string(),
            windowEnd: z.string(),
          }),
        ),
      })
      .parse(req.body);
    const result = await ingestTrafficBatch(nodeCode, body.entries);
    return { ok: true, ...result };
  });

  app.get('/internal/nodes/:nodeCode/config', async (req) => {
    const nodeCode = (req.params as { nodeCode: string }).nodeCode;
    return getDesiredState(nodeCode);
  });

  app.post('/internal/nodes/:nodeCode/deploy-result', async (req) => {
    const nodeCode = (req.params as { nodeCode: string }).nodeCode;
    const body = z.object({ version: z.string(), status: z.enum(['success', 'failed']), log: z.string().optional() }).parse(req.body);
    const node = await prisma.node.findUnique({ where: { code: nodeCode } });
    if (node) {
      await prisma.deployment.create({ data: { nodeId: node.id, target: nodeCode, version: body.version, status: body.status, log: body.log ?? null } });
    }
    return { ok: true };
  });
}
