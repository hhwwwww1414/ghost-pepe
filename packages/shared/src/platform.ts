/** Device platform detection used by subscription page + import backend. */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'android_tv' | 'unknown';

export function detectPlatform(userAgent: string | undefined | null): Platform {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return 'unknown';
  if (/android tv|googletv|smarttv|aft|bravia|crkey/.test(ua)) return 'android_tv';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // iPadOS 13+ reports as Macintosh; treat touch Macs heuristically on the client.
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/linux/.test(ua)) return 'linux';
  return 'unknown';
}

const SUPPORTED_PLATFORMS: Platform[] = [
  'ios',
  'android',
  'windows',
  'macos',
  'linux',
  'android_tv',
];

export function isSupportedPlatform(p: string): p is Platform {
  return SUPPORTED_PLATFORMS.includes(p as Platform);
}

export function platformDisplayName(p: Platform): string {
  switch (p) {
    case 'ios':
      return 'iPhone / iPad';
    case 'android':
      return 'Android';
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'android_tv':
      return 'Android TV';
    default:
      return 'Устройство';
  }
}
