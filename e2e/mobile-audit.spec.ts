import { type Locator, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// Runs under the mobile-390 project (390x844, touch). It checks that no page
// scrolls sideways, that every popup fits the screen, and that a popup's
// submit button can be reached and tapped. Screenshots land in
// screenshots/mobile/ so a before/after run can be compared by eye.

const SHOTS = "screenshots/mobile";

const ROUTES = [
  "/dashboard",
  "/dashboard/myjobs",
  "/dashboard/tasks",
  "/dashboard/networking",
  "/dashboard/activities",
  "/dashboard/questions",
  "/dashboard/profile",
  "/dashboard/automations",
  "/dashboard/settings",
];

async function expectNoSideScroll(page: Page) {
  // Against the configured width, not window.innerWidth: a mobile browser
  // widens its layout viewport to fit overflowing content, which would hide it.
  const width = page.viewportSize()!.width;
  const overflow = await page.evaluate(
    (w) => document.documentElement.scrollWidth - w,
    width,
  );
  expect(overflow, "page scrolls sideways by this many px").toBeLessThanOrEqual(1);
}

// Popups slide and zoom in; measuring mid-animation reports a box that is
// partly off screen. Wait until the box stops moving.
async function settled(box: Locator) {
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await box.boundingBox());
      const stable = now === last;
      last = now;
      return stable;
    }, { intervals: [150] })
    .toBe(true);
}

async function expectFitsViewport(page: Page, box: Locator) {
  await settled(box);
  const rect = await box.boundingBox();
  const vp = page.viewportSize()!;
  expect(rect, "popup has no box").not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(-0.5);
  expect(rect!.y).toBeGreaterThanOrEqual(-0.5);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(vp.height + 0.5);
}

// Scrolls the popup to the submit button and taps it without sending it
// (trial: true checks it is visible, stable and not covered).
async function expectSubmitReachable(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await button.click({ trial: true });
}

for (const route of ROUTES) {
  test(`${route} does not scroll sideways`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page);
    await page.screenshot({
      path: `${SHOTS}/page${route.replace(/\//g, "-")}.png`,
      fullPage: true,
    });
  });
}

const POPUPS: {
  name: string;
  route: string;
  open: (page: Page) => Promise<void>;
  submit: (page: Page) => Locator;
}[] = [
  {
    name: "new-job",
    route: "/dashboard/myjobs",
    open: (page) => page.getByRole("button", { name: /new job/i }).click(),
    submit: (page) => page.getByTestId("save-job-btn"),
  },
  {
    name: "new-task",
    route: "/dashboard/tasks",
    open: (page) => page.getByTestId("add-task-btn").click({ force: true }),
    submit: (page) => page.getByTestId("save-task-btn"),
  },
  {
    name: "new-contact",
    route: "/dashboard/networking",
    open: (page) => page.getByTestId("add-contact-btn").click(),
    submit: (page) => page.getByRole("button", { name: /^save$/i }),
  },
  {
    name: "log-interaction",
    route: "/dashboard/networking",
    open: (page) => page.getByTestId("log-interaction-btn").click(),
    submit: (page) => page.getByRole("button", { name: /^save$/i }),
  },
];

for (const popup of POPUPS) {
  test(`${popup.name} popup fits the screen and its submit button is reachable`, async ({
    page,
  }) => {
    await page.goto(popup.route);
    await page.waitForLoadState("networkidle");
    await popup.open(page);

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await expectFitsViewport(page, dialog);
    await page.screenshot({ path: `${SHOTS}/popup-${popup.name}.png` });
    await expectSubmitReachable(popup.submit(page));
    await page.screenshot({ path: `${SHOTS}/popup-${popup.name}-bottom.png` });
  });
}

test("the AI chat panel covers the screen and keeps its input on screen", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /assistant|chat/i }).first().click();
  const panel = page.getByRole("dialog").first();
  await expect(panel).toBeVisible();
  await expectFitsViewport(page, panel);
  await expectNoSideScroll(page);
  await page.screenshot({ path: `${SHOTS}/popup-agent-chat.png` });
});
