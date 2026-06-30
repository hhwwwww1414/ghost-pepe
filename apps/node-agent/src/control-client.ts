import { getConfig } from '@ghostpepe/config';

/** Client for the control-plane node-agent API. Authed by node token. */
function base(): string {
  return getConfig().CONTROL_PLANE_URL.replace(/\/$/, '');
}
function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-node-token': getConfig().NODE_AGENT_TOKEN };
}

export interface DesiredState {
  nodeCode: string;
  role: string;
  generatedAt: string;
  vlessUsers: Array<{ uuid: string; email: string; profileCode: string; mode: string }>;
  bridgeInbounds: Record<string, Array<{ uuid: string; email: string; profileCode: string; mode: string }>>;
  hysteriaBridgeRoutes: Array<{ name: string; exitRegion: 'fi' | 'de'; listenPort: number }>;
}

export async function fetchDesiredState(nodeCode: string): Promise<DesiredState> {
  const res = await fetch(`${base()}/internal/nodes/${nodeCode}/config`, { headers: headers() });
  if (!res.ok) throw new Error(`desired-state ${res.status}`);
  return (await res.json()) as DesiredState;
}

export async function postHeartbeat(nodeCode: string, hb: unknown): Promise<void> {
  await fetch(`${base()}/internal/nodes/${nodeCode}/heartbeat`, { method: 'POST', headers: headers(), body: JSON.stringify(hb) }).catch(() => undefined);
}

export interface TrafficEntry {
  clientId: string;
  uplinkBytes: string;
  downlinkBytes: string;
  source: 'xray_stats' | 'hysteria_stats';
  windowStart: string;
  windowEnd: string;
}

export async function postTraffic(nodeCode: string, entries: TrafficEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await fetch(`${base()}/internal/nodes/${nodeCode}/traffic`, { method: 'POST', headers: headers(), body: JSON.stringify({ entries }) }).catch(() => undefined);
}

/** Proxy a Hysteria auth callback to the control-plane. */
export async function proxyHysteriaAuth(auth: string): Promise<{ ok: boolean; id?: string }> {
  try {
    const res = await fetch(`${base()}/hysteria/auth`, { method: 'POST', headers: headers(), body: JSON.stringify({ auth }) });
    return (await res.json()) as { ok: boolean; id?: string };
  } catch {
    return { ok: false };
  }
}
