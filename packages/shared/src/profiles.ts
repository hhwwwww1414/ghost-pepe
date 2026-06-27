/**
 * The 4-profiles-per-exit matrix. This is the single source of truth that the
 * DB seed, the subscription renderer, the node-agent config renderer and the
 * tests all derive from. See docs/architecture/06 §6 and 02 §3.
 *
 * HARD RULE: ru_direct is decided ONLY by `mode` (regular => true, whitelist => false).
 * Never by node name.
 */

export type Protocol = 'vless' | 'hysteria';
export type Mode = 'regular' | 'whitelist';

/** Logical exit regions that have user-facing profiles. */
export type ExitRegion = 'fi' | 'de';

export interface ProfileDefinition {
  /** Stable profile code stored in node_profiles.profile_code. */
  code: string;
  /** Human label shown in Happ / bot / admin. */
  label: string;
  protocol: Protocol;
  mode: Mode;
  /** Region whose exit actually emits the traffic. */
  exitRegion: ExitRegion;
  /**
   * Which node the *client* connects to.
   * regular  -> the exit node itself (fi / de)
   * whitelist-> the Yandex bridge (yc)
   */
  ingressNodeCode: string;
  exitNodeCode: string;
  /** RU resources bypass the tunnel directly on the device. */
  ruDirect: boolean;
  /** env var name that holds the user-facing endpoint domain. */
  endpointDomainEnv: string;
}

export const FI_EXIT_CODE = 'fi-control-01';
export const DE_EXIT_CODE = 'de-exit-01';
export const YC_BRIDGE_CODE = 'yc-bridge-01';

export const PROFILE_DEFINITIONS: ProfileDefinition[] = [
  // ── Finland ──────────────────────────────────────────────────────────────
  {
    code: 'fi_vless_regular',
    label: 'Finland VLESS',
    protocol: 'vless',
    mode: 'regular',
    exitRegion: 'fi',
    ingressNodeCode: FI_EXIT_CODE,
    exitNodeCode: FI_EXIT_CODE,
    ruDirect: true,
    endpointDomainEnv: 'FI_VLESS_DOMAIN',
  },
  {
    code: 'fi_hysteria_regular',
    label: 'Finland Hysteria',
    protocol: 'hysteria',
    mode: 'regular',
    exitRegion: 'fi',
    ingressNodeCode: FI_EXIT_CODE,
    exitNodeCode: FI_EXIT_CODE,
    ruDirect: true,
    endpointDomainEnv: 'FI_HYSTERIA_DOMAIN',
  },
  {
    code: 'fi_vless_whitelist',
    label: 'Finland Whitelist VLESS',
    protocol: 'vless',
    mode: 'whitelist',
    exitRegion: 'fi',
    ingressNodeCode: YC_BRIDGE_CODE,
    exitNodeCode: FI_EXIT_CODE,
    ruDirect: false,
    endpointDomainEnv: 'WL_VLESS_DOMAIN',
  },
  {
    code: 'fi_hysteria_whitelist',
    label: 'Finland Whitelist Hysteria',
    protocol: 'hysteria',
    mode: 'whitelist',
    exitRegion: 'fi',
    ingressNodeCode: YC_BRIDGE_CODE,
    exitNodeCode: FI_EXIT_CODE,
    ruDirect: false,
    endpointDomainEnv: 'WL_HYSTERIA_DOMAIN',
  },
  // ── Germany ──────────────────────────────────────────────────────────────
  {
    code: 'de_vless_regular',
    label: 'Germany VLESS',
    protocol: 'vless',
    mode: 'regular',
    exitRegion: 'de',
    ingressNodeCode: DE_EXIT_CODE,
    exitNodeCode: DE_EXIT_CODE,
    ruDirect: true,
    endpointDomainEnv: 'DE_VLESS_DOMAIN',
  },
  {
    code: 'de_hysteria_regular',
    label: 'Germany Hysteria',
    protocol: 'hysteria',
    mode: 'regular',
    exitRegion: 'de',
    ingressNodeCode: DE_EXIT_CODE,
    exitNodeCode: DE_EXIT_CODE,
    ruDirect: true,
    endpointDomainEnv: 'DE_HYSTERIA_DOMAIN',
  },
  {
    code: 'de_vless_whitelist',
    label: 'Germany Whitelist VLESS',
    protocol: 'vless',
    mode: 'whitelist',
    exitRegion: 'de',
    ingressNodeCode: YC_BRIDGE_CODE,
    exitNodeCode: DE_EXIT_CODE,
    ruDirect: false,
    endpointDomainEnv: 'WL_VLESS_DOMAIN',
  },
  {
    code: 'de_hysteria_whitelist',
    label: 'Germany Whitelist Hysteria',
    protocol: 'hysteria',
    mode: 'whitelist',
    exitRegion: 'de',
    ingressNodeCode: YC_BRIDGE_CODE,
    exitNodeCode: DE_EXIT_CODE,
    ruDirect: false,
    endpointDomainEnv: 'WL_HYSTERIA_DOMAIN',
  },
];

/** Bridge inbounds that MUST exist on the Yandex Cloud node. (plan §16.3) */
export const BRIDGE_INBOUNDS = [
  'wl-vless-to-fi',
  'wl-vless-to-de',
  'wl-hysteria-to-fi',
  'wl-hysteria-to-de',
] as const;

export function ruDirectForMode(mode: Mode): boolean {
  return mode === 'regular';
}

export function profilesForExit(region: ExitRegion): ProfileDefinition[] {
  return PROFILE_DEFINITIONS.filter((p) => p.exitRegion === region);
}
