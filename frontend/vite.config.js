import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'resco-logo.png',
        'resco-school1.jpg',
        'pwa-icons/*.png',
      ],
      manifest: {
        name: "RESCO CBT System",
        short_name: "RESCO CBT",
        description: "Redeemer's Schools Computer-Based Test System",
        theme_color: '#4338ca',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['education'],
        icons: [
          { src: '/pwa-icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/pwa-icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/pwa-icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/pwa-icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/pwa-icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/pwa-icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/pwa-icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        screenshots: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
