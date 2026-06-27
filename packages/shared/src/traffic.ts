/**
 * Traffic delta model (docs 04 §5.3 / 06 §11.3).
 * Counters are monotonic until the service restarts. On restart the counter
 * resets to a smaller value — that must be treated as `delta = current`, never
 * as a negative delta.
 */
export function computeDelta(previous: bigint, current: bigint): bigint {
  if (current < previous) {
    // reset detected
    return current;
  }
  return current - previous;
}

export interface TrafficUserInfo {
  upload: bigint;
  download: bigint;
  total: bigint;
  expireUnix: number;
}

/** Build the Happ `subscription-userinfo` header value (docs 03 §11). */
export function buildSubscriptionUserInfo(info: TrafficUserInfo): string {
  return `upload=${info.upload}; download=${info.download}; total=${info.total}; expire=${info.expireUnix}`;
}

export function formatBytes(bytes: bigint | number): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
