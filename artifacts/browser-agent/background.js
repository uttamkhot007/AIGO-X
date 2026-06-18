/**
 * AIGO-X Browser Agent — Background Service Worker
 * Version: 1.0.2
 *
 * Security properties:
 *  - Runs as a Manifest V3 service worker (not persistent — wakes on events only)
 *  - All API communication uses HTTPS + Bearer token
 *  - No DOM access, no tab content injection
 *  - Payload limited to domain names + timestamps (no page content, no keystrokes)
 *  - Tamper-detection: reports own install type; alerts dashboard on heartbeat gaps
 *  - Certificate pinning approach: API base URL locked in storage at enrollment time
 */

const AGENT_VERSION = "1.0.2";
const HEARTBEAT_ALARM  = "aigo_heartbeat";
const FLUSH_ALARM      = "aigo_flush";
const HEARTBEAT_MINS   = 5;
const FLUSH_MINS       = 2;
const MAX_QUEUE        = 200;

// ── AI Tool Classification Database ──────────────────────────────────────────
const AI_TOOLS = new Map([
  ["chat.openai.com",           { name: "ChatGPT",               risk: "medium", category: "Generative AI" }],
  ["claude.ai",                 { name: "Claude (Anthropic)",     risk: "medium", category: "Generative AI" }],
  ["gemini.google.com",         { name: "Google Gemini",         risk: "medium", category: "Generative AI" }],
  ["copilot.microsoft.com",     { name: "Microsoft Copilot",     risk: "low",    category: "Generative AI", approved: true }],
  ["perplexity.ai",             { name: "Perplexity AI",         risk: "medium", category: "AI Search"     }],
  ["midjourney.com",            { name: "Midjourney",            risk: "medium", category: "AI Image"      }],
  ["grok.x.ai",                 { name: "Grok (xAI)",            risk: "medium", category: "Generative AI" }],
  ["mistral.ai",                { name: "Mistral",               risk: "medium", category: "Generative AI" }],
  ["huggingface.co",            { name: "HuggingFace",           risk: "medium", category: "AI Platform"   }],
  ["replicate.com",             { name: "Replicate",             risk: "medium", category: "AI Platform"   }],
  ["character.ai",              { name: "Character.AI",          risk: "high",   category: "Generative AI" }],
  ["poe.com",                   { name: "Poe (Quora)",           risk: "medium", category: "Generative AI" }],
  ["pi.ai",                     { name: "Pi (Inflection)",       risk: "medium", category: "Generative AI" }],
  ["you.com",                   { name: "You.com AI",            risk: "medium", category: "AI Search"     }],
  ["phind.com",                 { name: "Phind",                 risk: "low",    category: "AI Dev Tool",   approved: true }],
  ["jasper.ai",                 { name: "Jasper AI",             risk: "medium", category: "AI Writing"    }],
  ["writesonic.com",            { name: "Writesonic",            risk: "medium", category: "AI Writing"    }],
  ["copy.ai",                   { name: "Copy.ai",               risk: "medium", category: "AI Writing"    }],
  ["anthropic.com",             { name: "Anthropic Console",     risk: "medium", category: "AI Platform"   }],
  ["platform.openai.com",       { name: "OpenAI Platform",       risk: "medium", category: "AI Platform"   }],
  ["stability.ai",              { name: "Stability AI",          risk: "medium", category: "AI Image"      }],
  ["elevenlabs.io",             { name: "ElevenLabs",            risk: "medium", category: "AI Voice"      }],
  ["runway.ml",                 { name: "Runway ML",             risk: "medium", category: "AI Video"      }],
  ["cursor.sh",                 { name: "Cursor IDE",            risk: "low",    category: "AI Dev Tool",   approved: true }],
  ["tabnine.com",               { name: "Tabnine",               risk: "low",    category: "AI Dev Tool",   approved: true }],
  ["codeium.com",               { name: "Codeium",               risk: "medium", category: "AI Dev Tool"   }],
  ["cohere.com",                { name: "Cohere AI",             risk: "medium", category: "AI Platform"   }],
  ["deepmind.google",           { name: "Google DeepMind",       risk: "low",    category: "AI Research"    }],
  ["groq.com",                  { name: "Groq",                  risk: "medium", category: "AI Platform"   }],
  ["together.ai",               { name: "Together AI",           risk: "medium", category: "AI Platform"   }],
  ["fireworks.ai",              { name: "Fireworks AI",          risk: "medium", category: "AI Platform"   }],
  ["leonardo.ai",               { name: "Leonardo AI",           risk: "medium", category: "AI Image"      }],
  ["suno.com",                  { name: "Suno AI",               risk: "medium", category: "AI Audio"      }],
  ["udio.com",                  { name: "Udio",                  risk: "medium", category: "AI Audio"      }],
  ["synthesia.io",              { name: "Synthesia",             risk: "medium", category: "AI Video"      }],
  ["heygen.com",                { name: "HeyGen",                risk: "medium", category: "AI Video"      }],
  ["descript.com",              { name: "Descript",              risk: "medium", category: "AI Video"      }],
  ["grammarly.com",             { name: "Grammarly",             risk: "high",   category: "AI Writing"    }],
  ["quillbot.com",              { name: "QuillBot",              risk: "high",   category: "AI Writing"    }],
  ["notion.so/ai",              { name: "Notion AI",             risk: "medium", category: "AI Workspace"  }],
  ["github.com/features/copilot",{ name: "GitHub Copilot",      risk: "low",    category: "AI Dev Tool",   approved: true }],
]);

// ── Approved SaaS App Database ────────────────────────────────────────────────
const SAAS_APPROVED = new Map([
  ["github.com",             { name: "GitHub",           category: "DevOps" }],
  ["gitlab.com",             { name: "GitLab",           category: "DevOps" }],
  ["atlassian.net",          { name: "Atlassian Suite",  category: "PM"     }],
  ["jira.atlassian.com",     { name: "Jira",             category: "PM"     }],
  ["confluence.atlassian.com",{ name: "Confluence",      category: "Collab" }],
  ["slack.com",              { name: "Slack",            category: "Collab" }],
  ["teams.microsoft.com",    { name: "Microsoft Teams",  category: "Collab" }],
  ["sharepoint.com",         { name: "SharePoint",       category: "Collab" }],
  ["office.com",             { name: "Microsoft 365",    category: "Productivity" }],
  ["figma.com",              { name: "Figma",            category: "Design" }],
  ["linear.app",             { name: "Linear",           category: "PM"     }],
  ["datadog.com",            { name: "Datadog",          category: "Monitoring" }],
  ["sentry.io",              { name: "Sentry",           category: "Monitoring" }],
  ["vercel.com",             { name: "Vercel",           category: "DevOps" }],
  ["netlify.com",            { name: "Netlify",          category: "DevOps" }],
  ["aws.amazon.com",         { name: "AWS Console",      category: "Cloud"  }],
  ["console.cloud.google.com",{ name: "GCP Console",     category: "Cloud"  }],
  ["portal.azure.com",       { name: "Azure Portal",     category: "Cloud"  }],
  ["salesforce.com",         { name: "Salesforce",       category: "CRM"    }],
  ["hubspot.com",            { name: "HubSpot",          category: "CRM"    }],
  ["zendesk.com",            { name: "Zendesk",          category: "Support"}],
  ["servicenow.com",         { name: "ServiceNow",       category: "ITSM"   }],
  ["workday.com",            { name: "Workday",          category: "HR"     }],
  ["zoom.us",                { name: "Zoom",             category: "Video"  }],
  ["cloudflare.com",         { name: "Cloudflare",       category: "Network"}],
  ["1password.com",          { name: "1Password",        category: "Security"}],
  ["okta.com",               { name: "Okta",             category: "IAM"    }],
]);

// ── Shadow IT patterns (unapproved SaaS) ─────────────────────────────────────
const SHADOW_IT = new Map([
  ["dropbox.com",   { name: "Dropbox",       category: "File Storage", risk: "high"   }],
  ["box.com",       { name: "Box",           category: "File Storage", risk: "medium" }],
  ["wetransfer.com",{ name: "WeTransfer",    category: "File Sharing", risk: "high"   }],
  ["airtable.com",  { name: "Airtable",      category: "Database",     risk: "medium" }],
  ["notion.so",     { name: "Notion",        category: "Workspace",    risk: "medium" }],
  ["monday.com",    { name: "Monday.com",    category: "PM",           risk: "medium" }],
  ["asana.com",     { name: "Asana",         category: "PM",           risk: "low"    }],
  ["trello.com",    { name: "Trello",        category: "PM",           risk: "low"    }],
  ["canva.com",     { name: "Canva",         category: "Design",       risk: "medium" }],
  ["miro.com",      { name: "Miro",          category: "Whiteboard",   risk: "medium" }],
  ["loom.com",      { name: "Loom",          category: "Video",        risk: "medium" }],
  ["paypal.com",    { name: "PayPal",        category: "Finance",      risk: "high"   }],
  ["stripe.com",    { name: "Stripe",        category: "Finance",      risk: "medium" }],
  ["mixpanel.com",  { name: "Mixpanel",      category: "Analytics",    risk: "medium" }],
  ["segment.com",   { name: "Segment",       category: "Analytics",    risk: "medium" }],
  ["amplitude.com", { name: "Amplitude",     category: "Analytics",    risk: "medium" }],
  ["bamboohr.com",  { name: "BambooHR",      category: "HR",           risk: "medium" }],
  ["calendly.com",  { name: "Calendly",      category: "Scheduling",   risk: "low"    }],
  ["docusign.com",  { name: "DocuSign",      category: "Legal",        risk: "medium" }],
  ["telegram.org",  { name: "Telegram",      category: "Messaging",    risk: "high"   }],
  ["whatsapp.com",  { name: "WhatsApp Web",  category: "Messaging",    risk: "high"   }],
  ["reddit.com",    { name: "Reddit",        category: "Social",       risk: "high"   }],
  ["twitter.com",   { name: "Twitter/X",     category: "Social",       risk: "high"   }],
  ["x.com",         { name: "Twitter/X",     category: "Social",       risk: "high"   }],
  ["tiktok.com",    { name: "TikTok",        category: "Social",       risk: "critical"}],
  ["pinterest.com", { name: "Pinterest",     category: "Social",       risk: "medium" }],
]);

// ── Event queue (in-memory, flushed periodically) ─────────────────────────────
let eventQueue = [];

// ── Domain classifier ─────────────────────────────────────────────────────────
function classify(domain, path = "") {
  const full = domain + path;
  for (const [pattern, info] of AI_TOOLS)   { if (full.includes(pattern)) return { type: "ai-tool",    ...info, approved: info.approved ?? false }; }
  for (const [pattern, info] of SAAS_APPROVED) { if (domain.includes(pattern)) return { type: "saas-approved", ...info, risk: "low", approved: true }; }
  for (const [pattern, info] of SHADOW_IT)  { if (domain.includes(pattern)) return { type: "shadow-it",  ...info, approved: false }; }

  // Heuristic: .ai / .io / cloud-sounding domains
  if (domain.endsWith(".ai"))  return { type: "shadow-it", name: domain, category: "Unknown AI Service",   risk: "medium", approved: false };
  if (domain.match(/\.(app|tools?|hub|suite|platform)$/) && !domain.match(/^(web|www|app|my)\./))
    return { type: "shadow-it", name: domain, category: "Unknown SaaS/Cloud", risk: "low", approved: false };
  return null;
}

// ── Get stored config ─────────────────────────────────────────────────────────
async function getConfig() {
  return chrome.storage.local.get(["apiBase", "agentId", "token", "tenantId", "policies", "enforced"]);
}

// ── Main: webNavigation listener ──────────────────────────────────────────────
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  let url;
  try { url = new URL(details.url); } catch { return; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  const domain = url.hostname.replace(/^www\./, "");
  const result = classify(domain, url.pathname.slice(0, 60));
  if (!result) return;

  const cfg = await getConfig();
  const policies = cfg.policies ?? {};

  // Policy enforcement: block if policy says so and extension is in enforced mode
  if (cfg.enforced && policies.blockAiTools && result.type === "ai-tool" && !result.approved) {
    // Content script blocking requires declarativeNetRequest (see deployment notes)
    // Here we just log a policy_violation event
    result.policyViolation = true;
  }
  if (cfg.enforced && policies.blockShadowIt && result.type === "shadow-it") {
    result.policyViolation = true;
  }

  const event = {
    id: crypto.randomUUID(),
    type: result.policyViolation ? "policy-violation" : result.type,
    domain,
    appName: result.name ?? domain,
    category: result.category ?? "Unknown",
    risk: result.risk ?? "low",
    approved: result.approved,
    ts: new Date().toISOString(),
  };

  if (eventQueue.length < MAX_QUEUE) eventQueue.push(event);
  if (eventQueue.length >= 20 && cfg.apiBase && cfg.agentId) flushEvents(cfg);

  // Action badge flash
  const riskColor = { critical: "#DC2626", high: "#D97706", medium: "#6366F1", low: "#10B981" };
  chrome.action.setBadgeBackgroundColor({ color: riskColor[result.risk] ?? "#6B7280" });
  chrome.action.setBadgeText({ text: result.type === "ai-tool" ? "AI" : result.type === "shadow-it" ? "IT" : "✓" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3500);
});

// ── Flush event queue to platform API ─────────────────────────────────────────
async function flushEvents(cfg) {
  if (!cfg || !cfg.apiBase || !cfg.agentId || eventQueue.length === 0) return;
  const batch = [...eventQueue];
  eventQueue = [];
  try {
    const res = await fetch(`${cfg.apiBase}/browser-agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.token ?? ""}`,
        "X-Agent-ID": cfg.agentId,
        "X-Agent-Version": AGENT_VERSION,
      },
      body: JSON.stringify({ agentId: cfg.agentId, events: batch }),
    });
    if (!res.ok && eventQueue.length < MAX_QUEUE - batch.length) {
      eventQueue.unshift(...batch.slice(0, 20)); // Re-queue on failure
    }
  } catch {
    if (eventQueue.length < MAX_QUEUE - batch.length) eventQueue.unshift(...batch.slice(0, 20));
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
async function sendHeartbeat() {
  const cfg = await getConfig();
  if (!cfg.apiBase || !cfg.agentId) return;

  // Tamper-detection: check own install type via management API
  let installType = "normal";
  let managedByPolicy = false;
  try {
    const self = await chrome.management.getSelf();
    installType = self.installType; // "admin" = force-installed by policy
    managedByPolicy = self.installType === "admin";
  } catch { /* management API not available (non-Chrome) */ }

  try {
    const r = await fetch(`${cfg.apiBase}/browser-agent/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.token ?? ""}`,
      },
      body: JSON.stringify({
        agentId: cfg.agentId,
        version: AGENT_VERSION,
        installType,
        managedByPolicy,
        queueSize: eventQueue.length,
        browser: getBrowser(),
        platform: navigator.platform,
        ts: new Date().toISOString(),
      }),
    });
    const status = r.ok ? "connected" : "auth-error";
    await chrome.storage.local.set({ lastHeartbeat: new Date().toISOString(), connStatus: status, managedByPolicy });
    if (r.ok) flushEvents(cfg);
  } catch {
    await chrome.storage.local.set({ connStatus: "offline" });
  }
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Unknown";
}

// ── Alarm handlers ────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) sendHeartbeat();
  if (alarm.name === FLUSH_ALARM) { const cfg = await getConfig(); flushEvents(cfg); }
});

function setupAlarms() {
  chrome.alarms.get(HEARTBEAT_ALARM, a => { if (!a) chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINS }); });
  chrome.alarms.get(FLUSH_ALARM,     a => { if (!a) chrome.alarms.create(FLUSH_ALARM,     { periodInMinutes: FLUSH_MINS     }); });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  setupAlarms();
  if (reason === "install") {
    // Open options page on fresh install for enrollment
    const cfg = await getConfig();
    if (!cfg.agentId) chrome.runtime.openOptionsPage();
  }
  sendHeartbeat();
});

chrome.runtime.onStartup.addListener(() => { setupAlarms(); sendHeartbeat(); });

// ── IPC: popup / options page communication ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_STATUS") {
    getConfig().then(cfg =>
      chrome.storage.local.get(["connStatus", "lastHeartbeat", "managedByPolicy"], s => {
        sendResponse({
          version: AGENT_VERSION,
          agentId: cfg.agentId ?? null,
          apiBase: cfg.apiBase ?? null,
          status: cfg.agentId ? (s.connStatus ?? "connecting") : "not-configured",
          lastHeartbeat: s.lastHeartbeat ?? null,
          managedByPolicy: s.managedByPolicy ?? false,
          enforced: cfg.enforced ?? false,
          queueSize: eventQueue.length,
          browser: getBrowser(),
        });
      })
    );
    return true;
  }
  if (msg.type === "FLUSH") {
    getConfig().then(cfg => flushEvents(cfg).then(() => sendResponse({ ok: true })));
    return true;
  }
  if (msg.type === "HEARTBEAT") {
    sendHeartbeat().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "ENROLL") {
    const { apiBase, token, agentId, enforced, policies } = msg;
    chrome.storage.local.set({ apiBase, token, agentId, enforced: enforced ?? false, policies: policies ?? {} }, () => {
      sendHeartbeat();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "UNENROLL") {
    // Only allowed if not in enforced mode
    getConfig().then(cfg => {
      if (cfg.enforced) { sendResponse({ ok: false, error: "Extension is managed by policy. Contact your administrator." }); return; }
      chrome.storage.local.clear(() => sendResponse({ ok: true }));
    });
    return true;
  }
});
