import "@fontsource-variable/nunito";
import "@fontsource-variable/dm-sans";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/responsive.css";
import "./styles/production.css";
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
