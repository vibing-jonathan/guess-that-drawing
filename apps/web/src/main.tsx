import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/barlow-condensed/900.css";
import "@fontsource-variable/work-sans";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/responsive.css";
import "./styles/production.css";
import "./styles/motion.css";
import "./styles/live-comics.css";
import { SetupProvider } from "./ui/setup-context";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing application root.");
}

createRoot(root).render(
  <BrowserRouter>
    <SetupProvider>
      <App />
    </SetupProvider>
  </BrowserRouter>,
);
