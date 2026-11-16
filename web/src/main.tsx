import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme } from "./design/theme";
import "@fontsource-variable/inter";
import "./index.css";

// Set the colors before the first render so there is no flash of unstyled content.
applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
