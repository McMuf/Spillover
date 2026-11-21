import { ColorType, createChart, LastPriceAnimationMode, LineSeries, LineStyle } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { color } from "../design/tokens";
import type { Chart } from "../generated/site";

const DAY = 86_400;
const BASE = Date.UTC(2000, 0, 3) / 1000;

/** Lightweight Charts needs timestamps; relative trading days are mapped onto consecutive days. */
export function dayToTime(day: number, firstDay: number): UTCTimestamp {
  return (BASE + (day - firstDay) * DAY) as UTCTimestamp;
}

export function timeToDay(time: number, firstDay: number): number {
  return Math.round((time - BASE) / DAY) + firstDay;
}

interface Overlay {
  event: number | null;
  windowFrom: number | null;
  windowTo: number | null;
  estFrom: number | null;
  estTo: number | null;
}

/**
 * Mean abnormal path around events, indexed to 100 at the left edge. The dashed vertical line is
 * the event (day 0); the shaded bands are the estimation window and the event window.
 * A table of the same numbers is always one tab away on the claim page.
 */
export function EventWindowChart({ chart, tone = "neutral" }: { chart: Chart; tone?: "up" | "down" | "neutral" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = chart.days[0] ?? 0;
    const c = color.dark;
    const api = createChart(el, {
      autoSize: true,
      height: 280,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.muted, fontFamily: "inherit" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        tickMarkFormatter: (t: number) => String(timeToDay(t, first)),
      },
      localization: { timeFormatter: (t: number) => `day ${timeToDay(t, first)}` },
      handleScroll: false,
      handleScale: false,
    });

    // Green when the effect is up, red when down, the lime accent when direction does not apply.
    const stroke = { up: c.positive, down: c.negative, neutral: c.accent }[tone];
    const line = (values: number[], opts: { width: 1 | 2; dashed?: boolean; alpha?: string; live?: boolean }) => {
      const s = api.addSeries(LineSeries, {
        color: (opts.dashed ? c.muted : stroke) + (opts.alpha ?? ""),
        lineWidth: opts.width,
        lineStyle: opts.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: !opts.dashed,
        // The pulsing dot on the latest point, as on a live quote.
        lastPriceAnimation: opts.live ? LastPriceAnimationMode.Continuous : LastPriceAnimationMode.Disabled,
      });
      s.setData(chart.days.map((d, i) => ({ time: dayToTime(d, first), value: values[i] ?? 100 })));
      return s;
    };
    line(chart.hi, { width: 1, dashed: true, alpha: "99" });
    line(chart.lo, { width: 1, dashed: true, alpha: "99" });
    const mean = line(chart.mean, { width: 2, live: true });
    mean.createPriceLine({ price: 100, color: c.muted, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "start" });
    api.timeScale().fitContent();

    const place = () => {
      const x = (d: number): number | null => api.timeScale().timeToCoordinate(dayToTime(d, first));
      setOverlay({
        event: x(0),
        windowFrom: x(0),
        windowTo: x(chart.event_window_end),
        estFrom: x(first),
        estTo: x(chart.estimation_end),
      });
    };
    place();
    api.timeScale().subscribeVisibleLogicalRangeChange(place);
    const ro = new ResizeObserver(() => requestAnimationFrame(place));
    ro.observe(el);
    return () => {
      ro.disconnect();
      api.remove();
    };
  }, [chart, tone]);

  const band = (from: number | null, to: number | null, cls: string, label: string) =>
    from !== null && to !== null ? (
      <div
        className={`pointer-events-none absolute top-0 flex h-[250px] items-start justify-center text-[10px] text-muted ${cls}`}
        style={{ left: Math.min(from, to), width: Math.abs(to - from) }}
      >
        <span className="mt-1 whitespace-nowrap bg-surface/80 px-1">{label}</span>
      </div>
    ) : null;

  return (
    <figure>
      <div className="relative" data-testid="event-window-chart">
        {/* A group, not an image: the chart library places focusable elements inside it. */}
        <div ref={ref} role="group" aria-label={`Mean abnormal path around ${chart.n_events} events, indexed to 100. A table of the same numbers is one tab away.`} />
        {overlay && (
          <>
            {band(overlay.estFrom, overlay.estTo, "bg-surface-alt/60", "estimation window")}
            {band(overlay.windowFrom, overlay.windowTo, "bg-fg/[0.06]", "event window")}
            {overlay.event !== null && (
              <div
                className="pointer-events-none absolute top-0 h-[250px] border-l-2 border-dashed border-fg/70"
                style={{ left: overlay.event }}
                aria-hidden="true"
              />
            )}
          </>
        )}
      </div>
      <figcaption className="mt-2 text-xs text-muted">
        Mean cumulative abnormal return over {chart.n_events} events, indexed to 100 at day {chart.days[0]}. Dashed
        vertical line: the event (day 0). Thin dashed lines: 95% band for the mean.
      </figcaption>
    </figure>
  );
}
