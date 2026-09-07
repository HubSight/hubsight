import type { InternalSocketClient, SocketState } from '../internal/socket/types';
import type {
  NotificationItem,
  NvrStatusResponse,
  PoolStatusSummary,
  RecognitionLogItem,
} from '../types';
import type {
  CameraEvent,
  RealtimeEventMap,
  RealtimeEventName,
  VisionBoxesEvent,
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

    on<E extends RealtimeEventName>(
      event: E,
      handler: (payload: RealtimeEventMap[E]) => void,
    ): Unsubscribe {
      return socket.on(event as string, (raw) => {
        handler(raw as RealtimeEventMap[E]);
      });
    },

    onNotification(handler: (item: NotificationItem) => void): Unsubscribe {
      return this.on('notification.new', handler);
    },

    onVision(handler: (event: VisionBoxesEvent) => void): Unsubscribe {
      const u1 = this.on('vision.person.update', handler);
      const u2 = this.on('vision.person.entered', handler);
      const u3 = this.on('vision.person.left', handler);
      return () => {
        u1();
        u2();
        u3();
      };
    },

    onRecognitionLog(handler: (item: RecognitionLogItem) => void): Unsubscribe {
      return this.on('vision.log.new', handler);
    },

    onPoolStatus(handler: (status: PoolStatusSummary) => void): Unsubscribe {
      return this.on('pool.status.update', (raw) => {
        if (raw && typeof raw === 'object' && 'data' in raw) {
          handler(raw.data as PoolStatusSummary);
        } else {
          handler(raw as PoolStatusSummary);
        }
      });
    },

    onNvrStatus(handler: (status: NvrStatusResponse) => void): Unsubscribe {
      return this.on('nvr.status.update', handler);
    },

    onCamera(handler: (event: CameraEvent) => void): Unsubscribe {
      const u1 = this.on('camera.started', handler);
      const u2 = this.on('camera.stopped', handler);
      const u3 = this.on('camera.updated', handler);
      return () => {
        u1();
        u2();
        u3();
      };
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

