import { defineConfig } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  globalSetup: require.resolve('./global-setup'),
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  reporter: [['html', { open: 'never' }]],
  webServer: [
    {
      command: `${path.resolve(__dirname, 'node_modules/.bin/firebase')} emulators:start --project demo-owlet-e2e --only auth,firestore`,
      cwd: path.resolve(__dirname, '..'),
      url: 'http://localhost:9099',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // By default Playwright SIGKILLs the webServer's process group. firebase
      // starts the Firestore emulator (Java) in its own process group, so it
      // survives that and is orphaned on :8081. SIGTERM lets the firebase CLI
      // run its clean shutdown, which stops Java too.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command: 'npm run start:e2e',
      cwd: path.resolve(__dirname, '../backend'),
      port: 8090,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:e2e',
      cwd: path.resolve(__dirname, '../frontend'),
      port: 5174,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
