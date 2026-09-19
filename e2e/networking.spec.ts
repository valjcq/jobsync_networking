import { type Locator, type Page } from "@playwright/test";
import {
  test,
  expect,
  uniqueName,
  type CleanupRegistry,
} from "./fixtures";

// Same format as the app's date-fns "PP", so the assertions compare what the
// page renders for a date-only value.
const formatDay = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const today = () => formatDay(new Date());

async function openNetworking(page: Page) {
  await page.goto("/dashboard/networking");
  await expect(page.getByTestId("log-interaction-btn")).toBeVisible();
}

// Picks an entry in a "search or create" combobox. `creatable` boxes offer
// "Create: <value>" for a new name; the others only match what already exists.
async function choose(
  page: Page,
  scope: Locator | Page,
  label: string,
  placeholder: string,
  value: string,
) {
  await scope.getByLabel(label, { exact: true }).click();
  const input = page.getByPlaceholder(placeholder);
  await input.fill(value);
  const createOption = page.getByText(`Create: ${value}`);
  const existingOption = page.getByRole("option", { name: value, exact: true });
  await expect(createOption.or(existingOption).first()).toBeVisible();
  if (await existingOption.isVisible()) {
    await existingOption.click();
  } else {
    await createOption.click();
  }
  await expect(input).not.toBeVisible({ timeout: 15000 });
}

// The People panel's own "New Contact" opens the same dialog as the Library.
async function createContact(page: Page, cleanup: CleanupRegistry, name: string) {
  await page.getByTestId("add-contact-btn").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add Contact" })).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
  cleanup.contact(name);
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByTestId("networking-contacts").getByText(name),
  ).toBeVisible();
}

// Fills the Log Interaction dialog. The date defaults to today; a next step
// date is picked from the calendar as today, which is already "due".
async function logInteraction(
  page: Page,
  cleanup: CleanupRegistry,
  options: {
    contact: string;
    purpose: string;
    outcome?: string;
    nextStep?: string;
  },
) {
  await page.getByTestId("log-interaction-btn").click();
  const dialog = page.getByRole("dialog", { name: "Log Interaction" });
  await expect(dialog).toBeVisible();

  await choose(page, dialog, "Contact", "Search contact", options.contact);
  await choose(page, dialog, "Purpose", "Create or Search purpose", options.purpose);
  cleanup.interactionPurpose(options.purpose);

  if (options.outcome) {
    await dialog.getByLabel("Outcome").fill(options.outcome);
  }
  if (options.nextStep) {
    await dialog.getByLabel("Next step", { exact: true }).fill(options.nextStep);
    await dialog.getByLabel("Next step date").click();
    await page.getByRole("button", { name: /^Today/ }).click();
  }

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
}

function timelineRow(page: Page, text: string) {
  return page
    .getByTestId("interactions-timeline")
    .getByRole("listitem")
    .filter({ hasText: text });
}

test.describe("Networking", () => {
  test("logs an interaction and updates the person's last contacted date", async ({
    page,
    cleanup,
  }) => {
    const name = uniqueName("Priya Nair");
    const purpose = uniqueName("Portfolio Review");
    const outcome = uniqueName("Liked the case study");

    await openNetworking(page);
    await createContact(page, cleanup, name);

    const person = page
      .getByTestId("networking-contacts")
      .getByRole("button", { name: new RegExp(name) });
    await expect(person).toContainText("Last contacted never");

    await logInteraction(page, cleanup, { contact: name, purpose, outcome });

    const row = timelineRow(page, outcome);
    await expect(row).toBeVisible();
    await expect(row).toContainText(purpose);
    await expect(row).toContainText(name);
    await expect(person).toContainText(`Last contacted ${today()}`);

    // The Library shows the same value the Networking page just set
    await page.goto("/dashboard/admin?tab=contacts");
    await page.getByPlaceholder("Search contacts...").fill(name);
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
      today(),
    );
  });

  test("shows a due next step under follow-ups until it is marked done", async ({
    page,
    cleanup,
  }) => {
    const name = uniqueName("Marcus Bell");
    const purpose = uniqueName("Referral Ask");
    const step = uniqueName("Send my CV");

    await openNetworking(page);
    await createContact(page, cleanup, name);
    await logInteraction(page, cleanup, {
      contact: name,
      purpose,
      outcome: "Agreed to pass it on",
      nextStep: step,
    });

    const card = page.getByTestId("follow-ups-card");
    await expect(card).toContainText(step);
    await expect(card).toContainText(name);
    await expect(
      page.getByTestId("networking-contacts").getByRole("button", { name: new RegExp(name) }),
    ).toContainText("1 open");

    await card.getByRole("button", { name: "Done" }).click();

    await expect(card).not.toContainText(step);
    const row = timelineRow(page, step);
    await expect(row).toContainText("Done");
    await expect(row.getByRole("button", { name: "Reopen" })).toBeVisible();

    // Reopening puts it back on the list
    await row.getByRole("button", { name: "Reopen" }).click();
    await expect(card).toContainText(step);
  });

  test("moves an interaction to another contact", async ({ page, cleanup }) => {
    const first = uniqueName("Ines Moreau");
    const second = uniqueName("Tomas Berg");
    const purpose = uniqueName("Advice Chat");
    const outcome = uniqueName("Gave interview tips");

    await openNetworking(page);
    await createContact(page, cleanup, first);
    await createContact(page, cleanup, second);
    await logInteraction(page, cleanup, { contact: first, purpose, outcome });

    const people = page.getByTestId("networking-contacts");
    await expect(
      people.getByRole("button", { name: new RegExp(first) }),
    ).toContainText(`Last contacted ${today()}`);

    await timelineRow(page, outcome)
      .getByRole("button", { name: "Edit interaction" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit Interaction" });
    await choose(page, dialog, "Contact", "Search contact", second);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    // The edit is a removal from the first person and a log for the second
    await expect(
      people.getByRole("button", { name: new RegExp(second) }),
    ).toContainText(`Last contacted ${today()}`);
    await expect(
      people.getByRole("button", { name: new RegExp(first) }),
    ).toContainText("Last contacted never");
  });

  test("refuses to delete a purpose that is in use", async ({ page, cleanup }) => {
    const name = uniqueName("Sana Qureshi");
    const purpose = uniqueName("Warm Intro");

    await openNetworking(page);
    await createContact(page, cleanup, name);
    await logInteraction(page, cleanup, {
      contact: name,
      purpose,
      outcome: "Introduced me",
    });

    await page.getByRole("button", { name: "Purposes", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Purposes" });
    await expect(dialog).toContainText(purpose);
    await dialog.getByRole("button", { name: `Delete ${purpose}` }).click();

    await expect(
      page.getByText(/cannot be deleted due to 1 interaction/),
    ).toBeVisible();
    await expect(dialog).toContainText(purpose);
  });

  test("warns about logged interactions when deleting a contact", async ({
    page,
    cleanup,
  }) => {
    const name = uniqueName("Owen Fraser");
    const purpose = uniqueName("Coffee Meetup");

    await openNetworking(page);
    await createContact(page, cleanup, name);
    await logInteraction(page, cleanup, {
      contact: name,
      purpose,
      outcome: "Met downtown",
    });

    await page.goto("/dashboard/admin?tab=contacts");
    await page.getByPlaceholder("Search contacts...").fill(name);
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "Toggle menu" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect(
      page.getByText("1 logged interaction will be deleted too."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);

    // The interaction went with the contact
    await openNetworking(page);
    await expect(timelineRow(page, "Met downtown")).toHaveCount(0);
  });
});
