import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { discussionsEnabled, discussionTerm, GISCUS, type GiscusConfig } from "../lib/community";
import { Discussion } from "./Discussion";

vi.mock("@giscus/react", () => ({
  default: (props: { term: string; mapping: string; strict: string }) => (
    <div data-testid="giscus" data-term={props.term} data-mapping={props.mapping} data-strict={props.strict} />
  ),
}));

const ON: GiscusConfig = { ...GISCUS, categoryId: "DIC_kwDOabcdef12" };

describe("discussion threads", () => {
  it("stay hidden until a maintainer sets the category", () => {
    expect(discussionsEnabled(GISCUS)).toBe(GISCUS.categoryId !== "");
    const { container } = render(<Discussion term="claim:x" label="claim" config={{ ...GISCUS, categoryId: "" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("load nothing from giscus until someone opens them, then use one exact thread per claim", async () => {
    render(<Discussion term={discussionTerm("claim", "clm_a_v1")} label="claim" config={ON} />);
    expect(screen.queryByTestId("giscus")).toBeNull();
    expect(screen.getByText(/Discussion never changes a result/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show discussion" }));
    const widget = await screen.findByTestId("giscus");
    expect(widget.dataset).toMatchObject({ term: "claim:clm_a_v1", mapping: "specific", strict: "1" });
  });
});
