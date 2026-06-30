/**
 * Idempotent seed: plans, the three nodes (FI/DE/YC), the 8 user-facing
 * node_profiles derived from PROFILE_DEFINITIONS, and a bootstrap admin.
 *
 * Run: npm run db:seed
 */
import { getConfig, domainForEnv } from '@ghostpepe/config';
import {
  PROFILE_DEFINITIONS,
  FI_EXIT_CODE,
  DE_EXIT_CODE,
  YC_BRIDGE_CODE,
  REFERRAL_LINE_RATES_BPS,
  SETTING_KEY,
  hashPassword,
} from '@ghostpepe/shared';
import { prisma } from './index.js';

async function main(): Promise<void> {
  const cfg = getConfig();

  // ── Plans ────────────────────────────────────────────────────────────────
  const plans = [
    { code: 'gp_30_100', title: '100 ГБ / 30 дней', starsPrice: 150, durationDays: 30, trafficLimitBytes: 100n * 1024n ** 3n },
    { code: 'gp_30_unlim', title: 'Безлимит / 30 дней', starsPrice: 250, durationDays: 30, trafficLimitBytes: 0n },
    { code: 'gp_90_300', title: '300 ГБ / 90 дней', starsPrice: 400, durationDays: 90, trafficLimitBytes: 300n * 1024n ** 3n },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: { title: p.title, starsPrice: p.starsPrice, durationDays: p.durationDays, trafficLimitBytes: p.trafficLimitBytes, deviceLimit: 5 },
      create: { ...p, deviceLimit: 5, isActive: true },
    });
  }

  // ── Runtime settings ─────────────────────────────────────────────────────
  await prisma.setting.upsert({
    where: { key: SETTING_KEY.REFERRAL_RATES_BPS },
    update: {},
    create: { key: SETTING_KEY.REFERRAL_RATES_BPS, value: [...REFERRAL_LINE_RATES_BPS] },
  });
  await prisma.setting.upsert({
    where: { key: SETTING_KEY.REFERRAL_ENABLED },
    update: {},
    create: { key: SETTING_KEY.REFERRAL_ENABLED, value: true },
  });

  // ── Nodes ────────────────────────────────────────────────────────────────
  const nodeDefs = [
    {
      code: FI_EXIT_CODE, title: 'Finland Control + Exit', countryCode: 'FI', role: 'control_exit',
      isControlPlane: true, isExitNode: true, isWhitelistBridge: false,
      vlessDomain: cfg.FI_VLESS_DOMAIN, hysteriaDomain: cfg.FI_HYSTERIA_DOMAIN,
    },
    {
      code: DE_EXIT_CODE, title: 'Germany Exit', countryCode: 'DE', role: 'exit',
      isControlPlane: false, isExitNode: true, isWhitelistBridge: false,
      vlessDomain: cfg.DE_VLESS_DOMAIN, hysteriaDomain: cfg.DE_HYSTERIA_DOMAIN,
    },
    {
      code: YC_BRIDGE_CODE, title: 'Yandex Cloud Whitelist Bridge', countryCode: 'RU', role: 'whitelist_ingress',
      isControlPlane: false, isExitNode: false, isWhitelistBridge: true,
      vlessDomain: cfg.WL_VLESS_DOMAIN, hysteriaDomain: cfg.WL_HYSTERIA_DOMAIN,
    },
  ];
  const nodeByCode: Record<string, string> = {};
  for (const n of nodeDefs) {
    const node = await prisma.node.upsert({
      where: { code: n.code },
      update: {
        title: n.title, countryCode: n.countryCode, role: n.role,
        isControlPlane: n.isControlPlane, isExitNode: n.isExitNode, isWhitelistBridge: n.isWhitelistBridge,
        vlessDomain: n.vlessDomain, hysteriaDomain: n.hysteriaDomain, vlessPort: 443, hysteriaPort: 443,
      },
      create: {
        code: n.code, title: n.title, countryCode: n.countryCode, role: n.role,
        isControlPlane: n.isControlPlane, isExitNode: n.isExitNode, isWhitelistBridge: n.isWhitelistBridge,
        vlessDomain: n.vlessDomain, hysteriaDomain: n.hysteriaDomain, vlessPort: 443, hysteriaPort: 443, isActive: true,
      },
    });
    nodeByCode[n.code] = node.id;
  }

  // ── Node profiles (the 8 user-facing profiles) ─────────────────────────────
  for (const def of PROFILE_DEFINITIONS) {
    const ingressNodeId = nodeByCode[def.ingressNodeCode]!;
    const exitNodeId = nodeByCode[def.exitNodeCode]!;
    const endpointHost = domainForEnv(def.endpointDomainEnv);
    const endpointPort = def.code === 'de_hysteria_whitelist' ? 444 : 443;
    const countryCode = def.exitRegion === 'fi' ? 'FI' : 'DE';
    await prisma.nodeProfile.upsert({
      where: { profileCode: def.code },
      update: {
        label: def.label, protocol: def.protocol, mode: def.mode, countryCode,
        endpointHost, endpointPort, transport: def.protocol === 'hysteria' ? 'udp' : 'tcp',
        ruDirect: def.ruDirect,
        nodeId: ingressNodeId,
        whitelistBridgeNodeId: def.mode === 'whitelist' ? nodeByCode[YC_BRIDGE_CODE]! : null,
        exitNodeId,
        isActive: true,
      },
      create: {
        nodeId: ingressNodeId,
        profileCode: def.code, label: def.label, protocol: def.protocol, mode: def.mode, countryCode,
        endpointHost, endpointPort, transport: def.protocol === 'hysteria' ? 'udp' : 'tcp',
        ruDirect: def.ruDirect,
        whitelistBridgeNodeId: def.mode === 'whitelist' ? nodeByCode[YC_BRIDGE_CODE]! : null,
        exitNodeId,
        isActive: true,
      },
    });
  }

  // ── Bootstrap admin ────────────────────────────────────────────────────────
  await prisma.adminUser.upsert({
    where: { email: cfg.ADMIN_BOOTSTRAP_EMAIL },
    update: {},
    create: {
      email: cfg.ADMIN_BOOTSTRAP_EMAIL,
      passwordHash: hashPassword(cfg.ADMIN_BOOTSTRAP_PASSWORD),
      role: 'owner',
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    plans: plans.length,
    nodes: nodeDefs.length,
    profiles: PROFILE_DEFINITIONS.length,
    admin: cfg.ADMIN_BOOTSTRAP_EMAIL,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
