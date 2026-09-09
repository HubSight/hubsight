import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Auto reload when a Vite chunk fails to load (e.g. after a new deployment)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Preload error detected, reloading to fetch latest bundle...', event);
  window.location.reload();
});

// Catch unhandled dynamic module script errors
window.addEventListener('error', (e) => {
  const msg = e.message || '';
  if (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    console.warn('[App] Dynamic module import failed, reloading...');
    window.location.reload();
  }
});

// Register Service Worker with active update checking and automatic refresh
if ('serviceWorker' in navigator) {
  let refreshing = false;

  // Auto-reload when new service worker takes over clients
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Trigger new Service Worker activation immediately
      updateSW(true);
    },
    onOfflineReady() {
      console.log('[PWA] App ready to work offline');
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // 1. Periodically check for updates every 15 minutes
      setInterval(() => {
        registration.update().catch(() => {});
      }, 15 * 60 * 1000);

      // 2. Check for updates whenever user resumes/switches back to the app (PWA or browser tab)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
      window.addEventListener('focus', () => {
        registration.update().catch(() => {});
      });
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
