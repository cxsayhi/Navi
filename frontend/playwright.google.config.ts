import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './google-smoke',
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{
    name: 'chrome',
    use: { ...devices['Desktop Chrome'], channel: 'chrome' },
  }],
  webServer: [
    {
      command: "./mvnw -q test-compile spring-boot:run -DskipTests -Dspring-boot.run.profiles=google-smoke -Dspring-boot.run.useTestClasspath=true -Dspring-boot.run.additional-classpath-elements=target/test-classes '-Dspring-boot.run.arguments=--server.port=8084'",
      cwd: '../backend',
      env: {
        GOOGLE_MAPS_SERVER_API_KEY: process.env.GOOGLE_MAPS_SERVER_API_KEY ?? '',
        WANDERLINE_CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5175',
      },
      url: 'http://127.0.0.1:8084/actuator/health',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5175',
      cwd: '.',
      env: {
        VITE_API_BASE_URL: '/api',
        VITE_PROXY_TARGET: 'http://127.0.0.1:8084',
        VITE_GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_BROWSER_API_KEY ?? '',
        VITE_GOOGLE_MAPS_MAP_ID: process.env.GOOGLE_MAPS_MAP_ID ?? '',
      },
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
