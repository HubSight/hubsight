// PWA detection + refresh-token persistence moved to `@hubsight/sdk`.
// Re-exported here so existing `../utils/pwa` imports keep working.
export {
  isPwa,
  getPwaRefreshToken,
  setPwaRefreshToken,
  clearPwaRefreshToken,
} from '@hubsight/sdk';
