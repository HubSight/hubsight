/**
 * HubSight Domain Resources and Standalone Tree-Shakable Functions.
 */

export type { HttpLike } from './context';
export { resolveHttpClient } from './context';

// ── Cameras ──────────────────────────────────────────────────────────────────
export {
  createCamerasResource,
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  startCamera,
  stopCamera,
  restartCamera,
  getCameraRecognitionLogs,
  clearCameraRecognitionLogs,
  type CamerasResource,
} from './cameras';

// ── Devices ──────────────────────────────────────────────────────────────────
export {
  createDevicesResource,
  startDeviceScan,
  getDeviceScan,
  type DevicesResource,
} from './devices';

// ── Members ──────────────────────────────────────────────────────────────────
export {
  createMembersResource,
  listMembers,
  createMember,
  updateMember,
  deleteMember,
  uploadMemberAvatar,
  removeMemberAvatar,
  listMemberFaces,
  enrollMemberFace,
  deleteMemberFace,
  deleteMemberFaces,
  type MembersResource,
} from './members';

// ── Notifications ────────────────────────────────────────────────────────────
export {
  createNotificationsResource,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  sendTestNotification,
  getPushConfig,
  subscribePush,
  type NotificationsResource,
} from './notifications';

// ── Archive ──────────────────────────────────────────────────────────────────
export {
  createArchiveResource,
  getAvailableDays,
  getTimeline,
  getStreamUrl,
  getThumbnailUrl,
  type ArchiveResource,
} from './archive';

// ── Access Control ───────────────────────────────────────────────────────────
export {
  createAccessResource,
  createUsersResource,
  createRolesResource,
  createPermissionsResource,
  listUsers,
  createUser,
  updateUser,
  blockUser,
  resetUserPassword,
  deleteUser,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
  type AccessResource,
  type UsersResource,
  type RolesResource,
  type PermissionsResource,
} from './access';

// ── Connection Pool ──────────────────────────────────────────────────────────
export {
  createPoolResource,
  getPoolStatus,
  type PoolResource,
} from './pool';

// ── Recorder & Settings ──────────────────────────────────────────────────────
export {
  createRecorderResource,
  getNvrStatus,
  updateRecorderSettings,
  cleanupStorage,
  type RecorderResource,
} from './recorder';

// ── Application Clients ──────────────────────────────────────────────────────
export {
  createClientsResource,
  listClients,
  createClient,
  updateClient,
  toggleClient,
  rotateClientKey,
  deleteClient,
  verifyClientKey,
  type ClientsResource,
} from './clients';

