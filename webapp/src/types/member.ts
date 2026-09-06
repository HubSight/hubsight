// Domain types moved to `@hubsight/api` — re-exported here for existing import paths.
import type { MemberRole } from '@hubsight/api';

export type { MemberRole, FaceItem, MemberItem } from '@hubsight/api';

export interface MemberFormData {
  name: string;
  role: MemberRole;
  avatar_url: string;
}
