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
    isSub: boolean
  ) => string;
}

export type DeviceBrandPreset = BrandPreset;

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'generic',
    name: 'Generic (Manual RTSP)',
    tag: 'Generic',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Sử dụng đường dẫn RTSP tùy chỉnh hoặc luồng stream chuẩn',
    generateUrl: (ip, port, user, pass) => {
      const auth = user ? (pass ? `${user}:${pass}@` : `${user}@`) : '';
      return `rtsp://${auth}${ip || '192.168.1.100'}:${port || 554}/stream`;
    },
  },
  {
    id: 'hikvision',
    name: 'Hikvision',
    tag: 'Hikvision',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Cổng 554. Luồng chính: channel 101, Luồng phụ: channel 102',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/${channel || 1}0${
        isSub ? '2' : '1'
      }`,
  },
  {
    id: 'ezviz',
    name: 'EZVIZ (Hikvision)',
    tag: 'EZVIZ',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Mật khẩu là Verification Code (6 ký tự in hoa) in dưới đáy camera',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/h264/ch${channel || 1}/${
        isSub ? 'sub' : 'main'
      }/av_stream`,
  },
  {
    id: 'hilook',
    name: 'HiLook (Hikvision)',
    tag: 'HiLook',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Dòng sản phẩm giá rẻ của Hikvision, chuẩn cổng 554',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/${channel || 1}0${
        isSub ? '2' : '1'
      }`,
  },
  {
    id: 'dahua',
    name: 'Dahua',
    tag: 'Dahua',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Luồng chính subtype=0, Luồng phụ subtype=1',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${channel || 1}&subtype=${
        isSub ? 1 : 0
      }`,
  },
  {
    id: 'imou',
    name: 'Imou (Dahua)',
    tag: 'Imou',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Mật khẩu là Safety Code / Device Password trên tem nhãn thiết bị',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${channel || 1}&subtype=${
        isSub ? 1 : 0
      }`,
  },
  {
    id: 'kbvision',
    name: 'KBVision',
    tag: 'KBVision',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Sử dụng giao thức Dahua Realmonitor chuẩn',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${channel || 1}&subtype=${
        isSub ? 1 : 0
      }`,
  },
  {
    id: 'tapo',
    name: 'TP-Link Tapo',
    tag: 'Tapo',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Tạo tài khoản trong App Tapo: Cài đặt thiết bị -> Nâng cao -> Tài khoản camera',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/stream${isSub ? 2 : 1}`,
  },
  {
    id: 'vigi',
    name: 'TP-Link VIGI',
    tag: 'VIGI',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Dòng camera giám sát chuyên dụng VIGI của TP-Link',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/ch${channel || 1}/stream${isSub ? 2 : 1}`,
  },
  {
    id: 'uniview',
    name: 'Uniview (UNV)',
    tag: 'Uniview',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Định dạng luồng unicast UNV: c{kênh}/s{0/1}/live',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/unicast/c${channel || 1}/s${
        isSub ? 1 : 0
      }/live`,
  },
  {
    id: 'yoosee',
    name: 'Yoosee / XMeye (Xiongmai)',
    tag: 'Yoosee',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Bật RTSP / NVR trong app Yoosee và đặt mật khẩu kết nối camera',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/user=${user}&password=${pass}&channel=${
        channel || 1
      }&stream=${isSub ? 1 : 0}.sdp`,
  },
  {
    id: 'reolink',
    name: 'Reolink',
    tag: 'Reolink',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Bật RTSP trong Reolink Client (Settings -> Network -> Server Settings)',
    generateUrl: (ip, port, user, pass, channel, isSub) => {
      const ch = Number(channel) || 1;
      const chStr = ch < 10 ? `0${ch}` : `${ch}`;
      return `rtsp://${user}:${pass}@${ip}:${port}/h264Preview_${chStr}_${
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
    hint: 'Cú pháp luồng /video{channel}/main hoặc sub',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/video${channel || 1}/${
        isSub ? 'sub' : 'main'
      }`,
  },
  {
    id: 'wisenet',
    name: 'Hanwha Wisenet (Samsung)',
    tag: 'Wisenet',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Profile 1 (Main Stream), Profile 2 (Sub Stream)',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/profile${isSub ? 2 : 1}/media.smp`,
  },
  {
    id: 'axis',
    name: 'Axis Communications',
    tag: 'Axis',
    defaultPort: 554,
    defaultUser: 'root',
    hint: 'Tài khoản mặc định: root. Hỗ trợ tham số camera channel và streamprofile',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/axis-media/media.amp?camera=${
        channel || 1
      }${isSub ? '&streamprofile=sub' : ''}`,
  },
  {
    id: 'bosch',
    name: 'Bosch Security',
    tag: 'Bosch',
    defaultPort: 554,
    defaultUser: 'service',
    hint: 'Định dạng tunnel Bosch: rtsp_tunnel?inst={channel}&stream={1/2}',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/rtsp_tunnel?inst=${channel || 1}&stream=${
        isSub ? 2 : 1
      }`,
  },
  {
    id: 'vivotek',
    name: 'Vivotek',
    tag: 'Vivotek',
    defaultPort: 554,
    defaultUser: 'root',
    hint: 'Tài khoản mặc định: root. Luồng live.sdp (chính), live2.sdp (phụ)',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/live${isSub ? '2' : ''}.sdp`,
  },
  {
    id: 'amcrest',
    name: 'Amcrest',
    tag: 'Amcrest',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Tương thích chuẩn định dạng Dahua Realmonitor',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${channel || 1}&subtype=${
        isSub ? 1 : 0
      }`,
  },
  {
    id: 'tuya',
    name: 'Tuya / Smart Life',
    tag: 'Tuya',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Áp dụng cho camera Tuya / Smart Life có kích hoạt luồng ONVIF / RTSP cục bộ',
    generateUrl: (ip, port, user, pass, channel) =>
      `rtsp://${user}:${pass}@${ip}:${port}/live/ch${Math.max(0, (channel || 1) - 1)}`,
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi / Yi (Custom RTSP)',
    tag: 'Xiaomi',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Dành cho camera Xiaomi / Yi chạy firmware hỗ trợ RTSP (Yi-Hack / RTSP Mod)',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/ch0_${isSub ? 1 : 0}.h264`,
  },
  {
    id: 'foscam',
    name: 'Foscam',
    tag: 'Foscam',
    defaultPort: 88,
    defaultUser: 'admin',
    hint: 'Cổng RTSP thường dùng là 88 hoặc 554',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/video${isSub ? 'Sub' : 'Main'}`,
  },
  {
    id: 'sonoff',
    name: 'Sonoff (eWeLink)',
    tag: 'Sonoff',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Bật tính năng RTSP trong ứng dụng eWeLink (Camera Settings -> RTSP)',
    generateUrl: (ip, port, user, pass) =>
      `rtsp://${user}:${pass}@${ip}:${port}/av_stream/ch0`,
  },
  {
    id: 'panasonic',
    name: 'Panasonic / i-PRO',
    tag: 'Panasonic',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Chuẩn MediaInput/h264 (1: Main Stream, 2: Sub Stream)',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/MediaInput/h264/${isSub ? 2 : 1}`,
  },
  {
    id: 'onvif',
    name: 'Standard ONVIF Profile',
    tag: 'ONVIF',
    defaultPort: 554,
    defaultUser: 'admin',
    hint: 'Đường dẫn ONVIF RTSP chuẩn cho camera hỗ trợ ONVIF Profile S',
    generateUrl: (ip, port, user, pass, _channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/onvif${isSub ? 2 : 1}`,
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
