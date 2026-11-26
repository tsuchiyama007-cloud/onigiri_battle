import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages では /<リポジトリ名>/ 配下で配信されるため BASE_PATH で切り替える
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  build: { target: 'es2020', outDir: 'dist' },
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'おにぎりバトル！',
        short_name: 'おにぎりバトル',
        description: '三角おにぎりをつなげて「にぎる」落ちもの対戦パズル',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#ffe9da',
        theme_color: '#ffd8c2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // 日本語フォントは必要な分だけ実行時にキャッシュ
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
});
