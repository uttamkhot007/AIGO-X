/**
 * Browser Extension Package Download
 *
 * Serves a real, loadable Chrome/Edge/Firefox extension package as a ZIP.
 * The extension reports browser security signals back to the AIGO-X platform.
 *
 * GET /api/browser-extension/download?browser=chrome|edge|firefox
 */
import { Router } from "express";
import { requireAuth } from "../lib/auth";
import AdmZip from "adm-zip";
import type { Request, Response } from "express";

const router = Router();

// ── Extension source files ────────────────────────────────────────────────────

const CHROME_MANIFEST = JSON.stringify({
  manifest_version: 3,
  name: "AIGO-X GRC Browser Agent",
  version: "2.4.1",
  description: "Enterprise GRC compliance monitoring agent. Reports browser security posture to your AIGO-X GRC platform.",
  permissions: ["storage", "tabs", "alarms"],
  host_permissions: ["<all_urls>"],
  background: { service_worker: "background.js" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" }],
  action: { default_popup: "popup.html", default_title: "AIGO-X GRC Agent" },
}, null, 2);

const FIREFOX_MANIFEST = JSON.stringify({
  manifest_version: 2,
  name: "AIGO-X GRC Browser Agent",
  version: "2.4.1",
  description: "Enterprise GRC compliance monitoring agent. Reports browser security posture to your AIGO-X GRC platform.",
  permissions: ["storage", "tabs", "alarms", "<all_urls>"],
  background: { scripts: ["background.js"], persistent: false },
  content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" }],
  browser_action: { default_popup: "popup.html", default_title: "AIGO-X GRC Agent" },
  browser_specific_settings: { gecko: { id: "aigo-x-grc@aigo-x.io", strict_min_version: "109.0" } },
}, null, 2);

const BACKGROUND_JS = `// AIGO-X GRC Browser Agent v2.4.1 — Background Service Worker
// Configure by setting storage keys: aigox_token, aigox_api_base
// Or via managed storage (GPO/Intune): { token, apiBase, logAiTools, logShadowIt }

const VERSION = '2.4.1';
const DEFAULT_API = 'https://api.aigo-x.io';

const AI_TOOL_DOMAINS = [
  'chat.openai.com','chatgpt.com','claude.ai','gemini.google.com',
  'copilot.microsoft.com','perplexity.ai','you.com','poe.com',
  'character.ai','jasper.ai','writesonic.com','bard.google.com',
];
const SHADOW_IT_DOMAINS = [
  'notion.so','airtable.com','monday.com','asana.com','trello.com',
  'dropbox.com','box.com','wetransfer.com','discord.com','miro.com',
];

let cfg = { token: '', apiBase: DEFAULT_API, logAiTools: true, logShadowIt: true };

async function loadCfg() {
  try {
    const local = await chrome.storage.local.get(['aigox_token','aigox_api_base','aigox_log_ai','aigox_log_shadow']);
    if (local.aigox_token)      cfg.token      = local.aigox_token;
    if (local.aigox_api_base)   cfg.apiBase    = local.aigox_api_base;
    if (typeof local.aigox_log_ai     === 'boolean') cfg.logAiTools  = local.aigox_log_ai;
    if (typeof local.aigox_log_shadow === 'boolean') cfg.logShadowIt = local.aigox_log_shadow;
  } catch(_) {}
  try {
    const m = await chrome.storage.managed.get(['token','apiBase','logAiTools','logShadowIt']);
    if (m.token)      cfg.token      = m.token;
    if (m.apiBase)    cfg.apiBase    = m.apiBase;
    if (typeof m.logAiTools  === 'boolean') cfg.logAiTools  = m.logAiTools;
    if (typeof m.logShadowIt === 'boolean') cfg.logShadowIt = m.logShadowIt;
  } catch(_) {}
}

async function post(payload) {
  if (!cfg.token) return;
  try {
    await fetch(cfg.apiBase + '/browser-agent/beacon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AIGO-Token': cfg.token },
      body: JSON.stringify({ ...payload, extId: chrome.runtime.id, v: VERSION }),
      keepalive: true,
    });
  } catch(_) {}
}

function classifyDomain(domain) {
  const d = domain.replace(/^www\\./, '');
  if (AI_TOOL_DOMAINS.some(x => d === x || d.endsWith('.' + x))) return 'ai-tool';
  if (SHADOW_IT_DOMAINS.some(x => d === x || d.endsWith('.' + x))) return 'shadow-it';
  return null;
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || tab.url.startsWith('chrome')) return;
  try {
    const url  = new URL(tab.url);
    const type = classifyDomain(url.hostname);
    if (!type) return;
    if (type === 'ai-tool'   && !cfg.logAiTools)  return;
    if (type === 'shadow-it' && !cfg.logShadowIt) return;
    await post({ type, domain: url.hostname, url: url.origin, title: tab.title || '', ts: new Date().toISOString() });
  } catch(_) {}
});

// Heartbeat every 10 minutes
chrome.alarms.create('hb', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'hb') return;
  await loadCfg();
  await post({ type: 'heartbeat', ts: new Date().toISOString() });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({ token: cfg.token ? cfg.token.slice(0,8) + '...' : '', apiBase: cfg.apiBase, v: VERSION });
  }
  if (msg.type === 'SET_TOKEN') {
    cfg.token = msg.token;
    chrome.storage.local.set({ aigox_token: msg.token });
    sendResponse({ ok: true });
  }
});

loadCfg();
`;

const CONTENT_JS = `// AIGO-X GRC Browser Agent v2.4.1 — Content Script
(function() {
  'use strict';
  if (window.__aigox_cs) return;
  window.__aigox_cs = true;

  function collect() {
    var nav = navigator, perf = window.performance;
    var timing = (perf && perf.getEntriesByType) ? (perf.getEntriesByType('navigation')[0] || {}) : {};
    return {
      href:          location.href,
      domain:        location.hostname,
      https:         location.protocol === 'https:',
      lang:          nav.language || null,
      tz:            (typeof Intl !== 'undefined') ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
      screen:        window.screen ? window.screen.width + 'x' + window.screen.height : null,
      cookieEnabled: nav.cookieEnabled,
      dnt:           nav.doNotTrack || window.doNotTrack || null,
      swSupport:     'serviceWorker' in nav,
      loadMs:        timing.domContentLoadedEventEnd
                       ? Math.round(timing.domContentLoadedEventEnd - (timing.fetchStart || 0)) : null,
      ts:            new Date().toISOString(),
    };
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'PAGE_SIGNALS', data: collect() });
    }
  } catch(_) {}
}());
`;

const POPUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>AIGO-X GRC Agent</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:290px;font-family:system-ui,-apple-system,sans-serif;background:#080D18;color:#E2E8F0;font-size:12px}
.hdr{background:linear-gradient(135deg,#1a3a5c 0%,#064e3b 100%);padding:14px 16px}
.hdr h1{font-size:13px;font-weight:800;color:#fff;margin-bottom:3px}
.hdr p{font-size:10px;color:rgba(255,255,255,.65)}
.body{padding:12px 14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.row:last-child{border-bottom:none}
.lbl{color:#94A3B8;font-size:11px}
.val{font-weight:700;color:#E2E8F0;font-size:11px;text-align:right;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{padding:2px 8px;border-radius:10px;font-size:9px;font-weight:800}
.ok{background:rgba(34,197,94,.15);color:#34D399;border:1px solid rgba(52,211,153,.3)}
.warn{background:rgba(234,179,8,.15);color:#FCD34D;border:1px solid rgba(252,211,77,.3)}
.err{background:rgba(239,68,68,.15);color:#F87171;border:1px solid rgba(248,113,113,.3)}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px}
.footer{padding:9px 14px;font-size:10px;color:#475569;border-top:1px solid rgba(255,255,255,.07);text-align:center}
input{width:100%;background:#0f1829;border:1px solid rgba(255,255,255,.12);border-radius:6px;color:#E2E8F0;font-size:11px;padding:6px 8px;font-family:monospace;outline:none;margin-top:6px}
button{width:100%;margin-top:6px;padding:7px;background:#3B82F6;border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:#2563EB}
.section-title{font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px}
</style>
</head>
<body>
<div class="hdr">
  <h1>&#x2605; AIGO-X GRC Browser Agent</h1>
  <p>v2.4.1 &nbsp;&middot;&nbsp; Enterprise Security Monitoring</p>
</div>
<div class="body">
  <div class="row">
    <span class="lbl">Agent status</span>
    <span class="val"><span class="dot" id="dot" style="background:#34D399"></span><span id="status">Active</span></span>
  </div>
  <div class="row">
    <span class="lbl">Token</span>
    <span class="val" id="tok">Not set</span>
  </div>
  <div class="row">
    <span class="lbl">API endpoint</span>
    <span class="val" id="api">—</span>
  </div>
  <div class="row">
    <span class="lbl">Current page</span>
    <span class="val" id="domain">—</span>
  </div>
  <div class="row">
    <span class="lbl">Protocol</span>
    <span class="badge ok" id="proto">—</span>
  </div>
  <div class="section-title">Set enrollment token</div>
  <input id="tok-input" type="password" placeholder="et_... or aigox_..." spellcheck="false"/>
  <button id="save-btn">Save token</button>
</div>
<div class="footer">AIGO-X Enterprise GRC &nbsp;&middot;&nbsp; aigo-x.io</div>
<script src="popup.js"></script>
</body>
</html>
`;

const POPUP_JS = `document.addEventListener('DOMContentLoaded', async () => {
  var $  = id => document.getElementById(id);
  var dot = $('dot'), statusEl = $('status'), tokEl = $('tok'),
      apiEl = $('api'), domEl = $('domain'), protoEl = $('proto');

  // Get status from background
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function(res) {
      if (res && res.token) {
        tokEl.textContent = res.token;
        statusEl.textContent = 'Active';
        dot.style.background = '#34D399';
      } else {
        tokEl.textContent = 'Not configured';
        statusEl.textContent = 'Token required';
        dot.style.background = '#F59E0B';
      }
      if (res && res.apiBase) apiEl.textContent = res.apiBase.replace('https://','');
    });
  } catch(_) {}

  // Current tab info
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url) return;
      try {
        var url = new URL(tabs[0].url);
        domEl.textContent = url.hostname;
        if (url.protocol === 'https:') {
          protoEl.textContent = 'HTTPS \u2713';
          protoEl.className = 'badge ok';
        } else {
          protoEl.textContent = 'HTTP \u26a0';
          protoEl.className = 'badge err';
        }
      } catch(_) {}
    });
  } catch(_) {}

  // Save token button
  document.getElementById('save-btn').addEventListener('click', function() {
    var t = document.getElementById('tok-input').value.trim();
    if (!t) return;
    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: t }, function(res) {
      if (res && res.ok) {
        document.getElementById('save-btn').textContent = 'Saved \u2713';
        tokEl.textContent = t.slice(0,8) + '...';
        statusEl.textContent = 'Active';
        dot.style.background = '#34D399';
        setTimeout(function() {
          document.getElementById('save-btn').textContent = 'Save token';
        }, 2000);
      }
    });
  });
});
`;

const INSTALL_README = `AIGO-X GRC Browser Agent v2.4.1
================================
Enterprise browser security monitoring for Chrome, Edge, and Firefox.

QUICK INSTALL (Developer / Testing)
-------------------------------------
Chrome / Edge:
  1. Open chrome://extensions  (or edge://extensions)
  2. Enable "Developer mode" (top-right toggle)
  3. Click "Load unpacked"
  4. Select THIS folder (where manifest.json lives)
  5. The extension icon appears in your toolbar
  6. Click the icon → enter your AIGO-X enrollment token

Firefox:
  1. Open about:debugging#/runtime/this-firefox
  2. Click "Load Temporary Add-on..."
  3. Select the manifest.json file in this folder
  (For permanent install, use the Firefox XPI build)

CONFIGURATION
--------------
After loading, click the extension icon and paste your
enrollment token from: Settings → Agents → Browser Extension

The token format is:  et_<64 hex chars>

Or pre-configure via managed storage (GPO/Intune):
  {
    "token":      "et_your_token_here",
    "apiBase":    "https://your-domain.com/api",
    "logAiTools": true,
    "logShadowIt": true
  }

ENTERPRISE DEPLOYMENT (IT Admins)
-----------------------------------
Chrome/Edge via GPO:
  ExtensionInstallForcelist registry key:
  HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist
  (Pack as CRX and host on internal server, or deploy via Google Admin)

Firefox via Enterprise Policy:
  /etc/firefox/policies/policies.json  (Linux)
  C:\\Program Files\\Mozilla Firefox\\distribution\\policies.json  (Windows)

WHAT IT MONITORS
-----------------
  - AI tool visits (ChatGPT, Claude, Gemini, Copilot, etc.)
  - Shadow IT / unapproved SaaS access
  - Browser HTTPS enforcement status
  - Page security posture signals

SUPPORT
--------
  enterprise@aigo-x.io  |  https://docs.aigo-x.io/browser-extension
`;

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/browser-extension/download", requireAuth, (req: Request, res: Response): void => {
  const browser = String(req.query["browser"] ?? "chrome").toLowerCase();
  const isFirefox = browser === "firefox";

  try {
    const zip = new AdmZip();

    zip.addFile("manifest.json", Buffer.from(isFirefox ? FIREFOX_MANIFEST : CHROME_MANIFEST, "utf8"));
    zip.addFile("background.js", Buffer.from(BACKGROUND_JS, "utf8"));
    zip.addFile("content.js",    Buffer.from(CONTENT_JS,    "utf8"));
    zip.addFile("popup.html",    Buffer.from(POPUP_HTML,    "utf8"));
    zip.addFile("popup.js",      Buffer.from(POPUP_JS,      "utf8"));
    zip.addFile("README.txt",    Buffer.from(INSTALL_README, "utf8"));

    const filename = isFirefox
      ? "aigo-x-browser-agent-v2.4.1-firefox.zip"
      : browser === "edge"
        ? "aigo-x-browser-agent-v2.4.1-edge.zip"
        : "aigo-x-browser-agent-v2.4.1-chrome.zip";

    const buf = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (err) {
    console.error("[browser-extension/download]", err);
    res.status(500).json({ error: "Failed to generate extension package" });
  }
});

export default router;
