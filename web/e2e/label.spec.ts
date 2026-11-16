import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HEADLINES = [
  { headline_id: "h1", title: "SEC charges Coinbase with operating an unregistered exchange", source: "sec-press", url: "https://www.sec.gov/x", published_at: "2026-11-16T12:00:00Z" },
  { headline_id: "h2", title: "Federal Reserve announces revised meeting schedule", source: "fed-press", url: "https://www.federalreserve.gov/x", published_at: "2026-11-15T12:00:00Z" },
];

test.beforeEach(async ({ page }) => {
  // Serve the real site data with a few headlines to label (the local store has none yet).
  await page.route("**/data/site.json", async (route) => {
    const res = await route.fetch();
    const site = (await res.json()) as { labeling: { candidates: unknown[] } };
    site.labeling.candidates = HEADLINES;
    await route.fulfill({ response: res, json: site });
  });
});

test("label headlines blind and download exactly the file the engine reads", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text())) csp.push(m.text());
  });
  await page.goto("/#/label");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help measure the labeler");
  const download = page.getByRole("button", { name: "Download gold.jsonl" });
  await expect(download).toBeDisabled();

  const first = page.getByRole("listitem").filter({ hasText: "SEC charges Coinbase" });
  await first.getByLabel("What happened").selectOption("REGULATORY_ACTION");
  await first.getByLabel(/Company tickers/).fill("coin, <b>");
  await expect(first.getByText("Not a ticker: <B>")).toBeVisible();
  await first.getByLabel(/Company tickers/).fill("coin");

  const second = page.getByRole("listitem").filter({ hasText: "revised meeting schedule" });
  await second.getByLabel("What happened").selectOption("NONE");
  await expect(second.getByLabel(/Company tickers/)).toBeDisabled();

  await expect(page.getByText(/2 new labels this session/)).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  const text = readFileSync((await file.path()) ?? "", "utf8");
  expect(text).toBe(
    '{"title":"SEC charges Coinbase with operating an unregistered exchange","source":"sec-press","expected_type":"REGULATORY_ACTION","expected_entities":["COIN"]}\n' +
      '{"title":"Federal Reserve announces revised meeting schedule","source":"fed-press","expected_type":"NONE","expected_entities":[]}\n',
  );

  // Answers survive a reload in this browser.
  await page.reload();
  await expect(page.getByText(/2 new labels this session/)).toBeVisible();
  expect(csp).toEqual([]);
});

test("the labeling page with headlines has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/#/label");
  await expect(page.getByRole("listitem").first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
