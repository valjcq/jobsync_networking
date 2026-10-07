import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Cap local concurrency: too many parallel contexts (workers x 3 browsers)
     starve the single dev server + SQLite, making combobox "Create" server
     actions slow enough to time out. */
  workers: process.env.CI ? 1 : 4,
  /* Heavier flows (e.g. adding a resume experience makes several sequential
     server-action "Create" calls) need headroom under that load. */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3737",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-audit/,
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      testIgnore: /mobile-audit/,
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      testIgnore: /mobile-audit/,
      use: { ...devices["Desktop Safari"] },
    },

    /* Phone-width audit of every page and popup: npm run test:e2e:mobile.
       Chromium only; the WebKit/iOS keyboard behaviour needs a real phone. */
    {
      name: "mobile-390",
      testMatch: /mobile-audit/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        // Escape hatch for machines whose cached Chromium build differs from
        // the one this Playwright version expects.
        ...(process.env.E2E_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } }
          : {}),
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3737",
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
