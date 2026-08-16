import { defineConfig } from '@playwright/test';

// I test end-to-end girano su un telefono simulato: è lì che il gioco deve stare in piedi.
export default defineConfig({
  testDir: './test',
  testMatch: /e2e\.spec\.js/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:8123',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    locale: 'it-IT',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'python3 -m http.server 8123',
    port: 8123,
    reuseExistingServer: true,
  },
});
