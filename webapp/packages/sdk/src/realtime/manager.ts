import type { InternalSocketClient, SocketState } from '../internal/socket/types';
import type {
  NotificationItem,
  NvrStatusResponse,
  PoolStatusSummary,
  RecognitionLogItem,
} from '../types';
import {
  INTERNAL_REALTIME_EVENTS,
  type CameraEvent,
  type ForceLogoutEvent,
  type MemberFaceUpdatedEvent,
  type VisionBoxesEvent,
} from './events';
import type {
  RealtimeManager,
  RealtimeStatus,
  RealtimeStatusListener,
  Unsubscribe,
} from './types';

export interface CreateRealtimeManagerOptions {
  socket: InternalSocketClient;
}

export function createRealtimeManager(options: CreateRealtimeManagerOptions): RealtimeManager {
  const { socket } = options;

  const mapStatus = (state: SocketState): RealtimeStatus => state;

  const subscribeInternal = <T>(eventName: string, handler: (payload: T) => void): Unsubscribe => {
    return socket.on(eventName, (raw) => {
      handler(raw as T);
    });
  };

  return {
    get status(): RealtimeStatus {
      return mapStatus(socket.getState());
    },

    isConnected(): boolean {
      return socket.isConnected();
    },

    onStatusChange(listener: RealtimeStatusListener): Unsubscribe {
      return socket.onStateChange((state) => {
        listener(mapStatus(state));
      });
    },

    onForceLogout(handler: (event: ForceLogoutEvent) => void): Unsubscribe {
      return subscribeInternal<ForceLogoutEvent>(INTERNAL_REALTIME_EVENTS.AUTH_FORCE_LOGOUT, handler);
    },

    onNotification(handler: (item: NotificationItem) => void): Unsubscribe {
      return subscribeInternal<NotificationItem>(INTERNAL_REALTIME_EVENTS.NOTIFICATION_NEW, handler);
    },

    onVision(handler: (event: VisionBoxesEvent) => void): Unsubscribe {
      const u1 = subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_UPDATE, handler);
      const u2 = subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_ENTERED, handler);
      const u3 = subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_LEFT, handler);
      return () => {
        u1();
        u2();
        u3();
      };
    },

    onVisionPersonEntered(handler: (event: VisionBoxesEvent) => void): Unsubscribe {
      return subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_ENTERED, handler);
    },

    onVisionPersonUpdate(handler: (event: VisionBoxesEvent) => void): Unsubscribe {
      return subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_UPDATE, handler);
    },

    onVisionPersonLeft(handler: (event: VisionBoxesEvent) => void): Unsubscribe {
      return subscribeInternal<VisionBoxesEvent>(INTERNAL_REALTIME_EVENTS.VISION_PERSON_LEFT, handler);
    },

    onRecognitionLog(handler: (item: RecognitionLogItem) => void): Unsubscribe {
      return subscribeInternal<RecognitionLogItem>(INTERNAL_REALTIME_EVENTS.VISION_LOG_NEW, handler);
    },

    onMemberFaceUpdated(handler: (event: MemberFaceUpdatedEvent) => void): Unsubscribe {
      return subscribeInternal<MemberFaceUpdatedEvent>(INTERNAL_REALTIME_EVENTS.MEMBER_FACE_UPDATED, handler);
    },

    onPoolStatus(handler: (status: PoolStatusSummary) => void): Unsubscribe {
      return socket.on(INTERNAL_REALTIME_EVENTS.POOL_STATUS_UPDATE, (raw) => {
        if (raw && typeof raw === 'object' && 'data' in raw) {
          handler((raw as { data: PoolStatusSummary }).data);
        } else {
          handler(raw as PoolStatusSummary);
        }
      });
    },

    onNvrStatus(handler: (status: NvrStatusResponse) => void): Unsubscribe {
      return subscribeInternal<NvrStatusResponse>(INTERNAL_REALTIME_EVENTS.NVR_STATUS_UPDATE, handler);
    },

    onCamera(handler: (event: CameraEvent) => void): Unsubscribe {
      const u1 = subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_STARTED, handler);
      const u2 = subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_STOPPED, handler);
      const u3 = subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_UPDATED, handler);
      return () => {
        u1();
        u2();
        u3();
      };
    },

    onCameraStarted(handler: (event: CameraEvent) => void): Unsubscribe {
      return subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_STARTED, handler);
    },

    onCameraStopped(handler: (event: CameraEvent) => void): Unsubscribe {
      return subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_STOPPED, handler);
    },

    onCameraUpdated(handler: (event: CameraEvent) => void): Unsubscribe {
      return subscribeInternal<CameraEvent>(INTERNAL_REALTIME_EVENTS.CAMERA_UPDATED, handler);
    },

    connect(): void {
      socket.connect();
    },

    disconnect(): void {
      socket.disconnect();
    },

    close(): void {
      socket.close();
    },
  };
}

