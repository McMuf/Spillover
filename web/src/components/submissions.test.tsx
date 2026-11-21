import { render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ChallengeOut, ReplicationOut } from "../generated/site";
import { ChallengeList, ReplicationList } from "./Submissions";

// Names link to profile pages, so the lists render inside a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const challenge: ChallengeOut = {
  id: "chl_demo_v1",
  aspect: "baseline",
  argument: "Three of these dates share a scheduled event.\nThat inflates n.",
  evidence: [
    { kind: "link", ref: "https://example.org/analysis", note: "the dates" },
    { kind: "replication", ref: "rep_demo_v1", note: "" },
  ],
  submitted_by: "someone",
  submitted_at: "2026-01-05T12:00:00+00:00",
};

const replication = (result: ReplicationOut["result"]): ReplicationOut => ({
  id: "rep_demo_v1",
  rationale: "A longer window tests whether the effect fades.",
  changes: { window_end: "+3_trading_days", instrument: "XLF (us_equity)" },
  submitted_by: "someone",
  submitted_at: null,
  result,
});

describe("ChallengeList", () => {
  it("shows the argument, who and when, and the evidence", () => {
    render(<ChallengeList items={[challenge]} />);
    expect(screen.getByText(/Challenges the baseline/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "someone" })).toHaveAttribute("href", "/people/someone");
    expect(screen.getByText(/on 2026-01-05/)).toBeInTheDocument();
    expect(screen.getByText(/That inflates n/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://example.org/analysis" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("rep_demo_v1")).toBeInTheDocument();
  });

  it("only turns https evidence into links", () => {
    const hostile: ChallengeOut = { ...challenge, evidence: [{ kind: "replication", ref: "javascript:alert(1)", note: "" }] };
    render(<ChallengeList items={[hostile]} />);
    // A replication ref is shown as text, never as a link (the only link is the author's profile).
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/people/someone"]);
  });

  it("says a challenge awaits registration until CI stamps it", () => {
    render(<ChallengeList items={[{ ...challenge, submitted_at: null }]} />);
    expect(screen.getByText(/awaiting registration/)).toBeInTheDocument();
  });
});

describe("ReplicationList", () => {
  it("lists the named changes and labels a generated result as a backtest", () => {
    render(
      <ReplicationList
        items={[
          replication({
            n_matched: 40, n_effective: 36, min_events: 8, mean: -0.0123, ci_lo: -0.02, ci_hi: -0.004,
            p_value: 0.004, verdict: "Consistent with the claim in sample", as_of: "2025-12-26", data_synthetic: true,
          }),
        ]}
      />,
    );
    const article = screen.getByRole("article");
    expect(within(article).getByText("+3_trading_days")).toBeInTheDocument();
    expect(within(article).getByText(/Backtest result/)).toBeInTheDocument();
    expect(within(article).getByText(/computed by the engine/)).toBeInTheDocument();
    expect(within(article).getByText(/on synthetic data/)).toBeInTheDocument();
    expect(within(article).getByText(/−1.23%/)).toBeInTheDocument();
    expect(within(article).getByText(/over 36 of 40 matched events/)).toBeInTheDocument();
  });

  it("says plainly when there is no result yet", () => {
    render(<ReplicationList items={[replication(null)]} />);
    expect(screen.getByText(/No result yet/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting registration/)).toBeInTheDocument();
  });
});
