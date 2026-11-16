import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { SiteProvider } from "./lib/data";
import ClaimPage from "./pages/Claim";
import EmbedClaim from "./pages/Embed";
import EventPage from "./pages/Event";
import ExplorePage from "./pages/Explore";
import FeedPage from "./pages/Feed";
import Home from "./pages/Home";
import Method from "./pages/Method";
import NotFound from "./pages/NotFound";
import ScoreboardPage from "./pages/Scoreboard";

// The submit form pulls in the schema validator and YAML parser, so it loads on demand.
const SubmitPage = lazy(() => import("./pages/Submit"));

// Hash routing keeps the static build working on any path with no server rewrite rules.
export default function App() {
  return (
    <SiteProvider>
        <HashRouter>
          <Routes>
            {/* Outside the shell on purpose: no header or footer, so it can be framed elsewhere. */}
            <Route path="embed/claims/:id" element={<EmbedClaim />} />
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="claims/:id" element={<ClaimPage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="events/:id" element={<EventPage />} />
              <Route path="scoreboard" element={<ScoreboardPage />} />
              <Route path="method" element={<Method />} />
              <Route path="submit" element={<Suspense fallback={<p className="text-muted">Loading form…</p>}><SubmitPage /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
    </SiteProvider>
  );
}
