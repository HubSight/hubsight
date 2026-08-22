import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

let commitHash = 'unknown';
try {
  const gitHeadPath = path.resolve('.git/HEAD');
  if (fs.existsSync(gitHeadPath)) {
    const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
    if (headContent.startsWith('ref: ')) {
      const refPath = path.resolve('.git', headContent.substring(5));
      if (fs.existsSync(refPath)) {
        commitHash = fs.readFileSync(refPath, 'utf-8').trim().substring(0, 7);
      }
    } else {
      commitHash = headContent.substring(0, 7);
    }
  }
} catch (e) {
  console.error('Failed to get commit hash', e);
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __COMMIT_HASH__: JSON.stringify(commitHash)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/healthz/],
      },
      manifest: {
        name: 'HubSight Surveillance & Playback',
        short_name: 'HubSight',
        description: 'HubSight camera surveillance and playback platform',
        theme_color: '#ea580c',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/',
        categories: ['utilities', 'security', 'video', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Devices',
            url: '/',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Playback',
            url: '/playback',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'NVR Monitor',
            url: '/nvr',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
    },
  },
});
