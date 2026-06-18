import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("grc_token"));

// Global 401 interceptor — when any API call returns Unauthorized, clear the
// session and reload so the login screen appears instead of silently failing.
const _origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    // Only intercept calls to our own API, not external URLs
    if (url.includes("/api/") && !url.includes("/api/auth/login")) {
      localStorage.removeItem("grc_token");
      localStorage.removeItem("grc_user_name");
      localStorage.removeItem("grc_demo_role");
      localStorage.removeItem("grc_view_tenant");
      window.location.reload();
    }
  }
  return res;
};

createRoot(document.getElementById("root")!).render(<App />);
