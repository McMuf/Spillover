import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Live headlines come from GDELT while a page is open; tests use the site data only, so they never
// depend on today's news or on GDELT being reachable.
test.beforeEach(async ({ page }) => {
  await page.route("https://api.gdeltproject.org/**", (route) => route.abort());
});


test("loads the site, opens a claim and reads its chain", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The production build ships a Content-Security-Policy; any violation is a broken feature.
  page.on("console", (m) => {
    if (/content security policy|refused to (load|apply|execute|connect)/i.test(m.text())) errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Spillover tests it in public");
  await expect(page.getByTestId("synthetic-banner")).toBeVisible();


  await page.getByRole("link", { name: /Fed rate decisions make the S&P 500 swing/ }).first().click();
  await expect(page).toHaveURL(/#\/claims\/clm_fomc_abs_move_spx_v1$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("S&P 500");
  await expect(page.getByText(/On FOMC decision days, the S&P 500/).first()).toBeVisible();
  // The claim reads as a labeled chain; every step names its node type, so no legend is needed.
  const path = page.getByTestId("spillover-path");
  await expect(path).toBeVisible();
  for (const role of ["Who", "What happens", "Which market", "Measured against", "Rules applied", "Frozen predictions"]) {
    await expect(path.getByText(role, { exact: false }).first()).toBeVisible();
  }
  for (const tag of ["ENT", "EVT", "INS", "FAC", "CON", "PRD"]) {
    await expect(path.getByText(`· ${tag}`)).toBeVisible();
  }
  await expect(path.getByText("S&P 500").first()).toBeVisible();

  // Evidence tab: the chart, with its table alternative one click away.
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(page.getByTestId("event-window-chart")).toBeVisible();
  await page.getByRole("button", { name: "table", exact: true }).click();
  await expect(page.getByRole("table", { name: /Mean abnormal path/ })).toBeVisible();

  // Challenge tab: structured lanes, with pull-request links pre-filled from the templates.
  await page.getByRole("tab", { name: /Opposite sides/ }).click();
  await expect(page.getByRole("heading", { name: /Challenges \(0\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Replications \(0\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Propose a replication (pull request)" })).toHaveAttribute(
    "href",
    /github\.com\/McMuf\/Spillover\/new\/main\/replications\?filename=rep_REPLACE_ME_v1\.yaml/,
  );
  // Registered claims are open to challenge, so the "draft" notice must not appear.
  await expect(page.getByRole("note").filter({ hasText: "This claim is a draft" })).toHaveCount(0);

  // Forward log: real frozen predictions once the ledger has them; nothing is backfilled.
  await page.getByRole("tab", { name: /Forward log/ }).click();
  // Either the frozen predictions (with hashes) or the honest empty state; never invented rows.
  await expect(
    page.getByRole("region", { name: "Frozen forward predictions (scrollable)" }).or(page.getByText("Nothing here is backfilled.")),
  ).toBeVisible();

  expect(errors).toEqual([]);
});

test("submit form validates live and the scoreboard states what is missing", async ({ page }) => {
  await page.goto("/#/submit");
  await expect(page.getByRole("status").filter({ hasText: /placeholder|must|REPLACE_ME/i })).toBeVisible();

  await page.getByLabel("Claim id").fill("clm_demo_v1");
  await page.getByLabel(/Statement/).fill("After a headline, the stock falls by more than the market explains.");
  await page.getByLabel(/Event type/).selectOption("FOMC_DECISION");
  await page.getByLabel(/Trigger entities/).fill("ABC");
  await page.getByLabel("Instrument symbol").fill("ABC");
  await page.getByLabel(/What would prove me wrong/).fill("The interval includes zero after eight forward events.");
  await page.getByLabel("Your GitHub handle").fill("someone");
  await expect(page.getByText("Valid against the claim schema.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pull request on GitHub" })).toHaveAttribute(
    "href",
    /github\.com\/McMuf\/Spillover\/new\/main\/claims\?filename=clm_demo_v1\.yaml/,
  );

  // Every registered claim is listed with nothing graded yet. The count comes from the site data,
  // so registering a new claim never breaks this test.
  const site = (await (await page.request.get("/data/site.json")).json()) as {
    scoreboard: { claims: { effective_events: number }[] };
  };
  const registered = site.scoreboard.claims.length;
  expect(registered).toBeGreaterThanOrEqual(3);
  await page.goto("/#/scoreboard");
  const table = page.getByRole("table", { name: "Scoreboard by claim" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(registered + 1); // + header
  await expect(table.getByText("Proposed")).toHaveCount(registered);
  await expect(table.getByText("0 of 8")).toHaveCount(registered);
  await expect(page.getByText("No placebo claim has shown a significant result.")).toBeVisible();
});

test("the claim form guides a one-off idea and fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/submit");
  await expect(page.getByRole("heading", { name: "From a news story to a claim" })).toBeVisible();
  await page.getByLabel(/Statement/).fill("All flights were grounded today, so airline stocks will fall.");
  await expect(page.getByText(/sounds like one specific event/)).toBeVisible();
  await page.getByLabel(/Event type/).selectOption("FOMC_DECISION");
  await expect(page.getByText(/past events in the data/)).toBeVisible();
  await page.getByLabel("Instrument symbol").fill("NOT_PRICED");
  await expect(page.getByText(/NOT_PRICED is not priced yet/)).toBeVisible();
  await expect(page.getByTestId("plain-sentence")).toContainText("When the Federal Reserve announces");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("news opens a story with its four tabs, and an untested kind of event leads to the claim form", async ({ page }) => {
  await page.goto("/#/feed"); // the old address still works
  await expect(page).toHaveURL(/#\/news$/);
  await expect(page.getByRole("heading", { level: 1, name: "News" })).toBeVisible();
  await page.getByRole("button", { name: /On the record/ }).click();
  await page.getByRole("main").getByRole("listitem").getByRole("link").first().click();
  for (const tab of ["About", "Market implications", "Stakeholders", "Data"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  }
  await page.getByRole("tab", { name: "About" }).click();
  await expect(page.getByText("Spillover links to sources and never copies articles.")).toBeVisible();
});

test("a story with no claim offers to start one with its event type chosen", async ({ page }) => {
  await page.route("**/data/site.json", async (route) => {
    const res = await route.fetch();
    const site = (await res.json()) as { news: unknown[] };
    site.news = [
      {
        event_id: "cyber_incident_2026-11-17_ab12cd34",
        event_type: "CYBER_INCIDENT",
        origin: "filings",
        date: "2026-11-17",
        entities: ["ACAIR"],
        scheduled: false,
        sources: [{ title: "Acme Air Inc (ACAIR) 8-K Item 1.05: Material Cybersecurity Incidents", url: "https://www.sec.gov/x", source: "sec-8k", published_at: "2026-11-17T21:30:00Z" }],
        claim_ids: [],
      },
    ];
    await route.fulfill({ response: res, json: site });
  });
  await page.goto("/#/events/cyber_incident_2026-11-17_ab12cd34");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Acme Air Inc/);
  await page.getByRole("tab", { name: "Market implications" }).click();
  await page.getByRole("link", { name: "Write a claim about events like this" }).click();
  await expect(page.getByLabel(/Event type/)).toHaveValue("CYBER_INCIDENT");
});

test("latest headlines link out safely, tag testable ones, and switch to the record", async ({ page }) => {
  await page.route("**/data/site.json", async (route) => {
    const res = await route.fetch();
    const site = (await res.json()) as { headlines: unknown[] };
    site.headlines = [
      { headline_id: "gdelt-1", title: "SEC charges Coinbase with operating an unregistered exchange", url: "https://x.example/1", domain: "x.example", seen_at: "2026-11-18T01:15:00Z", event_type: "REGULATORY_ACTION", entities: ["COIN"], confidence: "high" },
      { headline_id: "gdelt-2", title: "Analyst reacts to widespread tech issues", url: "https://y.example/2", domain: "y.example", seen_at: "2026-11-18T01:00:00Z", event_type: "NONE", entities: [], confidence: "medium" },
    ];
    await route.fulfill({ response: res, json: site });
  });
  await page.goto("/#/news");
  const first = page.getByRole("link", { name: /SEC charges Coinbase/ });
  await expect(first).toHaveAttribute("href", "https://x.example/1");
  await expect(first).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText("Testable", { exact: true })).toHaveCount(1);
  await expect(page.getByText("GDELT Project").first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: /On the record/ }).click();
  await expect(page.getByText(/Events in the record/)).toBeVisible();
});

test("a claim's author links to a profile with their claims and track record", async ({ page }) => {
  await page.goto("/#/claims/clm_fomc_abs_move_spx_v1");
  await page.getByRole("link", { name: "McMuf" }).first().click();
  await expect(page).toHaveURL(/#\/people\/McMuf$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("McMuf");
  await expect(page.getByRole("heading", { name: "Track record" })).toBeVisible();
  await expect(page.getByText("No verdicts yet.", { exact: false })).toBeVisible();
  await page.goto("/#/people/no-such-person");
  await expect(page.getByText(/has anything on the record/)).toBeVisible();
});

test("a swing-size claim is green when bigger and says so in words", async ({ page }) => {
  await page.goto("/#/claims/clm_fomc_abs_move_spx_v1");
  const summary = page.getByRole("complementary", { name: "Claim summary" });
  await expect(summary.getByText(/(bigger|smaller) swing than usual/)).toBeVisible();
  const big = summary.getByTestId("claim-number");
  const words = (await summary.getByText(/(bigger|smaller) swing than usual/).first().textContent()) ?? "";
  await expect(big).toHaveClass(words.includes("bigger") ? /text-positive/ : /text-negative/);
});
