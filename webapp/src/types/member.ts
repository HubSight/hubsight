// Domain types re-exported from `@hubsight/sdk` for existing import paths.
import type { MemberRole } from '@hubsight/sdk';

export type { MemberRole, FaceItem, MemberItem } from '@hubsight/sdk';

export interface MemberFormData {
  name: string;
  role: MemberRole;
  avatar_url: string;
}
