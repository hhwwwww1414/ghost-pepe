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
  /**
   * SHA-256 fingerprint of the server's self-signed TLS cert (hex or colon
   * format). Emitted as `pinSHA256` without `insecure`/`allowInsecure` for
   * Happ's current XrayCore import compatibility.
   */
  pinSha256?: string;
  /**
   * Port-hopping range (Hysteria2 multi-port syntax), e.g. "20000-50000" or
   * "1234,5000-6000". When set, the client hops across these UDP ports instead
   * of a fixed port; the server NATs the whole range to its listen port. Used
   * to defeat per-port QUIC throttling on mobile/TSPU networks.
   */
  portHopRange?: string;
  /** Hop interval in seconds (Happ `mportHopInt`). Only used with portHopRange. */
  hopInterval?: number;
  label: string;
}

/** hy2://auth@host:port?sni=...&obfs=salamander&pinSHA256=...#Label  (Hysteria2 URI scheme) */
export function buildHysteriaLink(p: HysteriaLinkParams): string {
  const params = new URLSearchParams({ sni: p.serverName });
  if (p.obfsPassword) {
    params.set('obfs', 'salamander');
    params.set('obfs-password', p.obfsPassword);
  }
  // Pin the self-signed cert; Happ rejects current hy2 imports with insecure.
  if (p.pinSha256) {
    params.set('pinSHA256', p.pinSha256);
  }
  // Port hopping: the authority carries the multi-port range and the hop
  // interval rides as a query param (Happ `mportHopInt`).
  const portPart = p.portHopRange && p.portHopRange.length > 0 ? p.portHopRange : String(p.port);
  if (p.portHopRange && p.portHopRange.length > 0 && p.hopInterval && p.hopInterval > 0) {
    params.set('mportHopInt', String(p.hopInterval));
  }
  return `hy2://${enc(p.auth)}@${p.host}:${portPart}?${params.toString()}#${enc(p.label)}`;
}
