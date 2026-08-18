export interface BrandPreset {
  id: string;
  name: string;
  tag: string;
  defaultPort: number;
  defaultUser: string;
  generateUrl: (
    ip: string,
    port: number,
    user: string,
    pass: string,
    channel: number,
    isSub: boolean
  ) => string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'generic',
    name: 'Generic (Manual RTSP)',
    tag: 'Generic',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass) =>
      `rtsp://${user}:${pass}@${ip}:${port}/stream`,
  },
  {
    id: 'hikvision',
    name: 'Hikvision',
    tag: 'Hikvision',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/${channel}0${
        isSub ? '2' : '1'
      }`,
  },
  {
    id: 'dahua',
    name: 'Dahua',
    tag: 'Dahua',
    defaultPort: 554,
    defaultUser: 'admin',
    generateUrl: (ip, port, user, pass, channel, isSub) =>
      `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${channel}&subtype=${
        isSub ? 1 : 0
      }`,
  },
];

export const FFMPEG_PRESET_TAGS = [
  { label: 'Drop Corrupt', value: '-fflags +genpts+discardcorrupt', desc: 'Drops corrupted frames' },
  { label: 'TCP Transport', value: '-rtsp_transport tcp', desc: 'Force TCP' },
  { label: 'UDP Transport', value: '-rtsp_transport udp', desc: 'Force UDP' },
  { label: 'No Audio', value: '-an', desc: 'Disable audio completely' }
];
