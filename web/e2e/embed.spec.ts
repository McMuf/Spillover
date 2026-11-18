import { expect, test } from "@playwright/test";

// Live headlines come from GDELT while a page is open; tests use the site data only, so they never
// depend on today's news or on GDELT being reachable.
test.beforeEach(async ({ page }) => {
  await page.route("https://api.gdeltproject.org/**", (route) => route.abort());
});


const CLAIM = "clm_fomc_abs_move_spx_v1";

test("the embed card has no site chrome and keeps the disclaimer and the backtest label", async ({ page }) => {
  await page.goto(`/#/embed/claims/${CLAIM}`);
  const card = page.getByTestId("embed-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("On FOMC decision days");
  await expect(card).toContainText("Backtest");
  await expect(card).toContainText("Research, not investment advice");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  const link = card.getByRole("link", { name: "View on Spillover" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("href", new RegExp(`#/claims/${CLAIM}$`));
});

test("a claim that does not exist says so instead of failing", async ({ page }) => {
  await page.goto("/#/embed/claims/clm_nope_v1");
  await expect(page.getByText("This claim was not found.")).toBeVisible();
});

test("the snippet on the claim page really works when framed", async ({ page }) => {
  await page.goto(`/#/claims/${CLAIM}`);
  await page.getByText("Embed this claim").click();
  const snippet = await page.getByLabel("Embed code").inputValue();
  expect(snippet).toMatch(/^<iframe src="[^"]+#\/embed\/claims\/clm_fomc_abs_move_spx_v1"/);

  // Paste it verbatim into a *different* page, as a blogger would. (Our own site's strict policy
  // forbids frames, so the host must be someone else's page.)
  const host = await page.context().newPage();
  await host.setContent(`<!doctype html><title>blog post</title><h1>My post</h1>${snippet}`);
  const frame = host.frameLocator("iframe");
  await expect(frame.getByTestId("embed-card")).toBeVisible();
  await expect(frame.getByTestId("embed-card")).toContainText("Research, not investment advice");
});

test("the method page explains the numbers", async ({ page }) => {
  await page.goto("/#/method");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("How the numbers are made");
  for (const heading of ["One claim, step by step", "What the statuses mean", "What this cannot tell you", "Glossary", "Reading list"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByText("Nothing on this site is investment advice.")).toBeVisible();
  const legend = page.getByTestId("node-legend");
  for (const tag of ["EVT", "ENT", "INS", "FAC", "CON", "PRD"]) {
    await expect(legend.getByText(tag, { exact: true })).toBeVisible();
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#\/method$/);
});
