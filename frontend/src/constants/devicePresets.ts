export interface BrandPreset {
  id: string;
  name: string;
  tag: string;
  defaultPort: number;
  defaultUser: string;
  hint?: string;
  generateUrl: (
    ip: string,
    port: number,
    user: string,
    pass: string,
    channel: number,
    isSub: boolean,
    customPath?: string
  ) => string;
}

export type DeviceBrandPreset = BrandPreset;

/**
 * Builds the authentication prefix for an RTSP URL: 'user:pass@', 'user@', ':pass@' or '' if empty
 */
export function buildAuthPrefix(user?: string, pass?: string): string {
  const u = (user || '').trim();
  const p = (pass || '').trim();
  if (!u && !p) return '';
  if (u && p) return `${u}:${p}@`;
  if (u) return `${u}@`;
  return `:${p}@`;
}

export const BADGE_COLOR_PALETTES = [
  'bg-blue-100 text-blue-700 border border-blue-200/80',
  'bg-emerald-100 text-emerald-700 border border-emerald-200/80',
  'bg-violet-100 text-violet-700 border border-violet-200/80',
  'bg-amber-100 text-amber-800 border border-amber-200/80',
  'bg-rose-100 text-rose-700 border border-rose-200/80',
  'bg-cyan-100 text-cyan-700 border border-cyan-200/80',
  'bg-indigo-100 text-indigo-700 border border-indigo-200/80',
  'bg-orange-100 text-orange-700 border border-orange-200/80',
  'bg-teal-100 text-teal-700 border border-teal-200/80',
  'bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200/80',
  'bg-sky-100 text-sky-700 border border-sky-200/80',
  'bg-lime-100 text-lime-800 border border-lime-200/80',
  'bg-purple-100 text-purple-700 border border-purple-200/80',
  'bg-pink-100 text-pink-700 border border-pink-200/80'
];

/**
 * Returns a consistent distinct color class for any brand ID
 */
export function getBrandBadgeColor(brandId?: string): string {
  if (!brandId) return BADGE_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < brandId.length; i++) {
    hash = (hash << 5) - hash + brandId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % BADGE_COLOR_PALETTES.length;
  return BADGE_COLOR_PALETTES[index];
}


export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'generic',
    name: 'Generic (Manual RTSP)',
    tag: 'Generic',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Custom RTSP stream URL or standard direct streaming path',
    generateUrl: (ip, port, user, pass, _channel, _isSub, customPath) => {
      const auth = buildAuthPrefix(user, pass);
      let path = (customPath !== undefined ? customPath : '/stream').trim();
      if (path && !path.startsWith('/')) path = '/' + path;
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}${path || '/stream'}`;
    },
  },
  {
    id: 'hikvision',
    name: 'Hikvision',
    tag: 'Hikvision',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Port 554. Main stream: channel 101, Sub stream: channel 102',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/Streaming/Channels/${
        channel || 1
      }0${isSub ? '2' : '1'}`;
    },
  },
  {
    id: 'ezviz',
    name: 'EZVIZ (Hikvision)',
    tag: 'EZVIZ',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Password is the 6-character Verification Code printed on camera bottom label',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/h264/ch${
        channel || 1
      }/${isSub ? 'sub' : 'main'}/av_stream`;
    },
  },
  {
    id: 'hilook',
    name: 'HiLook (Hikvision)',
    tag: 'HiLook',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Hikvision budget line, standard RTSP port 554',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/Streaming/Channels/${
        channel || 1
      }0${isSub ? '2' : '1'}`;
    },
  },
  {
    id: 'dahua',
    name: 'Dahua',
    tag: 'Dahua',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Main stream subtype=0, Sub stream subtype=1',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/cam/realmonitor?channel=${
        channel || 1
      }&subtype=${isSub ? 1 : 0}`;
    },
  },
  {
    id: 'imou',
    name: 'Imou (Dahua)',
    tag: 'Imou',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Password is the Safety Code / Device Password printed on the device label',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/cam/realmonitor?channel=${
        channel || 1
      }&subtype=${isSub ? 1 : 0}`;
    },
  },
  {
    id: 'kbvision',
    name: 'KBVision',
    tag: 'KBVision',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Uses standard Dahua Realmonitor protocol',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/cam/realmonitor?channel=${
        channel || 1
      }&subtype=${isSub ? 1 : 0}`;
    },
  },
  {
    id: 'tapo',
    name: 'TP-Link Tapo',
    tag: 'Tapo',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Create account in Tapo App: Device Settings -> Advanced -> Camera Account',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/stream${isSub ? 2 : 1}`;
    },
  },
  {
    id: 'vigi',
    name: 'TP-Link VIGI',
    tag: 'VIGI',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'TP-Link enterprise surveillance camera line',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/ch${
        channel || 1
      }/stream${isSub ? 2 : 1}`;
    },
  },
  {
    id: 'uniview',
    name: 'Uniview (UNV)',
    tag: 'Uniview',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'UNV unicast stream format: c{channel}/s{0/1}/live',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/unicast/c${
        channel || 1
      }/s${isSub ? 1 : 0}/live`;
    },
  },
  {
    id: 'yoosee',
    name: 'Yoosee / XMeye (Xiongmai)',
    tag: 'Yoosee',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Enable RTSP / NVR in Yoosee app and set connection password',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const u = (user || '').trim();
      const p = (pass || '').trim();
      const authParams = u || p ? `user=${u}&password=${p}&` : '';
      return `rtsp://${ip || '192.168.1.100'}:${port || 554}/${authParams}channel=${
        channel || 1
      }&stream=${isSub ? 1 : 0}.sdp`;
    },
  },
  {
    id: 'reolink',
    name: 'Reolink',
    tag: 'Reolink',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Enable RTSP in Reolink Client (Settings -> Network -> Server Settings)',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      const ch = Number(channel) || 1;
      const chStr = ch < 10 ? `0${ch}` : `${ch}`;
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/h264Preview_${chStr}_${
        isSub ? 'sub' : 'main'
      }`;
    },
  },
  {
    id: 'tiandy',
    name: 'Tiandy',
    tag: 'Tiandy',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Stream syntax /video{channel}/main or sub',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/video${
        channel || 1
      }/${isSub ? 'sub' : 'main'}`;
    },
  },
  {
    id: 'wisenet',
    name: 'Hanwha Wisenet (Samsung)',
    tag: 'Wisenet',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Profile 1 (Main Stream), Profile 2 (Sub Stream)',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/profile${
        isSub ? 2 : 1
      }/media.smp`;
    },
  },
  {
    id: 'axis',
    name: 'Axis Communications',
    tag: 'Axis',
    defaultPort: 554,
    defaultUser: 'root',
    hint: 'Default account: root. Supports camera channel and streamprofile parameters',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/axis-media/media.amp?camera=${
        channel || 1
      }${isSub ? '&streamprofile=sub' : ''}`;
    },
  },
  {
    id: 'bosch',
    name: 'Bosch Security',
    tag: 'Bosch',
    defaultPort: 554,
    defaultUser: 'service',
    hint: 'Bosch tunnel format: rtsp_tunnel?inst={channel}&stream={1/2}',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/rtsp_tunnel?inst=${
        channel || 1
      }&stream=${isSub ? 2 : 1}`;
    },
  },
  {
    id: 'vivotek',
    name: 'Vivotek',
    tag: 'Vivotek',
    defaultPort: 554,
    defaultUser: 'root',
    hint: 'Default user: root. Streams live.sdp (main) and live2.sdp (sub)',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/live${isSub ? '2' : ''}.sdp`;
    },
  },
  {
    id: 'amcrest',
    name: 'Amcrest',
    tag: 'Amcrest',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Compatible with standard Dahua Realmonitor format',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/cam/realmonitor?channel=${
        channel || 1
      }&subtype=${isSub ? 1 : 0}`;
    },
  },
  {
    id: 'tuya',
    name: 'Tuya / Smart Life',
    tag: 'Tuya',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'For Tuya / Smart Life cameras with local ONVIF / RTSP enabled',
    generateUrl: (ip, port, user, pass, channel) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/live/ch${Math.max(
        0,
        (channel || 1) - 1
      )}`;
    },
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi / Yi (Custom RTSP)',
    tag: 'Xiaomi',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'For Xiaomi / Yi cameras running custom RTSP firmware (Yi-Hack / RTSP Mod)',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/ch0_${
        isSub ? 1 : 0
      }.h264`;
    },
  },
  {
    id: 'foscam',
    name: 'Foscam',
    tag: 'Foscam',
    defaultPort: 88,
    defaultUser: 'admin',
    hint: 'Standard RTSP port is 88 or 554',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 88}/video${isSub ? 'Sub' : 'Main'}`;
    },
  },
  {
    id: 'sonoff',
    name: 'Sonoff (eWeLink)',
    tag: 'Sonoff',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Enable RTSP in eWeLink app (Camera Settings -> RTSP)',
    generateUrl: (ip, port, user, pass) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/av_stream/ch0`;
    },
  },
  {
    id: 'panasonic',
    name: 'Panasonic / i-PRO',
    tag: 'Panasonic',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Standard MediaInput/h264 (1: Main Stream, 2: Sub Stream)',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/MediaInput/h264/${
        isSub ? 2 : 1
      }`;
    },
  },
  {
    id: 'onvif',
    name: 'Standard ONVIF Profile',
    tag: 'ONVIF',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Standard ONVIF RTSP stream path for ONVIF Profile S compatible cameras',
    generateUrl: (ip, port, user, pass, _channel, isSub) => {
      const auth = buildAuthPrefix(user, pass);
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/onvif${isSub ? 2 : 1}`;
    },
  },
];

export const DEVICE_BRAND_PRESETS = BRAND_PRESETS;

export const FFMPEG_PRESET_TAGS = [
  { label: 'Drop Corrupt', value: '-fflags +genpts+discardcorrupt', desc: 'Drops corrupted frames' },
  { label: 'TCP Transport', value: '-rtsp_transport tcp', desc: 'Force TCP' },
  { label: 'UDP Transport', value: '-rtsp_transport udp', desc: 'Force UDP' },
  { label: 'No Audio', value: '-an', desc: 'Disable audio completely' }
];

export interface ParsedRtspUrl {
  user: string;
  pass: string;
  ip: string;
  port: number;
  path: string;
  channel?: number;
  isSub?: boolean;
}

/**
 * Parses an RTSP URL into individual components: user, pass, ip/host, port, path, channel, isSub
 */
export function parseRtspUrl(url: string): ParsedRtspUrl | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Pattern: rtsp://[user[:pass]@]host[:port][/path]
  const match = trimmed.match(
    /^rtsp:\/\/(?:([^:@]+)(?::([^@]*))?@)?(\[[a-fA-F0-9:]+\]|[^:/]+)(?::(\d+))?(\/.*)?$/i
  );
  if (!match) return null;

  const user = match[1] ? decodeURIComponent(match[1]) : '';
  const pass = match[2] ? decodeURIComponent(match[2]) : '';
  const ip = match[3] || '';
  const port = match[4] ? parseInt(match[4], 10) : 554;
  const path = match[5] || '';

  let channel: number | undefined;
  let isSub: boolean | undefined;

  // Detect Hikvision / HiLook channel & sub: /Streaming/Channels/101, 102, 201...
  const hikMatch = path.match(/Streaming\/Channels\/(\d+)0(1|2)/i);
  if (hikMatch) {
    channel = parseInt(hikMatch[1], 10);
    isSub = hikMatch[2] === '2';
  }

  // Detect Dahua / Imou / KBVision / Amcrest: channel=1&subtype=0/1
  const dahuaMatch = path.match(/channel=(\d+).*?subtype=(\d+)/i);
  if (dahuaMatch) {
    channel = parseInt(dahuaMatch[1], 10);
    isSub = dahuaMatch[2] === '1';
  }

  // Detect Tapo: /stream1 or /stream2
  const tapoMatch = path.match(/\/stream(1|2)/i);
  if (tapoMatch) {
    channel = 1;
    isSub = tapoMatch[1] === '2';
  }

  // Detect Reolink: /h264Preview_01_main or /h264Preview_01_sub
  const reoMatch = path.match(/Preview_(\d+)_(main|sub)/i);
  if (reoMatch) {
    channel = parseInt(reoMatch[1], 10);
    isSub = reoMatch[2].toLowerCase() === 'sub';
  }

  // Detect Uniview: /unicast/c1/s0/live
  const unvMatch = path.match(/\/unicast\/c(\d+)\/s([01])\/live/i);
  if (unvMatch) {
    channel = parseInt(unvMatch[1], 10);
    isSub = unvMatch[2] === '1';
  }

  return {
    user,
    pass,
    ip,
    port,
    path,
    channel,
    isSub
  };
}

/**
 * Updates the port inside an RTSP URL string, or inserts it if absent
 */
export function updateRtspUrlPort(url: string, newPort: number): string {
  if (!url || typeof url !== 'string' || !url.startsWith('rtsp://')) {
    return url;
  }
  const port = Number(newPort) || 554;
  return url.replace(
    /^(rtsp:\/\/(?:[^@]+@)?(?:\[[a-fA-F0-9:]+\]|[^:/]+))(?::\d+)?(\/.*)?$/i,
    (_match, prefix, path = '') => {
      return `${prefix}:${port}${path}`;
    }
  );
}
