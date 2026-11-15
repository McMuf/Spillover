import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { ThemeProvider } from "./components/ThemeContext";
import { SiteProvider } from "./lib/data";
import ClaimPage from "./pages/Claim";
import EventPage from "./pages/Event";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ScoreboardPage from "./pages/Scoreboard";

// The submit form pulls in the schema validator and YAML parser, so it loads on demand.
const SubmitPage = lazy(() => import("./pages/Submit"));

// Hash routing keeps the static build working on any path with no server rewrite rules.
export default function App() {
  return (
    <ThemeProvider>
      <SiteProvider>
        <HashRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="claims/:id" element={<ClaimPage />} />
              <Route path="events/:id" element={<EventPage />} />
              <Route path="scoreboard" element={<ScoreboardPage />} />
              <Route path="submit" element={<Suspense fallback={<p className="text-muted">Loading form…</p>}><SubmitPage /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </SiteProvider>
    </ThemeProvider>
  );
}
