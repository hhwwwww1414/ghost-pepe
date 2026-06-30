import { getConfig } from '@ghostpepe/config';
import { FI_EXIT_CODE, DE_EXIT_CODE, YC_BRIDGE_CODE } from '@ghostpepe/shared';

/** Map a node code to its env prefix for Reality/Hysteria secrets. */
export function nodeEnvPrefix(nodeCode: string): 'FI' | 'DE' | 'YC' {
  if (nodeCode === FI_EXIT_CODE) return 'FI';
  if (nodeCode === DE_EXIT_CODE) return 'DE';
  if (nodeCode === YC_BRIDGE_CODE) return 'YC';
  // default to FI for unknown/new nodes until configured
  return 'FI';
}

export interface RealityClientParams {
  publicKey: string;
  shortId: string;
  serverName: string;
}

/** Reality client params (pbk/sid/sni) for the ingress node a client connects to. */
export function realityClientParams(ingressNodeCode: string): RealityClientParams {
  const cfg = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(ingressNodeCode);
  return {
    publicKey: cfg[`${p}_REALITY_PUBLIC_KEY`] ?? '',
    shortId: cfg[`${p}_REALITY_SHORT_ID`] ?? '',
    serverName: cfg[`${p}_REALITY_SERVER_NAME`] ?? 'www.cloudflare.com',
  };
}

export function hysteriaObfs(ingressNodeCode: string): string | undefined {
  const cfg = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(ingressNodeCode);
  const v = cfg[`${p}_HYSTERIA_OBFS_PASSWORD`];
  return v && v.length > 0 ? v : undefined;
}

/**
 * SHA-256 fingerprint of the ingress node's Hysteria TLS cert for client cert
 * pinning. New XrayCore (Happ 4.13+) removed `allowInsecure`; clients must pin
 * self-signed certs via pinSHA256. Returns normalized lowercase hex (no colons)
 * or undefined when not configured.
 */
export function hysteriaPinSha256(ingressNodeCode: string): string | undefined {
  const cfg = getConfig() as unknown as Record<string, string>;
  const p = nodeEnvPrefix(ingressNodeCode);
  const v = cfg[`${p}_HYSTERIA_CERT_SHA256`];
  if (!v || v.length === 0) return undefined;
  return v.replace(/:/g, '').trim().toLowerCase();
}
