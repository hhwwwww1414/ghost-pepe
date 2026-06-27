import os from 'node:os';
import { getConfig } from '@ghostpepe/config';
import { isServiceActive } from './services.js';
import type { DesiredState } from './control-client.js';

export interface Heartbeat {
  xrayAlive: boolean;
  hysteriaAlive: boolean;
  loadAvg: number;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  rxBytes5m: string;
  txBytes5m: string;
  activeVlessDevices: number;
  activeHysteriaDevices: number;
}

export async function buildHeartbeat(state: DesiredState): Promise<Heartbeat> {
  const mock = getConfig().AGENT_MOCK;
  const load = os.loadavg()[0] ?? 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPercent = ((totalMem - freeMem) / totalMem) * 100;
  const vlessCount = state.vlessUsers.length + Object.values(state.bridgeInbounds).flatMap((a) => a).length;
  const hysteriaCount = Math.round(vlessCount / 2);

  return {
    xrayAlive: mock ? true : await isServiceActive('xray'),
    hysteriaAlive: mock ? true : await isServiceActive('hysteria-server'),
    loadAvg: Number(load.toFixed(2)),
    cpuPercent: mock ? Math.round(Math.random() * 30) : Math.min(100, Math.round((load / (os.cpus().length || 1)) * 100)),
    ramPercent: Number(ramPercent.toFixed(1)),
    diskPercent: mock ? 30 : 0,
    rxBytes5m: '0',
    txBytes5m: '0',
    activeVlessDevices: vlessCount,
    activeHysteriaDevices: hysteriaCount,
  };
}
