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

export type RealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type Unsubscribe = () => void;

export type RealtimeStatusListener = (status: RealtimeStatus) => void;

export interface RealtimeManager {
  readonly status: RealtimeStatus;
  isConnected(): boolean;
  onStatusChange(listener: RealtimeStatusListener): Unsubscribe;

  // Generic strongly-typed subscription
  on<E extends RealtimeEventName>(
    event: E,
    handler: (payload: RealtimeEventMap[E]) => void,
  ): Unsubscribe;

  // Built-in convenience listeners
  onNotification(handler: (item: NotificationItem) => void): Unsubscribe;
  onVision(handler: (event: VisionBoxesEvent) => void): Unsubscribe;
  onRecognitionLog(handler: (item: RecognitionLogItem) => void): Unsubscribe;
  onPoolStatus(handler: (status: PoolStatusSummary) => void): Unsubscribe;
  onNvrStatus(handler: (status: NvrStatusResponse) => void): Unsubscribe;
  onCamera(handler: (event: CameraEvent) => void): Unsubscribe;

  connect(): void;
  disconnect(): void;
  close(): void;
}
