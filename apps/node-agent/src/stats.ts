import { getConfig } from '@ghostpepe/config';
import type { DesiredState, TrafficEntry } from './control-client.js';

/**
 * Collect traffic counters. In mock mode we fabricate growing counters per
 * known client id so the dashboard shows live traffic without real Xray/Hysteria.
 * In real mode we read Hysteria Traffic Stats API and (TODO) Xray stats CLI.
 */
const mockCounters = new Map<string, { up: bigint; down: bigint }>();

export async function collectTraffic(state: DesiredState): Promise<TrafficEntry[]> {
  const cfg = getConfig();
  const now = new Date();
  const windowStart = new Date(now.getTime() - cfg.STATS_POLL_INTERVAL_SEC * 1000).toISOString();
  const windowEnd = now.toISOString();

  if (cfg.AGENT_MOCK) {
    const entries: TrafficEntry[] = [];
    const clients = [
      ...state.vlessUsers.map((u) => u.email),
      ...Object.values(state.bridgeInbounds).flatMap((arr) => arr.map((u) => u.email)),
    ];
    for (const clientId of clients) {
      if (!clientId) continue;
      const prev = mockCounters.get(clientId) ?? { up: 0n, down: 0n };
      const up = prev.up + BigInt(Math.floor(Math.random() * 5_000_000));
      const down = prev.down + BigInt(Math.floor(Math.random() * 20_000_000));
      mockCounters.set(clientId, { up, down });
      const source = clientId.includes(':p:hysteria:') ? 'hysteria_stats' : 'xray_stats';
      entries.push({ clientId, uplinkBytes: up.toString(), downlinkBytes: down.toString(), source, windowStart, windowEnd });
    }
    return entries;
  }

  // Real mode: Hysteria Traffic Stats API.
  const entries: TrafficEntry[] = [];
  try {
    const env = getConfig() as unknown as Record<string, string>;
    const prefix = cfg.NODE_CODE.startsWith('de') ? 'DE' : cfg.NODE_CODE.startsWith('yc') ? 'YC' : 'FI';
    const secret = env[`${prefix}_HYSTERIA_TRAFFIC_API_SECRET`] ?? '';
    const res = await fetch(`http://${cfg.HYSTERIA_STATS_ADDR}/traffic`, { headers: { Authorization: secret } });
    if (res.ok) {
      const map = (await res.json()) as Record<string, { tx: number; rx: number }>;
      for (const [clientId, v] of Object.entries(map)) {
        entries.push({ clientId, uplinkBytes: String(v.tx), downlinkBytes: String(v.rx), source: 'hysteria_stats', windowStart, windowEnd });
      }
    }
  } catch {
    // Hysteria stats unavailable; skip this cycle.
  }
  // TODO: Xray stats via `xray api statsquery --server=127.0.0.1:10085`.
  return entries;
}
