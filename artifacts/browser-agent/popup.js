const RISK_COLORS = { critical: "#dc2626", high: "#d97706", medium: "#6366f1", low: "#10b981" };

function relTime(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
  if (!status) return;

  // Version pill
  document.getElementById("version-pill").textContent = `v${status.version}`;
  document.getElementById("header-sub").textContent   = `${status.browser ?? "Browser"} · ${status.status === "connected" ? "Monitoring active" : "Connecting…"}`;

  // Managed badge
  if (status.managedByPolicy || status.enforced) {
    document.getElementById("managed-pill").style.display = "inline";
  }

  // Status dot + label
  const dot   = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  const statusMap = {
    connected:      { cls: "connected",  text: "Connected" },
    offline:        { cls: "offline",    text: "Offline"   },
    connecting:     { cls: "connecting", text: "Connecting…" },
    "not-configured": { cls: "",         text: "Not Enrolled" },
    "auth-error":   { cls: "offline",    text: "Auth Error" },
  };
  const s = statusMap[status.status] ?? { cls: "", text: status.status };
  dot.className   = `status-dot ${s.cls}`;
  label.className = `status-label ${s.cls}`;
  label.textContent = s.text;

  if (status.agentId) {
    document.getElementById("body-configured").style.display    = "flex";
    document.getElementById("body-not-configured").style.display = "none";
    document.getElementById("agent-id").textContent       = status.agentId.slice(0, 12) + "…";
    document.getElementById("last-heartbeat").textContent = relTime(status.lastHeartbeat);
    document.getElementById("browser-name").textContent   = status.browser ?? "—";
    document.getElementById("queue-size").textContent     = status.queueSize ?? 0;
  } else {
    document.getElementById("body-configured").style.display    = "none";
    document.getElementById("body-not-configured").style.display = "block";
  }
});

// Load recent events from storage
chrome.storage.local.get(["recentDetections"], (d) => {
  const events = d.recentDetections ?? [];
  const container = document.getElementById("recent-events");
  if (!events.length) return;
  container.innerHTML = events.slice(0, 5).map(e => `
    <div class="event-row">
      <div class="event-dot" style="background:${RISK_COLORS[e.risk] ?? "#6b7280"}"></div>
      <span class="event-name">${e.appName}</span>
      <span class="event-type">${e.type === "ai-tool" ? "AI" : e.type === "shadow-it" ? "Shadow IT" : e.type === "policy-violation" ? "⛔ BLOCKED" : "SaaS"}</span>
    </div>
  `).join("");
});

document.getElementById("btn-flush").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "FLUSH" }, () => { window.close(); });
});

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
