import Fastify from 'fastify';
import { getConfig, loadEnv } from '@ghostpepe/config';
import { renderImportPage } from './page.js';

loadEnv();
const cfg = getConfig();
const app = Fastify({ logger: { level: cfg.LOG_LEVEL } });

app.get('/healthz', async () => ({ ok: true }));

// Subscription import page (docs 01 §6.2: https://sub.../s/{public_token})
app.get('/s/:token', async (req, reply) => {
  const token = (req.params as { token: string }).token;
  return reply.header('content-type', 'text/html; charset=utf-8').send(renderImportPage(token));
});

app.get('/', async (_req, reply) => reply.header('content-type', 'text/html; charset=utf-8').send(renderImportPage('demo')));

app.listen({ host: '0.0.0.0', port: cfg.SUB_PORT }).then(() => {
  app.log.info(`Subscription page on :${cfg.SUB_PORT}`);
});
