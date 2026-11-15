import { expect, test } from "@playwright/test";

test("loads the site, opens a claim and the six-shape legend renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The production build ships a Content-Security-Policy; any violation is a broken feature.
  page.on("console", (m) => {
    if (/content security policy|refused to (load|apply|execute|connect)/i.test(m.text())) errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Freeze the call");
  await expect(page.getByTestId("synthetic-banner")).toBeVisible();

  const legend = page.getByTestId("node-legend");
  await expect(legend).toBeVisible();
  for (const tag of ["EVT", "ENT", "INS", "FAC", "CON", "PRD"]) {
    await expect(legend.getByText(tag, { exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: /On FOMC decision days/ }).first().click();
  await expect(page).toHaveURL(/#\/claims\/clm_fomc_abs_move_spx_v1$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FOMC");
  await expect(page.getByTestId("node-legend")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();

  // Evidence tab: the chart, with its table alternative one click away.
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(page.getByTestId("event-window-chart")).toBeVisible();
  await page.getByRole("button", { name: "table", exact: true }).click();
  await expect(page.getByRole("table", { name: /Mean abnormal path/ })).toBeVisible();

  // Challenge tab: structured lanes, with pull-request links pre-filled from the templates.
  await page.getByRole("tab", { name: /Challenge/ }).click();
  await expect(page.getByRole("heading", { name: /Challenges \(0\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Replications \(0\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Propose a replication (pull request)" })).toHaveAttribute(
    "href",
    /github\.com\/McMuf\/Spillover\/new\/main\/replications\?filename=rep_REPLACE_ME_v1\.yaml/,
  );
  // Registered claims are open to challenge, so the "draft" notice must not appear.
  await expect(page.getByRole("note").filter({ hasText: "This claim is a draft" })).toHaveCount(0);

  // Forward log is honest about being empty; nothing is backfilled.
  await page.getByRole("tab", { name: /Forward log/ }).click();
  await expect(page.getByText("Nothing here is backfilled.")).toBeVisible();

  expect(errors).toEqual([]);
});

test("submit form validates live and the scoreboard states what is missing", async ({ page }) => {
  await page.goto("/#/submit");
  await expect(page.getByRole("status").filter({ hasText: /placeholder|must|REPLACE_ME/i })).toBeVisible();

  await page.getByLabel("Claim id").fill("clm_demo_v1");
  await page.getByLabel(/Statement/).fill("After a headline, the stock falls by more than the market explains.");
  await page.getByLabel("Event type").fill("DEMO_EVENT");
  await page.getByLabel(/Trigger entities/).fill("ABC");
  await page.getByLabel("Instrument symbol").fill("ABC");
  await page.getByLabel(/What would prove me wrong/).fill("The interval includes zero after eight forward events.");
  await page.getByLabel("Your GitHub handle").fill("someone");
  await expect(page.getByText("Valid against the claim schema.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pull request on GitHub" })).toHaveAttribute(
    "href",
    /github\.com\/McMuf\/Spillover\/new\/main\/claims\?filename=clm_demo_v1\.yaml/,
  );

  await page.goto("/#/scoreboard");
  // The seed claims are registered, so they are listed, with nothing graded yet.
  const table = page.getByRole("table", { name: "Scoreboard by claim" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3); // header + two claims
  await expect(table.getByText("Proposed")).toHaveCount(2);
  await expect(table.getByText("0 of 8")).toHaveCount(2);
  await expect(page.getByText("No placebo claim has shown a significant result.")).toBeVisible();
});
