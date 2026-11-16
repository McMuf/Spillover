import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated WCAG 2.x A/AA audit of every page, (the app is dark only). Automated checks catch roughly a
// third of accessibility problems, so this is a floor, not a substitute for manual review.
const PAGES = [
  ["claims", "/#/"],
  ["claim overview", "/#/claims/clm_fomc_abs_move_spx_v1"],
  ["explore", "/#/explore"],
  ["feed", "/#/feed"],
  ["label", "/#/label"],
  ["event", "/#/events/fomc_2025-12-17"],
  ["scoreboard", "/#/scoreboard"],
  ["method", "/#/method"],
  ["embed card", "/#/embed/claims/clm_fomc_abs_move_spx_v1"],
  ["submit", "/#/submit"],
] as const;

{
  test.describe("dark theme", () => {

    for (const [name, path] of PAGES) {
      test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
        const csp: string[] = [];
        page.on("console", (m) => {
          if (/content security policy|refused to (load|apply|execute|connect)/i.test(m.text())) csp.push(m.text());
        });
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        await page.waitForTimeout(400); // let lazy chunks and the graph settle
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
        expect(summary, summary.join("\n")).toEqual([]);
        expect(csp, "Content-Security-Policy violations").toEqual([]);
      });
    }

    test("claim challenge tab has no violations", async ({ page }) => {
      await page.goto("/#/claims/clm_fomc_abs_move_spx_v1");
      await page.getByRole("tab", { name: /Opposite sides/ }).click();
      await expect(page.getByRole("heading", { name: /Challenges/ })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      expect(summary, summary.join("\n")).toEqual([]);
    });

    test("claim evidence tab (chart) has no violations", async ({ page }) => {
      await page.goto("/#/claims/clm_fomc_abs_move_spx_v1");
      await page.getByRole("tab", { name: "Evidence" }).click();
      await expect(page.getByTestId("event-window-chart")).toBeVisible();
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  });
}
