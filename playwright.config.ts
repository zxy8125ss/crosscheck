import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/crosscheck/', ...devices['iPhone 13'], browserName: 'chromium', locale: 'zh-CN' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/crosscheck/', reuseExistingServer: true },
});
