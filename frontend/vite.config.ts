import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 배포 시 VITE_BASE_PATH=/portfolio-dashboard/ 로 빌드
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '내 포트폴리오',
        short_name: '포트폴리오',
        description: '전 계좌 자산 현황 대시보드',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F2F4F6',
        theme_color: '#3182F6',
        orientation: 'portrait-primary',
        lang: 'ko',
        icons: [
          {
            src: `${base}favicon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // API는 항상 네트워크 우선 (오프라인일 때만 캐시), 정적 자원은 캐시 우선
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https?.*\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:js|css|woff2?|svg|png|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'static-cache' },
          },
        ],
      },
      devOptions: {
        enabled: false, // dev에서는 SW 비활성 (HMR 충돌 방지)
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
