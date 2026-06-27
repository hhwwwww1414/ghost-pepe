import Fastify from 'fastify';
import { getConfig, loadEnv } from '@ghostpepe/config';
import { fetchDesiredState, postHeartbeat, postTraffic, proxyHysteriaAuth, type DesiredState } from './control-client.js';
import { renderConfigs } from './render.js';
import { restartService } from './services.js';
import { collectTraffic } from './stats.js';
import { buildHeartbeat } from './metrics.js';

loadEnv();
const cfg = getConfig();
const NODE_CODE = cfg.NODE_CODE;

let lastState: DesiredState | null = null;
let lastConfigHash = '';

/** Local Hysteria auth endpoint — Hysteria server posts here; we proxy to control-plane. */
async function startAuthProxy(): Promise<void> {
  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({ ok: true, node: NODE_CODE }));
  app.post('/hysteria/auth', async (req) => {
    const body = req.body as { auth?: string };
    if (!body?.auth) return { ok: false };
    return proxyHysteriaAuth(body.auth);
  });
  await app.listen({ host: '127.0.0.1', port: cfg.HYSTERIA_AUTH_PORT });
  log(`hysteria auth proxy on 127.0.0.1:${cfg.HYSTERIA_AUTH_PORT}`);
}

async function reconcile(): Promise<void> {
  try {
    const state = await fetchDesiredState(NODE_CODE);
    lastState = state;
    const hash = JSON.stringify({ v: state.vlessUsers, b: state.bridgeInbounds });
    if (hash !== lastConfigHash) {
      const out = renderConfigs(state);
      lastConfigHash = hash;
      log(`config changed: ${state.vlessUsers.length} vless users; rendered ${out.xrayPath}`);
      if (!cfg.AGENT_MOCK) {
        await restartService('xray');
        await restartService('hysteria-server');
      }
    }
  } catch (err) {
    // Use last known-good state if control-plane is briefly unreachable (docs 05 §13).
    log(`reconcile error (using last known-good): ${(err as Error).message}`);
  }
}

async function heartbeatLoop(): Promise<void> {
  const state = lastState ?? { nodeCode: NODE_CODE, role: '', generatedAt: '', vlessUsers: [], bridgeInbounds: {} };
  const hb = await buildHeartbeat(state);
  await postHeartbeat(NODE_CODE, hb);
}

async function statsLoop(): Promise<void> {
  if (!lastState) return;
  const entries = await collectTraffic(lastState);
  await postTraffic(NODE_CODE, entries);
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[node-agent ${NODE_CODE}${cfg.AGENT_MOCK ? ' MOCK' : ''}] ${msg}`);
}

async function main(): Promise<void> {
  log('starting');
  await startAuthProxy();
  await reconcile();
  await heartbeatLoop();

  setInterval(reconcile, 15_000);
  setInterval(heartbeatLoop, cfg.HEARTBEAT_INTERVAL_SEC * 1000);
  setInterval(statsLoop, cfg.STATS_POLL_INTERVAL_SEC * 1000);
}

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
