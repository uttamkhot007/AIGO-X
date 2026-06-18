import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Wizard from "./Wizard";
import "./index.css";

// Route to the Setup Wizard when the URL contains ?mode=wizard
// This is triggered automatically when the agent is run with no subcommand
// (double-click on Windows) or with the `wizard` subcommand.
const isWizardMode = new URLSearchParams(window.location.search).get("mode") === "wizard";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWizardMode ? <Wizard /> : <App />}
  </StrictMode>,
);
