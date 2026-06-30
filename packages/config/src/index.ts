import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads env from (in order, first wins): process.env, .env.local, .env,
 * .env.production. Call loadEnv() once at process start.
 */
let loaded = false;
export function loadEnv(cwd = process.cwd()): void {
  if (loaded) return;
  const candidates = ['.env.local', '.env', '.env.production'];
  for (const file of candidates) {
    const full = resolve(cwd, file);
    if (existsSync(full)) dotenv.config({ path: full, override: false });
  }
  // Also walk up to repo root (workspaces run from package dir).
  for (const file of candidates) {
    const full = resolve(cwd, '..', '..', file);
    if (existsSync(full)) dotenv.config({ path: full, override: false });
  }
  loaded = true;
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const envSchema = z.object({
  APP_NAME: z.string().default('Ghost Pepe VPN'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  PUBLIC_BASE_URL: z.string().default('http://localhost:8082'),
  API_BASE_URL: z.string().default('http://localhost:8080'),
  ADMIN_BASE_URL: z.string().default('http://localhost:8083'),

  ROOT_DOMAIN: z.string().default('example.com'),
  API_DOMAIN: z.string().default('api.example.com'),
  ADMIN_DOMAIN: z.string().default('admin.example.com'),
  SUB_DOMAIN: z.string().default('sub.example.com'),
  FI_VLESS_DOMAIN: z.string().default('fi-vless.example.com'),
  FI_HYSTERIA_DOMAIN: z.string().default('fi-hy.example.com'),
  DE_VLESS_DOMAIN: z.string().default('de-vless.example.com'),
  DE_HYSTERIA_DOMAIN: z.string().default('de-hy.example.com'),
  WL_VLESS_DOMAIN: z.string().default('wl-vless.example.com'),
  WL_HYSTERIA_DOMAIN: z.string().default('wl-hy.example.com'),

  FI_REALITY_PRIVATE_KEY: z.string().default(''),
  FI_REALITY_PUBLIC_KEY: z.string().default(''),
  FI_REALITY_SHORT_ID: z.string().default(''),
  FI_REALITY_SERVER_NAME: z.string().default('www.cloudflare.com'),
  DE_REALITY_PRIVATE_KEY: z.string().default(''),
  DE_REALITY_PUBLIC_KEY: z.string().default(''),
  DE_REALITY_SHORT_ID: z.string().default(''),
  DE_REALITY_SERVER_NAME: z.string().default('www.cloudflare.com'),
  YC_REALITY_PRIVATE_KEY: z.string().default(''),
  YC_REALITY_PUBLIC_KEY: z.string().default(''),
  YC_REALITY_SHORT_ID: z.string().default(''),
  YC_REALITY_SERVER_NAME: z.string().default('www.cloudflare.com'),

  FI_HYSTERIA_TRAFFIC_API_SECRET: z.string().default(''),
  DE_HYSTERIA_TRAFFIC_API_SECRET: z.string().default(''),
  YC_HYSTERIA_TRAFFIC_API_SECRET: z.string().default(''),
  FI_HYSTERIA_OBFS_PASSWORD: z.string().default(''),
  DE_HYSTERIA_OBFS_PASSWORD: z.string().default(''),
  YC_HYSTERIA_OBFS_PASSWORD: z.string().default(''),
  // SHA-256 fingerprint of each node's Hysteria TLS cert, used for client cert
  // pinning (pinSHA256 / xray pinnedPeerCertSha256). Replaces the removed
  // allowInsecure for self-signed certs. Plain hex (no colons) or colon format.
  FI_HYSTERIA_CERT_SHA256: z.string().default(''),
  DE_HYSTERIA_CERT_SHA256: z.string().default(''),
  YC_HYSTERIA_CERT_SHA256: z.string().default(''),
  FI_HYSTERIA_BRIDGE_VLESS_UUID: z.string().default(''),
  DE_HYSTERIA_BRIDGE_VLESS_UUID: z.string().default(''),

  API_PORT: z.coerce.number().default(8080),
  HYSTERIA_AUTH_PORT: z.coerce.number().default(18081),
  SUB_PORT: z.coerce.number().default(8082),
  ADMIN_PORT: z.coerce.number().default(8083),

  DATABASE_URL: z
    .string()
    .default('postgresql://ghostpepe:ghostpepe_dev_password@localhost:5432/ghostpepe?schema=public'),
  REDIS_URL: z.string().default('redis://:ghostpepe_redis_dev@localhost:6379'),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default('ghostpepebot'),
  TELEGRAM_WEBHOOK_SECRET: z.string().default('dev_webhook_secret'),
  TELEGRAM_WEBHOOK_URL: z.string().default(''),
  TELEGRAM_ADMIN_IDS: z.string().default(''),
  BOT_MODE: z.enum(['polling', 'webhook', 'mock']).default('polling'),

  STARS_PROVIDER_TOKEN: z.string().default(''),
  STARS_CURRENCY: z.string().default('XTR'),

  ADMIN_JWT_SECRET: z.string().default('dev_admin_jwt_secret_change_me_please_32'),
  INTERNAL_API_TOKEN: z.string().default('dev_internal_api_token'),
  NODE_AGENT_TOKEN: z.string().default('dev_node_agent_token'),
  SUBSCRIPTION_TOKEN_SECRET: z.string().default('dev_subscription_token_secret'),
  ENCRYPTION_MASTER_KEY: z.string().default('dev_encryption_master_key_change_me'),
  TOKEN_HASH_SECRET: z.string().default('dev_token_hash_secret_change_me'),

  ADMIN_BOOTSTRAP_EMAIL: z.string().default('admin@example.com'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default('changeme-admin'),

  HAPP_PROVIDER_ID: z.string().default(''),
  HAPP_SUBSCRIPTION_NAME: z.string().default('Ghost Pepe'),
  HAPP_SUPPORT_URL: z.string().default('https://t.me/ghostpepe_support'),
  HAPP_PROFILE_UPDATE_INTERVAL: z.coerce.number().default(6),
  // Happ's hy2 URI support documents SNI but not certificate pin parameters.
  // Use a publicly trusted cert name here even when endpointHost is an IP.
  HAPP_HYSTERIA_SERVER_NAME: z.string().default('sub.example.com'),
  // Production-safe mode for networks where direct foreign endpoints or
  // Reality are unstable in Happ. Serves only whitelist Hysteria profiles.
  HAPP_STABLE_ONLY: bool(false),
  // Hysteria2 port hopping for regular FI/DE exits. Mobile carriers/TSPU
  // throttle QUIC on a fixed UDP 443; hopping across a range defeats per-port
  // throttling. Empty = disabled (single port). Format: "20000-50000" (matches
  // the server-side iptables REDIRECT range). mportHopInt is the hop interval.
  HYSTERIA_PORT_HOP_RANGE: z.string().default(''),
  HYSTERIA_PORT_HOP_INTERVAL: z.coerce.number().default(30),
  // Port hopping for the in-RU whitelist bridge. It needs separate ranges
  // because FI and DE bridge instances listen on different UDP ports.
  WL_HYSTERIA_FI_PORT_HOP_RANGE: z.string().default(''),
  WL_HYSTERIA_DE_PORT_HOP_RANGE: z.string().default(''),
  WL_HYSTERIA_PORT_HOP_INTERVAL: z.coerce.number().default(30),

  // Node-agent context
  NODE_CODE: z.string().default('fi-control-01'),
  CONTROL_PLANE_URL: z.string().default('http://localhost:8080'),
  XRAY_API_ADDR: z.string().default('127.0.0.1:10085'),
  HYSTERIA_STATS_ADDR: z.string().default('127.0.0.1:9999'),
  STATS_POLL_INTERVAL_SEC: z.coerce.number().default(30),
  HEARTBEAT_INTERVAL_SEC: z.coerce.number().default(30),
  AGENT_MOCK: bool(false),

  PORT_MODE: z.enum(['A', 'B']).default('A'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (cached) return cached;
  loadEnv();
  cached = envSchema.parse(process.env);
  return cached;
}

/** Domain lookup by the env name stored on a profile definition. */
export function domainForEnv(name: string): string {
  const cfg = getConfig() as unknown as Record<string, string>;
  return cfg[name] ?? '';
}

export function adminTelegramIds(): bigint[] {
  return getConfig()
    .TELEGRAM_ADMIN_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
}
