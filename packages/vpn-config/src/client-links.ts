/**
 * Client subscription link builders. Only VLESS+Reality and Hysteria2 are
 * allowed (docs 06 §2.1). The label after `#` is what Happ shows in the list.
 */

export interface VlessLinkParams {
  uuid: string;
  host: string;
  port: number;
  /** Reality public key (pbk). */
  publicKey: string;
  shortId: string;
  /** SNI / serverName used by Reality. */
  serverName: string;
  /** XTLS flow, default xtls-rprx-vision. */
  flow?: string;
  fingerprint?: string;
  label: string;
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

/** vless://uuid@host:port?security=reality&...#Label */
export function buildVlessLink(p: VlessLinkParams): string {
  const params = new URLSearchParams({
    type: 'tcp',
    security: 'reality',
    pbk: p.publicKey,
    fp: p.fingerprint ?? 'chrome',
    sni: p.serverName,
    sid: p.shortId,
    flow: p.flow ?? 'xtls-rprx-vision',
    encryption: 'none',
  });
  return `vless://${p.uuid}@${p.host}:${p.port}?${params.toString()}#${enc(p.label)}`;
}

export interface HysteriaLinkParams {
  auth: string;
  host: string;
  port: number;
  /** SNI for TLS. */
  serverName: string;
  /** salamander obfs password (optional). */
  obfsPassword?: string;
  insecure?: boolean;
  label: string;
}

/** hy2://auth@host:port?sni=...&obfs=salamander&...#Label  (Hysteria2 URI scheme) */
export function buildHysteriaLink(p: HysteriaLinkParams): string {
  const params = new URLSearchParams({ sni: p.serverName });
  if (p.obfsPassword) {
    params.set('obfs', 'salamander');
    params.set('obfs-password', p.obfsPassword);
  }
  if (p.insecure) params.set('insecure', '1');
  return `hy2://${enc(p.auth)}@${p.host}:${p.port}?${params.toString()}#${enc(p.label)}`;
}
