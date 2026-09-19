import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: [
    {
      command: 'mvn spring-boot:run -DskipTests -Dspring-boot.run.profiles=e2e -Dspring-boot.run.useTestClasspath=true -Dspring-boot.run.arguments=--server.port=8082',
      cwd: '../backend',
      env: { WANDERLINE_CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5174' },
      url: 'http://127.0.0.1:8082/actuator/health',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174',
      cwd: '.',
      env: {
        VITE_API_BASE_URL: '/api',
        VITE_PROXY_TARGET: 'http://127.0.0.1:8082',
        VITE_GOOGLE_MAPS_API_KEY: 'stage8-e2e-browser-key',
      },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
