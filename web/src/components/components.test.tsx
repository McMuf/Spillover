import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CalibrationBin, ForwardRow } from "../generated/site";
import { STATUSES } from "../lib/format";
import { makeClaim, makeSite } from "../test-utils";
import { CalibrationPlot } from "./CalibrationPlot";
import { TrendingCard } from "./TrendingCard";
import { dayToTime, timeToDay } from "./EventWindowChart";
import { EvidenceMeter } from "./EvidenceMeter";
import { ForwardLogTable } from "./ForwardLogTable";
import { histogram } from "./Histogram";
import { InstrumentChip } from "./InstrumentChip";
import { NodeLegend } from "./NodeLegend";
import { StatusBadge } from "./StatusBadge";

const row = (over: Partial<ForwardRow>): ForwardRow => ({
  event_id: "ev",
  event_date: "2026-02-01",
  created_at: "2026-02-01T12:00:00Z",
  sha256: "a".repeat(64),
  status: "open",
  hit: null,
  value: null,
  proof: "none",
  ...over,
});

describe("NodeLegend", () => {
  it("shows all six node types with their tags", () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId("node-legend");
    for (const tag of ["EVT", "ENT", "INS", "FAC", "CON", "PRD"]) {
      expect(within(legend).getByText(tag)).toBeInTheDocument();
    }
    expect(legend).toHaveTextContent(/color never does/i);
  });
});

describe("StatusBadge", () => {
  it.each(STATUSES)("labels %s in text, not just color", (s) => {
    render(<StatusBadge status={s} />);
    expect(screen.getByText(s)).toBeInTheDocument();
  });

  it("uses green and red only for verdicts that came from realized outcomes", () => {
    const cls = (s: (typeof STATUSES)[number]) => render(<StatusBadge status={s} />).container.firstElementChild?.className ?? "";
    expect(cls("Supported")).toContain("positive");
    expect(cls("Not supported")).toContain("negative");
    for (const neutral of ["Draft", "Proposed", "Inconclusive"] as const) {
      const c = cls(neutral);
      expect(c).not.toContain("positive");
      expect(c).not.toContain("negative");
    }
  });
});

describe("EvidenceMeter", () => {
  it("is an accessible progress bar with text", () => {
    render(<EvidenceMeter value={3} max={8} label="Forward events" />);
    const bar = screen.getByRole("progressbar", { name: "Forward events" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
    expect(screen.getByText("3 of 8")).toBeInTheDocument();
  });

  it("never overflows when more events than required arrive", () => {
    render(<EvidenceMeter value={12} max={8} label="Forward events" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");
  });
});

describe("InstrumentChip", () => {
  it("always shows symbol and venue together", () => {
    render(<InstrumentChip instrument={{ venue: "crypto_perp", symbol: "BTC" }} />);
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText(/crypto perp/)).toBeInTheDocument();
  });
});

describe("ForwardLogTable", () => {
  it("explains an empty log instead of showing a bare table", () => {
    render(<ForwardLogTable rows={[]} />);
    expect(screen.getByText(/Nothing here is backfilled/)).toBeInTheDocument();
  });

  it("colors only graded outcomes, and pending ones stay neutral", () => {
    render(
      <ForwardLogTable
        rows={[
          row({ event_id: "hit1", sha256: "1".repeat(64), status: "graded", hit: true, value: -0.012 }),
          row({ event_id: "miss1", sha256: "2".repeat(64), status: "graded", hit: false, value: 0.004 }),
          row({ event_id: "open1", sha256: "3".repeat(64), status: "open" }),
        ]}
      />,
    );
    expect(screen.getByText(/✓ hit/).className).toContain("positive");
    expect(screen.getByText(/✕ miss/).className).toContain("negative");
    const pending = screen.getByText("pending");
    expect(pending.className).not.toMatch(/positive|negative/);
    expect(screen.getAllByText(/…$/)).toHaveLength(3); // hashes are shown shortened, full on hover
  });
});

describe("CalibrationPlot", () => {
  it("says what is missing when no outcome stated a confidence", () => {
    render(<CalibrationPlot bins={[]} />);
    expect(screen.getByText(/No graded outcomes with a stated confidence/)).toBeInTheDocument();
  });

  it("plots bins and gives a table alternative", () => {
    const bins: CalibrationBin[] = [
      { range: [0.9, 1], n: 10, mean_confidence: 0.9, hit_rate: 0.7, hit_rate_ci: [0.4, 0.89] },
    ];
    render(<CalibrationPlot bins={bins} />);
    expect(screen.getByRole("img", { name: /Calibration plot/ })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("70%");
  });
});

describe("TrendingCard", () => {
  it("leads with a plain headline, the plain-English test, the ticker and status", () => {
    const item = makeClaim();
    render(
      <MemoryRouter>
        <TrendingCard item={item} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ABC lags the market/ })).toHaveAttribute("href", "/claims/clm_demo_v1");
    expect(screen.getByText(/we check whether ABC falls/)).toBeInTheDocument();
    expect(screen.getAllByText("ABC").length).toBeGreaterThan(0);
  });

  it("uses no gradients or colored tints: one accent, flat surfaces", () => {
    const { container } = render(
      <MemoryRouter>
        <TrendingCard item={makeClaim()} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).not.toMatch(/gradient|color-mix|positive|negative/);
  });
});

describe("histogram", () => {
  it("bins every value exactly once", () => {
    const values = [-2, -1, -1, 0, 0.5, 1, 3];
    const bins = histogram(values, 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(values.length);
    expect(bins[0]?.from).toBe(-2);
    expect(bins[3]?.to).toBe(3);
  });

  it("handles one value, identical values and nothing", () => {
    expect(histogram([])).toEqual([]);
    expect(histogram([5, 5, 5]).map((b) => b.count)).toEqual([3]);
    expect(histogram([1])[0]?.count).toBe(1);
  });
});

describe("chart time mapping", () => {
  it("round-trips relative trading days through chart timestamps", () => {
    for (const d of [-40, -10, 0, 1, 11]) expect(timeToDay(dayToTime(d, -40), -40)).toBe(d);
    expect(dayToTime(1, -40) - dayToTime(0, -40)).toBe(86_400);
  });
});
