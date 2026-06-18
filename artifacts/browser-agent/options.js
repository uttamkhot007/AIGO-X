function relTime(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

let isManaged = false;

// Load current status + config
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
  if (!status) return;
  isManaged = status.managedByPolicy || status.enforced;
  if (isManaged) {
    document.getElementById("managed-banner").classList.add("visible");
    ["api-base", "token", "agent-id"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
    document.getElementById("btn-unenroll").disabled = true;
  }
  document.getElementById("s-status").innerHTML =
    `<span class="dot ${status.status === "connected" ? "connected" : status.status === "offline" ? "offline" : "other"}"></span> ${status.status}`;
  document.getElementById("s-version").textContent = `v${status.version}`;
  document.getElementById("s-browser").textContent = status.browser ?? "—";
  document.getElementById("s-install").textContent = status.managedByPolicy ? "admin (force-installed)" : "normal";
  document.getElementById("s-hb").textContent      = relTime(status.lastHeartbeat);
  document.getElementById("s-queue").textContent   = String(status.queueSize ?? 0);
  if (status.agentId) document.getElementById("agent-id").value = status.agentId;
});

// Load saved config
chrome.storage.local.get(["apiBase", "token", "policies", "enforced"], (d) => {
  if (d.apiBase) document.getElementById("api-base").value = d.apiBase;
  if (d.token)   document.getElementById("token").value   = d.token;
  const p = d.policies ?? {};
  setToggle("pol-ai-log",      p.logAiTools   !== false);
  setToggle("pol-shadow-log",  p.logShadowIt  !== false);
  setToggle("pol-ai-block",    !!p.blockAiTools);
  setToggle("pol-shadow-block",!!p.blockShadowIt);
  setToggle("pol-enforced",    !!d.enforced);
});

function setToggle(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("on", val);
}
function getToggle(id) {
  return document.getElementById(id)?.classList.contains("on") ?? false;
}

// Toggle click handlers
document.querySelectorAll(".toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    if (isManaged) return; // locked in managed mode
    btn.classList.toggle("on");
  });
});

function showAlert(msg, type = "success") {
  const el = document.getElementById("alert");
  el.textContent = msg;
  el.className = `alert ${type}`;
  setTimeout(() => { el.className = "alert"; }, 4000);
}

// Enrol / connect
document.getElementById("btn-enroll").addEventListener("click", async () => {
  if (isManaged) { showAlert("Managed extension — contact your administrator to change settings.", "error"); return; }
  const apiBase = document.getElementById("api-base").value.trim().replace(/\/$/, "");
  const token   = document.getElementById("token").value.trim();
  if (!apiBase || !token) { showAlert("API Base URL and Token are required.", "error"); return; }

  // Generate a stable agentId
  const existing = await new Promise(r => chrome.storage.local.get(["agentId"], r));
  const agentId  = existing.agentId ?? `br-${crypto.randomUUID().slice(0, 8)}`;

  const policies = {
    logAiTools:   getToggle("pol-ai-log"),
    logShadowIt:  getToggle("pol-shadow-log"),
    blockAiTools: getToggle("pol-ai-block"),
    blockShadowIt:getToggle("pol-shadow-block"),
  };
  const enforced = getToggle("pol-enforced");

  try {
    // Register with platform
    const res = await fetch(`${apiBase}/browser-agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ agentId, version: "1.0.2", browser: navigator.userAgent, policies }),
    });
    if (!res.ok) throw new Error(`Platform returned ${res.status}`);

    await new Promise(r => chrome.runtime.sendMessage({ type: "ENROLL", apiBase, token, agentId, enforced, policies }, r));
    document.getElementById("agent-id").value = agentId;
    showAlert("✓ Successfully enrolled! Extension is now monitoring.", "success");
  } catch (e) {
    showAlert(`Connection failed: ${e.message}. Check API URL and token.`, "error");
  }
});

// Test heartbeat
document.getElementById("btn-heartbeat").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "HEARTBEAT" }, () => {
    showAlert("Heartbeat sent. Check connection status above.", "success");
    setTimeout(() => location.reload(), 1500);
  });
});

// Unenrol
document.getElementById("btn-unenroll").addEventListener("click", () => {
  if (!confirm("Disconnect this browser from AIGO-X? Monitoring will stop.")) return;
  chrome.runtime.sendMessage({ type: "UNENROLL" }, (r) => {
    if (r?.ok) { showAlert("Disconnected.", "success"); setTimeout(() => location.reload(), 1500); }
    else showAlert(r?.error ?? "Could not disconnect.", "error");
  });
});

// Save policies
document.getElementById("btn-save-policies").addEventListener("click", () => {
  if (isManaged) { showAlert("Managed extension — policies are locked.", "error"); return; }
  const policies = {
    logAiTools:   getToggle("pol-ai-log"),
    logShadowIt:  getToggle("pol-shadow-log"),
    blockAiTools: getToggle("pol-ai-block"),
    blockShadowIt:getToggle("pol-shadow-block"),
  };
  const enforced = getToggle("pol-enforced");
  chrome.storage.local.set({ policies, enforced }, () => {
    showAlert("Policies saved.", "success");
  });
});
