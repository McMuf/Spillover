import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Live headlines come from GDELT while a page is open; tests use the site data only, so they never
// depend on today's news or on GDELT being reachable.
test.beforeEach(async ({ page }) => {
  await page.route("https://api.gdeltproject.org/**", (route) => route.abort());
});


// Automated WCAG 2.x A/AA audit of every page, (the app has one light theme). Automated checks catch roughly a
// third of accessibility problems, so this is a floor, not a substitute for manual review.
const PAGES = [
  ["claims", "/#/"],
  ["claim overview", "/#/claims/clm_fomc_abs_move_spx_v1"],
  ["explore", "/#/explore"],
  ["news", "/#/news"],
  ["questions", "/#/questions"],
  ["label", "/#/label"],
  ["event", "/#/events/fomc_2025-12-17"],
  ["scoreboard", "/#/scoreboard"],
  ["method", "/#/method"],
  ["architecture", "/#/architecture"],
  ["embed card", "/#/embed/claims/clm_fomc_abs_move_spx_v1"],
  ["submit", "/#/submit"],
  ["people", "/#/people"],
  ["person", "/#/people/McMuf"],
] as const;

{
  test.describe("light theme", () => {

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

    for (const tab of ["Market implications", "Stakeholders", "Data"]) {
      test(`news story ${tab} tab has no violations`, async ({ page }) => {
        await page.goto("/#/events/fomc_2025-12-17");
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }

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
