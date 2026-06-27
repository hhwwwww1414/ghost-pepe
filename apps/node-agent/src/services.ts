import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig } from '@ghostpepe/config';

const exec = promisify(execFile);

/**
 * Safe service restart wrappers (docs 06 §16). In mock mode these are no-ops.
 * On real nodes they call systemctl. Failures are caught and reported, never
 * crash the agent.
 */
export async function restartService(name: 'xray' | 'hysteria-server'): Promise<{ ok: boolean; error?: string }> {
  if (getConfig().AGENT_MOCK) return { ok: true };
  try {
    await exec('systemctl', ['restart', name]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function isServiceActive(name: 'xray' | 'hysteria-server'): Promise<boolean> {
  if (getConfig().AGENT_MOCK) return true;
  try {
    const { stdout } = await exec('systemctl', ['is-active', name]);
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}
