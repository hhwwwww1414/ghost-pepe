import { FI_EXIT_CODE, DE_EXIT_CODE, YC_BRIDGE_CODE } from '@ghostpepe/shared';

export function nodeEnvPrefix(nodeCode: string): 'FI' | 'DE' | 'YC' {
  if (nodeCode === DE_EXIT_CODE) return 'DE';
  if (nodeCode === YC_BRIDGE_CODE) return 'YC';
  if (nodeCode === FI_EXIT_CODE) return 'FI';
  return 'FI';
}
