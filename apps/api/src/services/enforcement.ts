import { kvSet } from '../lib/kv.js';

/**
 * Mark a subscription's credentials as needing enforcement on the nodes.
 * Node-agents poll desired-state and remove/kick disabled credentials; we also
 * drop a KV flag so a kick can be picked up quickly. Real kicking happens via
 * the node-agent (Hysteria /kick, Xray HandlerService remove). (docs 04 §8–9)
 */
export async function enforceCredentialAccess(subscriptionId: string): Promise<void> {
  await kvSet(`enforce:${subscriptionId}`, String(Date.now()), 600);
}
