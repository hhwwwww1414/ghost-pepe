import { getConfig, loadEnv } from '@ghostpepe/config';
import { buildServer } from './server.js';

loadEnv();

async function main(): Promise<void> {
  const cfg = getConfig();
  const app = await buildServer();
  try {
    await app.listen({ host: '0.0.0.0', port: cfg.API_PORT });
    app.log.info(`Ghost Pepe API listening on :${cfg.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
