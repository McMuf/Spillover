import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, readPreference, resolveTheme } from "./design/theme";
import "./index.css";

// Set the theme variables before the first render so there is no flash of the wrong theme.
applyTheme(resolveTheme(readPreference()));

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
