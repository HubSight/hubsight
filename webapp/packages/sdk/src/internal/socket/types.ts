export type SocketState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type Unsubscribe = () => void;

export type SocketStateListener = (state: SocketState) => void;

export interface InternalSocketClient {
  connect(): void;
  disconnect(): void;
  close(): void;
  isConnected(): boolean;
  getState(): SocketState;
  onStateChange(listener: SocketStateListener): Unsubscribe;
  on(event: string, handler: (payload: unknown) => void): Unsubscribe;
  emit(event: string, data?: unknown): void;
}
