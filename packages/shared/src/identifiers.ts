import type { Mode, Protocol } from './profiles.js';

/**
 * Stable per-credential identifier used as Xray `email` and Hysteria auth `id`.
 * Format (docs 02 §4.1 / 04 §5.1):
 *   u:{user_id}:d:{device_id}:p:{protocol}:n:{node_id}:m:{mode}
 * It must be reproducible so traffic stats can be tied back to a credential.
 */
export function buildClientIdentifier(params: {
  userId: string;
  deviceId: string;
  protocol: Protocol;
  nodeCode: string;
  mode: Mode;
}): string {
  const { userId, deviceId, protocol, nodeCode, mode } = params;
  return `u:${userId}:d:${deviceId}:p:${protocol}:n:${nodeCode}:m:${mode}`;
}

export interface ParsedClientIdentifier {
  userId: string;
  deviceId: string;
  protocol: Protocol;
  nodeCode: string;
  mode: Mode;
}

export function parseClientIdentifier(id: string): ParsedClientIdentifier | null {
  const m = id.match(/^u:(.+?):d:(.+?):p:(vless|hysteria):n:(.+?):m:(regular|whitelist)$/);
  if (!m) return null;
  return {
    userId: m[1]!,
    deviceId: m[2]!,
    protocol: m[3] as Protocol,
    nodeCode: m[4]!,
    mode: m[5] as Mode,
  };
}
