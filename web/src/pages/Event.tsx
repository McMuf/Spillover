import { Link, useParams } from "react-router-dom";
import { BackButton, Card } from "../components/ui";
import { Ready, Row } from "../components/Ready";
import { findClaim, findEvent } from "../lib/data";
import { pct } from "../lib/format";

export default function EventPage() {
  const { id } = useParams();
  return (
    <Ready>
      {(site) => {
        const ev = findEvent(site, id);
        if (!ev) return <p>No event named <code className="font-mono">{id}</code>. <Link className="underline" to="/">Back</Link>.</p>;
        return (
          <div className="space-y-6">
            <BackButton to="/feed" label="Back to the feed" />
            <header>
              <p className="font-mono text-xs text-muted">{ev.event_id}</p>
              <h1 className="mt-2 text-[28px] font-extrabold leading-tight">{ev.event_type.replace(/_/g, " ").toLowerCase()} on {ev.date}</h1>
            </header>

            <Card title="Extracted structure" id="structure">
              <dl>
                <Row label="Event type"><span className="font-mono text-xs">{ev.event_type}</span></Row>
                <Row label="Entities">{ev.entities.join(", ")}</Row>
                <Row label="Date">{ev.date}</Row>
                <Row label="Source">{ev.source}</Row>
                <Row label="Scheduled event">{ev.scheduled ? "yes" : "no"}</Row>
                <Row label="Extractor">none: events are supplied directly (no headline extractor yet)</Row>
              </dl>
            </Card>

            <section aria-labelledby="claims-h">
              <h2 id="claims-h" className="mb-2 text-[22px] font-extrabold">Claims that use this event</h2>
              <p className="mb-3 text-xs text-muted">
                One event can feed several claims, and readers should see them side by side. Values are backtest statistics, not forward outcomes.
              </p>
              <ul className="space-y-2">
                {ev.claims.map((c) => {
                  const claim = findClaim(site, c.claim_id)?.claim;
                  return (
                    <li key={c.claim_id} className="rounded-2xl bg-surface p-4 text-sm">
                      <Link className="font-mono text-xs underline" to={`/claims/${c.claim_id}`}>{c.claim_id}</Link>
                      {claim && <p className="mt-1">{claim.statement.replace(/\s+/g, " ").trim()}</p>}
                      <p className="mt-1 text-xs text-muted">
                        {c.effective ? `Statistic ${pct(c.value)}` : "Not counted: dropped by the history, overlap or scheduled-event rules"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        );
      }}
    </Ready>
  );
}
