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
        skipWaiting: true,        // 새 배포 즉시 활성화
        clientsClaim: true,       // 즉시 모든 탭 제어
        // 분석 탭을 열 때만 필요한 대형 차트 번들은 설치 시 미리 받지 않는다.
        globIgnores: [
          '**/CategoricalChart-*.js',
          '**/CartesianChart-*.js',
          '**/tooltipContext-*.js',
        ],
        // 금융 API 응답은 서비스 워커에 저장하지 않는다.
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
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
  build: {
    // 차트·아이콘 라이브러리를 별도 청크로 분리해 initial bundle 감축
    // Vite 8(rolldown)은 manualChunks를 function 형태만 허용
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('@tanstack/react-query')) return 'query-vendor';
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'react-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
