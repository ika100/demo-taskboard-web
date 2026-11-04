import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

test("AC-001.2 the root page shows the Tasks heading and the add-task form @smoke", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Add a task" })).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
});
