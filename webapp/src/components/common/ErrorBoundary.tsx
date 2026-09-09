import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHardReset = async () => {
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } catch (e) {
      console.error('Failed to clean caches', e);
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="bg-slate-800/90 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center mx-auto text-2xl font-black">
              !
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ứng dụng cần làm mới</h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Hệ thống vừa cập nhật phiên bản mới hoặc gặp sự cố đồng bộ dữ liệu đệm.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Tải lại trang
              </button>
              <button
                type="button"
                onClick={this.handleHardReset}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Xóa đệm & Tải mới
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
