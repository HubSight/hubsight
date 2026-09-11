import type { ClientDeviceInfo, ClientType } from '../types';

/**
 * Collects or enriches detailed device information for both Web browsers
 * and Native applications (Flutter / React Native / Electron).
 */
export async function getOrCollectDeviceInfo(
  customInfo?: Partial<ClientDeviceInfo>,
): Promise<ClientDeviceInfo> {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

  if (!isBrowser) {
    // Non-browser / Node.js / Background worker environment
    return {
      fingerprint: customInfo?.fingerprint || 'hs_headless_client',
      device_label: customInfo?.device_label || 'HubSight Headless Client',
      client_type: customInfo?.client_type || 'third_party',
      ...customInfo,
    };
  }

  // 1. Resolve Persistent Device ID from LocalStorage
  let persistentId = '';
  try {
    const key = 'hs_device_id';
    persistentId = localStorage.getItem(key) || '';
    if (!persistentId && typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      persistentId = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, persistentId);
    }
  } catch {
    // LocalStorage might be restricted
  }

  // 2. Parse User-Agent & Hardware details
  const ua = navigator.userAgent || '';
  const uaLower = ua.toLowerCase();

  // OS Detection
  let platform = customInfo?.platform || '';
  let osVersion = customInfo?.os_version || '';
  let clientType: ClientType = customInfo?.client_type || 'web';

  if (!platform) {
    if (uaLower.includes('windows nt 10.0')) {
      platform = 'Windows 10/11';
      clientType = 'web';
    } else if (uaLower.includes('windows')) {
      platform = 'Windows';
      clientType = 'web';
    } else if (uaLower.includes('iphone')) {
      platform = 'iOS';
      clientType = 'mobile_ios';
      const m = ua.match(/iPhone OS ([\d_]+)/);
      if (m) osVersion = m[1].replace(/_/g, '.');
    } else if (uaLower.includes('ipad')) {
      platform = 'iPadOS';
      clientType = 'mobile_ios';
      const m = ua.match(/CPU OS ([\d_]+)/);
      if (m) osVersion = m[1].replace(/_/g, '.');
    } else if (uaLower.includes('android')) {
      platform = 'Android';
      clientType = 'mobile_android';
      const m = ua.match(/Android ([\d.]+)/);
      if (m) osVersion = m[1];
    } else if (uaLower.includes('macintosh') || uaLower.includes('mac os x')) {
      platform = 'macOS';
      clientType = 'web';
      const m = ua.match(/Mac OS X ([\d_]+)/);
      if (m) osVersion = m[1].replace(/_/g, '.');
    } else if (uaLower.includes('linux')) {
      platform = 'Linux';
      clientType = 'web';
    } else {
      platform = 'Web';
    }
  }

  // Browser Detection
  let browserName = customInfo?.browser_name || '';
  let browserVersion = customInfo?.browser_version || '';

  if (!browserName) {
    if (uaLower.includes('edg/')) {
      browserName = 'Edge';
      const m = ua.match(/Edg\/([\d.]+)/);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('chrome/') && !uaLower.includes('edg/')) {
      browserName = 'Chrome';
      const m = ua.match(/Chrome\/([\d.]+)/);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) {
      browserName = 'Safari';
      const m = ua.match(/Version\/([\d.]+)/);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('firefox/')) {
      browserName = 'Firefox';
      const m = ua.match(/Firefox\/([\d.]+)/);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('opera/') || uaLower.includes('opr/')) {
      browserName = 'Opera';
    } else {
      browserName = 'Trình duyệt Web';
    }
  }

  // Screen resolution
  let screenResolution = customInfo?.screen_resolution || '';
  if (!screenResolution && typeof window.screen !== 'undefined') {
    screenResolution = `${window.screen.width || 0}x${window.screen.height || 0}`;
  }

  // Timezone & Language
  let timezone = customInfo?.timezone || '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = 'UTC';
  }

  const language = customInfo?.language || navigator.language || 'vi';

  // 3. Synthesize friendly Device Label
  let deviceLabel = customInfo?.device_label || '';
  if (!deviceLabel) {
    if (customInfo?.model) {
      // Native model supplied
      const mfg = customInfo.manufacturer ? `${customInfo.manufacturer} ` : '';
      deviceLabel = `${mfg}${customInfo.model} (${platform}${osVersion ? ' ' + osVersion : ''})`;
      if (customInfo.app_version) {
        deviceLabel += ` • App v${customInfo.app_version}`;
      }
    } else {
      // Web browser synthesis
      const bPart = browserVersion ? `${browserName} ${browserVersion}` : browserName;
      const osPart = osVersion ? `${platform} ${osVersion}` : platform;
      deviceLabel = `${bPart} trên ${osPart}`;
      if (screenResolution) {
        deviceLabel += ` (${screenResolution})`;
      }
    }
  }

  // 4. Stable Deterministic Hardware / Browser Fingerprint
  let fingerprint = customInfo?.fingerprint || '';
  if (!fingerprint) {
    try {
      const components = [
        persistentId,
        platform,
        osVersion,
        browserName,
        screenResolution,
        timezone,
        language,
        navigator.hardwareConcurrency || 4,
      ].join('|');

      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const encoder = new TextEncoder();
        const data = encoder.encode(components);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        fingerprint = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } else {
        fingerprint = persistentId || 'web_fp_default';
      }
    } catch {
      fingerprint = persistentId || 'web_fp_default';
    }
  }

  return {
    fingerprint,
    device_label: deviceLabel,
    client_type: clientType,
    platform,
    os_version: osVersion,
    browser_name: browserName,
    browser_version: browserVersion,
    screen_resolution: screenResolution,
    language,
    timezone,
    ...customInfo,
  };
}
