import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 子路径；Cloudflare Pages 用 BASE=/ 构建
const base = process.env.BASE ?? '/crosscheck/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 不自动刷新：新版就绪后由页面提示「内容已更新，点击刷新」
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Crosscheck',
        short_name: 'Crosscheck',
        description: '先写自己现在怎么做，再看《高性价比人生指南》怎么说，最后记下要不要做。',
        lang: 'zh-CN',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F2EADF',
        theme_color: '#29473A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 内容 JSON 也预缓存：飞行模式下能展开任何一章；内容更新即新版 SW，走刷新提示
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: 'jsdom', include: ['tests/**/*.test.{mjs,ts,tsx}'] },
} as any);
