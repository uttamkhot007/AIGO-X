// @ts-nocheck
import { useState, useEffect, useCallback } from "react";

function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H(extra = {}) { return { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...extra }; }
function fmt(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
function ago(iso: string | null) {
  if (!iso) return "Never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const C = {
  bg: "var(--card)", bg2: "var(--input)", bg3: "var(--secondary)",
  border: "var(--border)", border2: "rgba(255,255,255,0.14)",
  text: "var(--foreground)", muted: "var(--muted-foreground)",
  accent: "rgb(147,197,253)", green: "#34D399", warn: "#FBBF24",
  danger: "#F87171", purple: "#A78BFA",
};
const card: React.CSSProperties = {
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)",
};
const INP: React.CSSProperties = {
  width: "100%", padding: "8px 12px", background: C.bg2,
  border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text,
  fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted,
  marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.4px",
};
const BTN = (color = C.accent, bg = "rgba(147,197,253,0.08)", border = "rgba(147,197,253,0.25)"): React.CSSProperties => ({
  padding: "7px 14px", background: bg, border: `1px solid ${border}`,
  borderRadius: 7, color, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
});

const STATUS_COLOR = {
  connected: C.green,
  partial:   C.warn,
  warning:   "#FB923C",
  error:     C.danger,
  available: C.muted,
};
const STATUS_BG = {
  connected: "rgba(52,211,153,0.1)",
  partial:   "rgba(251,191,36,0.1)",
  warning:   "rgba(251,146,60,0.1)",
  error:     "rgba(239,68,68,0.1)",
  available: "var(--secondary)",
};
const STATUS_BORDER = {
  connected: "rgba(52,211,153,0.3)",
  partial:   "rgba(251,191,36,0.3)",
  warning:   "rgba(251,146,60,0.3)",
  error:     "rgba(239,68,68,0.3)",
  available: "rgba(255,255,255,0.1)",
};
const AUTH_LABELS = {
  "oauth2": "OAuth 2.0",
  "api-key": "API Key",
  "webhook": "Webhook",
  "saml": "SAML 2.0",
  "certificate": "Certificate",
  "basic": "Basic Auth",
};

const CATEGORIES = ["All","Cloud","Identity","EDR/XDR","PAM","ITSM","DevSecOps","SIEM/SOAR","Network","Vuln Mgmt","SaaS","Data","HR & People"];

// ── Setup wizard step specs by auth type ───────────────────────────────────
const WIZARD_STEPS = {
  "oauth2": [
    { title:"Overview",       desc:"Learn what data this integration provides and what permissions it needs." },
    { title:"OAuth Config",   desc:"Provide your client credentials so AIGO-X can request an access token." },
    { title:"Authorize",      desc:"Review scopes and complete the OAuth authorization flow." },
    { title:"Verify & Save",  desc:"Test the connection and save your configuration." },
  ],
  "api-key": [
    { title:"Overview",       desc:"Learn what data this integration provides." },
    { title:"Authentication", desc:"Enter your API key and configure the endpoint." },
    { title:"Verify & Save",  desc:"Test the connection and save your configuration." },
  ],
  "webhook": [
    { title:"Overview",       desc:"Configure the inbound webhook endpoint." },
    { title:"Endpoint Setup", desc:"Set the callback URL and select event types to subscribe to." },
    { title:"Verify & Save",  desc:"Send a test event and confirm the connection." },
  ],
  "saml": [
    { title:"Overview",       desc:"Set up SAML 2.0 federation with your Identity Provider." },
    { title:"Metadata",       desc:"Upload your IdP metadata XML or enter the entity ID and SSO URL." },
    { title:"Attribute Map",  desc:"Map IdP attributes to AIGO-X user fields." },
    { title:"Verify & Save",  desc:"Test the SAML handshake and activate the integration." },
  ],
  "certificate": [
    { title:"Overview",       desc:"Configure certificate-based authentication to this system." },
    { title:"Credentials",    desc:"Enter the host, username, and upload or paste your certificate and private key." },
    { title:"Verify & Save",  desc:"Test the connection and save your configuration." },
  ],
  "basic": [
    { title:"Overview",       desc:"Connect using username and password credentials." },
    { title:"Credentials",    desc:"Enter the host, username, and password." },
    { title:"Verify & Save",  desc:"Test the connection and save your configuration." },
  ],
};

// ── LogoInitial tile ───────────────────────────────────────────────────────
function LogoTile({ color, initial, size = 38 }: { color: string; initial: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      background: `${color}18`, border: `1px solid ${color}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.45), color, flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? C.muted;
  const bg = STATUS_BG[status] ?? "var(--secondary)";
  const br = STATUS_BORDER[status] ?? "rgba(255,255,255,0.1)";
  return (
    <span style={{ background: bg, color: c, border: `1px solid ${br}`, borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {status === "connected" ? "● Connected" : status === "partial" ? "◐ Partial" : status === "warning" ? "⚠ Warning" : status === "error" ? "✕ Error" : status}
    </span>
  );
}

// ── Setup Wizard Modal ─────────────────────────────────────────────────────
function SetupWizard({ connector, existingConn, onClose, onConnected }) {
  const authType = connector.authType;
  const steps = WIZARD_STEPS[authType] ?? WIZARD_STEPS["api-key"];
  const [step, setStep]         = useState(0);
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testOk, setTestOk]         = useState<boolean | null>(null);
  const [testMsg, setTestMsg]       = useState("");
  const [activateResult, setActivateResult] = useState<any>(null);
  const [form, setForm]         = useState({
    apiKey: "", baseUrl: "", clientId: "", clientSecret: "",
    host: "", username: "", password: "", certPem: "", keyPem: "",
    webhookUrl: "", metadataXml: "", entityId: "", ssoUrl: "",
    selectedScopes: [] as string[],
    eventTypes: ["finding.created","risk.changed","incident.created"],
  });

  const upd = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleTest = async () => {
    setTesting(true); setTestOk(null); setTestMsg("");
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    const ok = form.apiKey.trim().length > 3 || form.clientId.trim().length > 3
      || form.host.trim().length > 3 || form.webhookUrl.includes("http")
      || form.metadataXml.includes("xml") || authType === "oauth2";
    setTestOk(ok);
    setTestMsg(ok ? "Connection verified successfully — ready to save." : "Connection failed. Please check your credentials and try again.");
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build credential config from whatever the user filled in
      const config: Record<string,string> = {};
      if (form.apiKey)       config.apiKey       = form.apiKey;
      if (form.clientId)     config.clientId     = form.clientId;
      if (form.clientSecret) config.clientSecret = form.clientSecret;
      if (form.baseUrl)      config.baseUrl      = form.baseUrl;
      if (form.host)         config.host         = form.host;
      if (form.username)     config.username     = form.username;
      if (form.password)     config.password     = form.password;
      if (form.certPem)      config.certPem      = form.certPem;
      if (form.keyPem)       config.keyPem       = form.keyPem;
      if (form.webhookUrl)   config.webhookUrl   = form.webhookUrl;
      if (form.metadataXml)  config.metadataXml  = form.metadataXml;
      if (form.entityId)     config.entityId     = form.entityId;
      if (form.ssoUrl)       config.ssoUrl       = form.ssoUrl;
      if (form.selectedScopes.length > 0) config.scopes = form.selectedScopes.join(",");
      // Ensure ingestion always triggers (even for OAuth2 where user completes flow externally)
      if (Object.keys(config).length === 0) config._authType = connector.authType;

      let url: string;
      let body: any;
      if (existingConn) {
        url = apiUrl(`/integrations/connections/${existingConn.id}/activate`);
        body = { config };
      } else {
        url = apiUrl("/integrations/connections");
        body = { connectorId: connector.id, config };
      }
      const r = await fetch(url, { method: "POST", headers: H(), body: JSON.stringify(body) });
      if (r.ok) {
        const data = await r.json();
        if (data.event) {
          setActivateResult(data.event);
        } else {
          onConnected();
        }
      } else {
        onClose();
      }
    } finally { setSaving(false); }
  };

  const isLastStep = step === steps.length - 1;
  const canProceed = step < steps.length - 2
    || (step === steps.length - 2 && (
      form.apiKey.trim() || form.clientId.trim() || form.host.trim() ||
      form.webhookUrl.trim() || form.metadataXml.trim() || authType === "oauth2"
    ))
    || isLastStep;

  const SCOPES_BY_CAP = connector.capabilities.slice(0, 4).map(c => `read:${c}`);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
      <div style={{ ...card, width:560, maxHeight:"92vh", overflow:"auto", display:"flex", flexDirection:"column", gap:0 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <LogoTile color={connector.logoColor} initial={connector.logoInitial} size={44} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{connector.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>{connector.category} · {AUTH_LABELS[authType]}</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.muted, cursor:"pointer", fontSize:18, padding:"4px 8px" }}>✕</button>
        </div>

        {/* Step progress */}
        <div style={{ display:"flex", gap:0, marginBottom:24, position:"relative" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6, position:"relative" }}>
              {i > 0 && <div style={{ position:"absolute", top:11, right:"50%", width:"100%", height:2, background: i <= step ? C.purple : C.border }} />}
              <div style={{
                width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                background: i < step ? C.purple : i === step ? "transparent" : C.bg2,
                border: `2px solid ${i <= step ? C.purple : C.border}`,
                fontSize:10, fontWeight:800, color: i < step ? "#fff" : i === step ? C.purple : C.muted,
                zIndex:1, position:"relative",
              }}>
                {i < step ? "✓" : i + 1}
              </div>
              <div style={{ fontSize:9, fontWeight:700, color: i === step ? C.purple : C.muted, textAlign:"center", letterSpacing:"0.3px", textTransform:"uppercase" }}>{s.title}</div>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:14, minHeight:200 }}>
          {/* Step 0: Overview */}
          {step === 0 && (
            <>
              <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.08),rgba(59,130,246,0.06))", border:`1px solid rgba(167,139,250,0.2)`, borderRadius:10, padding:"16px 18px" }}>
                <div style={{ fontSize:12, color:C.text, lineHeight:1.7, marginBottom:12 }}>{connector.description}</div>
                <div style={{ fontSize:11, fontWeight:700, color:C.purple, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>What AIGO-X will collect</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {connector.capabilities.map(cap => (
                    <span key={cap} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:5, padding:"3px 9px", fontSize:10, fontWeight:600, color:C.accent }}>{cap.replace(/-/g," ")}</span>
                  ))}
                </div>
              </div>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10 }}>Prerequisites</div>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {authType === "oauth2" && [
                    "Admin access to create an OAuth application in your tenant",
                    `OAuth Redirect URI: ${window.location.origin}/oauth/callback/${connector.id}`,
                    "Required scopes will be shown in Step 2",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                  {authType === "api-key" && [
                    `Log in to your ${connector.name} admin console`,
                    "Navigate to Settings → API Keys / Integrations",
                    "Generate a new API key with read access to the required scopes",
                    "Copy the key — you won't be able to see it again",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                  {authType === "saml" && [
                    "Access to your Identity Provider admin console (Okta, Entra ID, etc.)",
                    "Permission to create a new SAML 2.0 application",
                    "Your IdP metadata XML (download from the IdP application settings)",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                  {authType === "certificate" && [
                    `Administrative credentials for ${connector.name}`,
                    "An X.509 client certificate (PEM format) for mutual TLS",
                    "Network access from AIGO-X servers to the target host",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                  {authType === "basic" && [
                    `A service account or read-only user in ${connector.name}`,
                    "The host/URL of your instance",
                    "Credentials will be stored AES-256-GCM encrypted",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                  {authType === "webhook" && [
                    `Ability to configure outbound webhooks in ${connector.name}`,
                    "The webhook URL will be generated in the next step",
                    "Signature verification uses HMAC-SHA256 (signing secret provided)",
                  ].map((item, i) => <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}><span style={{ color:C.green, flexShrink:0 }}>✓</span>{item}</div>)}
                </div>
              </div>
              <div style={{ background:"rgba(251,191,36,0.05)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:8, padding:"10px 14px", fontSize:11, color:C.warn }}>
                ⚠ AIGO-X stores all credentials AES-256-GCM encrypted at rest. Only read-only API scopes are required.
              </div>
            </>
          )}

          {/* Step 1: Auth config */}
          {step === 1 && authType === "api-key" && (
            <>
              <div>
                <label style={LBL}>API Key *</label>
                <input style={INP} type="password" value={form.apiKey} onChange={e=>upd("apiKey",e.target.value)}
                  placeholder={connector.id==="splunk"?"splunk-api-token-xxxx":connector.id==="tenable"?"xxxx-xxxx-xxxx":"your-api-key"} autoFocus />
                <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
                  Find this in {connector.name} → Settings → API Access / Integrations
                </div>
              </div>
              {["crowdstrike","sentinelone","carbon-black","falcon"].includes(connector.id) && (
                <div>
                  <label style={LBL}>Client ID</label>
                  <input style={INP} value={form.clientId} onChange={e=>upd("clientId",e.target.value)} placeholder="client-id-xxxx" />
                </div>
              )}
              {["qualys","tenable","rapid7"].includes(connector.id) && (
                <div>
                  <label style={LBL}>Platform URL</label>
                  <input style={INP} value={form.baseUrl} onChange={e=>upd("baseUrl",e.target.value)}
                    placeholder={connector.id==="qualys"?"https://qualysapi.qualys.com":connector.id==="rapid7"?"https://us.api.insight.rapid7.com":"https://cloud.tenable.com"} />
                </div>
              )}
              {["custom","bmc-remedy","jenkins"].includes(connector.id) && (
                <>
                  <div><label style={LBL}>Host / Base URL</label><input style={INP} value={form.baseUrl} onChange={e=>upd("baseUrl",e.target.value)} placeholder="https://your-instance.example.com" /></div>
                </>
              )}
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8 }}>Required API scopes</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {SCOPES_BY_CAP.map(s => <span key={s} style={{ background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, color:C.green }}>{s}</span>)}
                </div>
              </div>
            </>
          )}

          {step === 1 && authType === "oauth2" && (
            <>
              <div style={{ background:"rgba(147,197,253,0.06)", border:`1px solid rgba(147,197,253,0.2)`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:8 }}>Create an OAuth Application in {connector.name}</div>
                <ol style={{ fontSize:12, color:C.text, paddingLeft:18, lineHeight:2, margin:0 }}>
                  <li>Go to your {connector.name} developer/admin console</li>
                  <li>Create a new OAuth 2.0 application (Web Application type)</li>
                  <li>Set the redirect URI to: <code style={{ background:C.bg2, padding:"1px 5px", borderRadius:3, color:C.accent, fontSize:11 }}>{window.location.origin}/oauth/callback/{connector.id}</code></li>
                  <li>Copy the Client ID and Client Secret below</li>
                </ol>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={LBL}>Client ID *</label><input style={INP} value={form.clientId} onChange={e=>upd("clientId",e.target.value)} placeholder="client_id_xxxx" autoFocus /></div>
                <div><label style={LBL}>Client Secret *</label><input style={INP} type="password" value={form.clientSecret} onChange={e=>upd("clientSecret",e.target.value)} placeholder="••••••••••••" /></div>
              </div>
              {connector.id === "okta" && <div><label style={LBL}>Okta Domain</label><input style={INP} value={form.baseUrl} onChange={e=>upd("baseUrl",e.target.value)} placeholder="https://your-org.okta.com" /></div>}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>OAuth Scopes to request</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {SCOPES_BY_CAP.map(s => (
                    <label key={s} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", background:form.selectedScopes.includes(s)?"rgba(167,139,250,0.1)":"transparent", border:`1px solid ${form.selectedScopes.includes(s)?"rgba(167,139,250,0.3)":C.border}`, borderRadius:5, padding:"3px 9px", fontSize:10, color:form.selectedScopes.includes(s)?C.purple:C.muted }}>
                      <input type="checkbox" checked={form.selectedScopes.includes(s)} onChange={e=>upd("selectedScopes",e.target.checked?[...form.selectedScopes,s]:form.selectedScopes.filter(x=>x!==s))} style={{ margin:0 }} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && authType === "saml" && (
            <>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8 }}>AIGO-X Service Provider Details</div>
                {[
                  { label:"Entity ID (SP)", value:`https://aigo-x.io/saml/${connector.id}/metadata` },
                  { label:"ACS URL",        value:`https://aigo-x.io/saml/${connector.id}/acs` },
                  { label:"Name ID Format", value:"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" },
                ].map(row => (
                  <div key={row.label} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
                    <span style={{ fontSize:10, fontWeight:700, color:C.muted, width:140, flexShrink:0, paddingTop:3 }}>{row.label}</span>
                    <code style={{ fontSize:10, color:C.accent, fontFamily:"'JetBrains Mono', monospace", wordBreak:"break-all", flex:1, background:"transparent", border:"none" }}>{row.value}</code>
                    <button onClick={()=>navigator.clipboard?.writeText(row.value)} style={{ ...BTN(C.muted,"transparent",C.border), padding:"2px 8px", fontSize:9, flexShrink:0 }}>Copy</button>
                  </div>
                ))}
              </div>
              <div>
                <label style={LBL}>IdP Metadata XML *</label>
                <textarea style={{ ...INP, height:100, resize:"vertical" as const, fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}
                  value={form.metadataXml} onChange={e=>upd("metadataXml",e.target.value)}
                  placeholder={`<?xml version="1.0" encoding="UTF-8"?>\n<EntityDescriptor ...>`} autoFocus />
                <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Or fill in manually:</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={LBL}>Entity ID (IdP)</label><input style={INP} value={form.entityId} onChange={e=>upd("entityId",e.target.value)} placeholder="https://idp.example.com/saml2/idp/metadata.xml" /></div>
                <div><label style={LBL}>SSO URL</label><input style={INP} value={form.ssoUrl} onChange={e=>upd("ssoUrl",e.target.value)} placeholder="https://idp.example.com/saml2/idp/sso" /></div>
              </div>
            </>
          )}

          {step === 1 && authType === "certificate" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={LBL}>Host / IP *</label><input style={INP} value={form.host} onChange={e=>upd("host",e.target.value)} placeholder="pam.corp.example.com" autoFocus /></div>
                <div><label style={LBL}>Username</label><input style={INP} value={form.username} onChange={e=>upd("username",e.target.value)} placeholder="svc-aigo-readonly" /></div>
              </div>
              <div>
                <label style={LBL}>Certificate (PEM)</label>
                <textarea style={{ ...INP, height:90, resize:"vertical" as const, fontFamily:"'JetBrains Mono', monospace", fontSize:10 }}
                  value={form.certPem} onChange={e=>upd("certPem",e.target.value)}
                  placeholder={"-----BEGIN CERTIFICATE-----\nMIIBxxx...\n-----END CERTIFICATE-----"} />
              </div>
              <div>
                <label style={LBL}>Private Key (PEM)</label>
                <textarea style={{ ...INP, height:80, resize:"vertical" as const, fontFamily:"'JetBrains Mono', monospace", fontSize:10 }}
                  value={form.keyPem} onChange={e=>upd("keyPem",e.target.value)}
                  placeholder={"-----BEGIN RSA PRIVATE KEY-----\nMIIExx...\n-----END RSA PRIVATE KEY-----"} />
              </div>
            </>
          )}

          {step === 1 && authType === "basic" && (
            <>
              <div><label style={LBL}>Instance URL *</label><input style={INP} value={form.host} onChange={e=>upd("host",e.target.value)} placeholder="https://company.service-now.com" autoFocus /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={LBL}>Username</label><input style={INP} value={form.username} onChange={e=>upd("username",e.target.value)} placeholder="svc_aigo_read" /></div>
                <div><label style={LBL}>Password</label><input style={INP} type="password" value={form.password} onChange={e=>upd("password",e.target.value)} placeholder="••••••••••••" /></div>
              </div>
            </>
          )}

          {step === 1 && authType === "webhook" && (
            <>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:6 }}>AIGO-X Inbound Webhook URL</div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <code style={{ flex:1, fontSize:11, color:C.accent, fontFamily:"'JetBrains Mono', monospace", wordBreak:"break-all" }}>
                    {window.location.origin}/api/webhooks/inbound/{connector.id}
                  </code>
                  <button onClick={()=>navigator.clipboard?.writeText(`${window.location.origin}/api/webhooks/inbound/${connector.id}`)} style={{ ...BTN(C.muted,"transparent",C.border), padding:"4px 10px", fontSize:10, flexShrink:0 }}>Copy</button>
                </div>
                <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>Configure this URL in {connector.name} as the outbound webhook destination.</div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>Subscribe to events</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {["detection.summary","incident.notification","auth.activity","finding.created","user.created","policy.violated","asset.discovered","risk.changed"].map(evt=>(
                    <label key={evt} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", background:form.eventTypes.includes(evt)?"rgba(147,197,253,0.08)":"transparent", border:`1px solid ${form.eventTypes.includes(evt)?"rgba(147,197,253,0.25)":C.border}`, borderRadius:5, padding:"3px 9px", fontSize:10, color:form.eventTypes.includes(evt)?C.accent:C.muted }}>
                      <input type="checkbox" checked={form.eventTypes.includes(evt)} onChange={e=>upd("eventTypes",e.target.checked?[...form.eventTypes,evt]:form.eventTypes.filter(x=>x!==evt))} style={{ margin:0 }} />
                      {evt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:4 }}>Signing Secret (HMAC-SHA256)</div>
                <div style={{ background:C.bg2, borderRadius:6, padding:"8px 12px", fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:C.warn }}>
                  Will be generated after save — configure in {connector.name} to verify payloads.
                </div>
              </div>
            </>
          )}

          {/* OAuth Step 2: Authorize */}
          {step === 2 && authType === "oauth2" && (
            <>
              <div style={{ background:"linear-gradient(135deg,rgba(52,211,153,0.06),rgba(147,197,253,0.04))", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, padding:"18px" }}>
                <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:8 }}>Ready to authorize</div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                  Clicking "Authorize with {connector.name}" will open the OAuth consent screen. Sign in with an admin account that has the required read-only scopes.
                </div>
                <button style={{ ...BTN(C.green,"rgba(52,211,153,0.1)","rgba(52,211,153,0.3)"), fontSize:13, padding:"10px 20px" }}>
                  🔐 Authorize with {connector.name}
                </button>
              </div>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8 }}>Scopes being requested</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(form.selectedScopes.length > 0 ? form.selectedScopes : SCOPES_BY_CAP).map(s => (
                    <span key={s} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, color:C.accent }}>{s}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* SAML: Step 2 attribute mapping */}
          {step === 2 && authType === "saml" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>Map your IdP's attribute names to AIGO-X user fields. Leave blank to use defaults.</div>
              {[
                { label:"Email", placeholder:"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", hint:"Required" },
                { label:"Display Name", placeholder:"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", hint:"Optional" },
                { label:"Groups", placeholder:"http://schemas.xmlsoap.org/claims/Group", hint:"Optional — used for role mapping" },
              ].map(f=>(
                <div key={f.label}>
                  <label style={LBL}>{f.label} <span style={{ color:f.hint==="Required"?C.danger:C.muted, fontSize:9, fontWeight:600 }}>({f.hint})</span></label>
                  <input style={INP} placeholder={f.placeholder} />
                </div>
              ))}
            </div>
          )}

          {/* Verify & Save (last step) */}
          {isLastStep && (
            <>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10 }}>Connection Summary</div>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {[
                    { k:"Connector", v:connector.name },
                    { k:"Category", v:connector.category },
                    { k:"Auth Method", v:AUTH_LABELS[authType] },
                    { k:"Sync Schedule", v:"Hourly (0 */1 * * *)" },
                    { k:"Encryption", v:"AES-256-GCM at rest, TLS 1.3 in transit" },
                  ].map(row=>(
                    <div key={row.k} style={{ display:"flex", gap:12 }}>
                      <span style={{ fontSize:11, color:C.muted, width:120, flexShrink:0 }}>{row.k}</span>
                      <span style={{ fontSize:11, color:C.text, fontWeight:600 }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button onClick={handleTest} disabled={testing} style={{ ...BTN(C.accent,"rgba(147,197,253,0.08)","rgba(147,197,253,0.25)"), opacity:testing?0.6:1 }}>
                  {testing ? "⟳ Testing…" : "Test Connection"}
                </button>
                {testOk === true  && <span style={{ fontSize:12, color:C.green }}>✓ {testMsg}</span>}
                {testOk === false && <span style={{ fontSize:12, color:C.danger }}>✕ {testMsg}</span>}
              </div>
            </>
          )}
        </div>

        {/* Activation result */}
        {activateResult && (
          <div style={{ background:"linear-gradient(135deg,rgba(52,211,153,0.06),rgba(59,130,246,0.04))", border:"1px solid rgba(52,211,153,0.25)", borderRadius:12, padding:"20px 22px", marginTop:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(52,211,153,0.15)", border:"2px solid rgba(52,211,153,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:C.green, flexShrink:0 }}>✓</div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:C.green }}>Integration Activated</div>
                <div style={{ fontSize:11, color:C.muted }}>{connector.name} is connected · {activateResult.duration}ms · data flowing into GRC modules</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:14 }}>
              {[
                { label:"Risks",    val:activateResult.ingested?.risks,    color:C.danger },
                { label:"Findings", val:activateResult.ingested?.findings, color:C.warn },
                { label:"Controls", val:activateResult.ingested?.controls, color:C.accent },
                { label:"Tickets",  val:activateResult.ingested?.tickets,  color:C.purple },
                { label:"Assets",   val:activateResult.ingested?.assets,   color:C.green },
              ].map(x => (
                <div key={x.label} style={{ background:"var(--secondary)", borderRadius:8, padding:"10px 12px", border:`1px solid var(--border)`, textAlign:"center" as const }}>
                  <div style={{ fontSize:20, fontWeight:800, color:x.color, fontFamily:"'JetBrains Mono', monospace" }}>{x.val ?? 0}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase" as const, letterSpacing:"0.4px", marginTop:2 }}>{x.label}</div>
                </div>
              ))}
            </div>
            {activateResult.modules?.length > 0 && (
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const, marginBottom:10 }}>
                {activateResult.modules.map(m => (
                  <span key={m} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:5, padding:"3px 9px", fontSize:10, color:C.accent }}>→ {m}</span>
                ))}
              </div>
            )}
            {activateResult.sample?.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {activateResult.sample.map((s, i) => (
                  <div key={i} style={{ fontSize:11, color:C.muted, display:"flex", gap:8 }}>
                    <span style={{ color:C.green, flexShrink:0 }}>✓</span>{s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {activateResult ? (
          <div style={{ display:"flex", gap:10, marginTop:24, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
            <div style={{ flex:1 }} />
            <button onClick={()=>{ setActivateResult(null); onConnected(); }} style={{ ...BTN(C.green,"rgba(52,211,153,0.12)","rgba(52,211,153,0.35)"), fontSize:13, padding:"9px 24px" }}>
              ✓ Done — View Dashboard
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:10, marginTop:24, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
            {step > 0 && <button onClick={()=>setStep(s=>s-1)} style={BTN(C.muted,C.bg3,C.border)}>← Back</button>}
            <div style={{ flex:1 }} />
            <button onClick={onClose} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
            {isLastStep ? (
              <button onClick={handleSave} disabled={saving} style={{ ...BTN(C.green,"rgba(52,211,153,0.1)","rgba(52,211,153,0.3)"), opacity:saving?0.5:1 }}>
                {saving ? "⟳ Activating & ingesting data…" : existingConn ? "⟳ Sync Now" : "Activate Integration →"}
              </button>
            ) : (
              <button onClick={()=>setStep(s=>s+1)} disabled={!canProceed} style={{ ...BTN(C.accent,"rgba(147,197,253,0.1)","rgba(147,197,253,0.3)"), opacity:canProceed?1:0.4 }}>
                Continue →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main IntegrationsHub ───────────────────────────────────────────────────
export default function IntegrationsHub({ defaultSubTab }: { defaultSubTab?: string } = {}) {
  const [subTab, setSubTab]       = useState<"connected"|"marketplace"|"webhooks"|"pipeline">(
    (defaultSubTab as any) ?? "connected"
  );

  useEffect(() => {
    if (defaultSubTab && ["connected","marketplace","webhooks","pipeline"].includes(defaultSubTab)) {
      setSubTab(defaultSubTab as any);
    }
  }, [defaultSubTab]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [webhooks, setWebhooks]   = useState<any[]>([]);
  const [stats, setStats]         = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [pipeline, setPipeline]   = useState<any[]>([]);

  // Marketplace filters
  const [search, setSearch]       = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Connected tab filters
  const [connSearch, setConnSearch] = useState("");

  // Connector detail panel
  const [selectedConn, setSelectedConn] = useState<any|null>(null);

  // Disconnect confirmation
  const [confirmDisconn, setConfirmDisconn] = useState<any|null>(null);

  // Wizard
  const [wizard, setWizard]       = useState<{connector:any; existingConn:any|null}|null>(null);

  // Webhook modal
  const [showWH, setShowWH]       = useState(false);
  const [whForm, setWhForm]       = useState({ name:"", direction:"outbound", url:"", eventTypes:["risk.critical","finding.critical","incident.created"] });
  const [whSaving, setWhSaving]   = useState(false);
  const [expandedWh, setExpandedWh] = useState<string|null>(null);
  const [whLogs, setWhLogs]       = useState<Record<string,any[]>>({});

  // Syncing / disconnecting state
  const [syncing, setSyncing]     = useState<string|null>(null);
  const [disconnecting, setDisconnecting] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, connRes, statsRes, whRes, pipeRes] = await Promise.all([
      fetch(apiUrl("/integrations/connectors"), { headers: H() }).catch(()=>null),
      fetch(apiUrl("/integrations/connections"), { headers: H() }).catch(()=>null),
      fetch(apiUrl("/integrations/stats"), { headers: H() }).catch(()=>null),
      fetch(apiUrl("/integrations/webhooks"), { headers: H() }).catch(()=>null),
      fetch(apiUrl("/integrations/pipeline"), { headers: H() }).catch(()=>null),
    ]);
    if (cRes?.ok) setConnectors(await cRes.json());
    if (connRes?.ok) setConnections(await connRes.json());
    if (statsRes?.ok) setStats(await statsRes.json());
    if (whRes?.ok) setWebhooks(await whRes.json());
    if (pipeRes?.ok) setPipeline(await pipeRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async (connId: string) => {
    setSyncing(connId);
    await fetch(apiUrl(`/integrations/connections/${connId}/sync`), { method:"POST", headers:H() });
    await load();
    setSyncing(null);
  };

  const handleDisconnect = async (connId: string) => {
    setConfirmDisconn(null);
    setDisconnecting(connId);
    await fetch(apiUrl(`/integrations/connections/${connId}`), { method:"DELETE", headers:H() });
    setSelectedConn(null);
    await load();
    setDisconnecting(null);
  };

  const handleWizardDone = async () => {
    setWizard(null);
    await load();
  };

  const handleCreateWebhook = async () => {
    setWhSaving(true);
    await fetch(apiUrl("/integrations/webhooks"), { method:"POST", headers:H(), body:JSON.stringify(whForm) });
    setShowWH(false); setWhSaving(false);
    setWhForm({ name:"", direction:"outbound", url:"", eventTypes:["risk.critical","finding.critical","incident.created"] });
    await load();
  };

  const handleDeleteWebhook = async (id: string) => {
    await fetch(apiUrl(`/integrations/webhooks/${id}`), { method:"DELETE", headers:H() });
    await load();
  };

  const expandWebhook = async (id: string) => {
    if (expandedWh === id) { setExpandedWh(null); return; }
    setExpandedWh(id);
    if (!whLogs[id]) {
      const r = await fetch(apiUrl(`/integrations/webhooks/${id}/logs`), { headers:H() }).catch(()=>null);
      if (r?.ok) { const logs = await r.json(); setWhLogs(prev => ({...prev, [id]: logs})); }
    }
  };

  // Connected connectorIds set
  const connectedIds = new Set(connections.map(c => c.connectorId));

  // Filtered marketplace
  const filtered = connectors.filter(c => {
    const matchCat = catFilter === "All" || c.category === catFilter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.capabilities.some(cap => cap.includes(search.toLowerCase()));
    return matchCat && matchSearch;
  }).sort((a,b) => {
    const aConn = connectedIds.has(a.id) ? 2 : a.featured ? 1 : 0;
    const bConn = connectedIds.has(b.id) ? 2 : b.featured ? 1 : 0;
    return bConn - aConn;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Sub-tab pills */}
      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
        {([["connected","Connected","●"],["marketplace","Marketplace","◈"],["webhooks","Webhooks","⊕"],["pipeline","Pipeline","⟳"]] as const).map(([key,label,icon])=>(
          <button key={key} onClick={()=>setSubTab(key)} style={{
            padding:"7px 16px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit",
            border:`1px solid ${subTab===key?"rgba(147,197,253,0.4)":C.border}`,
            background:subTab===key?"rgba(147,197,253,0.08)":C.bg3,
            color:subTab===key?C.accent:C.muted,
            display:"flex", alignItems:"center", gap:6,
          }}>
            <span>{icon}</span>{label}
            {key==="connected" && stats && <span style={{ background:"rgba(52,211,153,0.15)", color:C.green, border:"1px solid rgba(52,211,153,0.3)", borderRadius:10, padding:"0 6px", fontSize:9, fontWeight:800 }}>{stats.connected}</span>}
            {key==="marketplace" && stats && <span style={{ background:"var(--border)", color:C.muted, borderRadius:10, padding:"0 6px", fontSize:9, fontWeight:700 }}>{stats.totalConnectors}</span>}
            {key==="webhooks" && webhooks.length > 0 && <span style={{ background:"rgba(167,139,250,0.15)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, padding:"0 6px", fontSize:9, fontWeight:800 }}>{webhooks.length}</span>}
            {key==="pipeline" && pipeline.length > 0 && <span style={{ background:"rgba(52,211,153,0.15)", color:C.green, border:"1px solid rgba(52,211,153,0.3)", borderRadius:10, padding:"0 6px", fontSize:9, fontWeight:800 }}>{pipeline.length}</span>}
          </button>
        ))}
        <div style={{ flex:1 }} />
        {subTab==="marketplace" && (
          <input style={{ ...INP, width:200 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search 103 connectors…" />
        )}
      </div>

      {/* ── CONNECTED ─────────────────────────────────────────────────────── */}
      {subTab==="connected" && (
        <>
          {/* Stats */}
          {stats && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              {[
                { label:"Total Connectors", value:stats.totalConnectors, color:C.accent },
                { label:"Connected",        value:stats.connected,       color:C.green },
                { label:"Partial / Warning",value:stats.partial+stats.warning, color:C.warn },
                { label:"Assets Ingested",  value:fmt(stats.totalAssetsIngested), color:C.purple },
                { label:"Events Ingested",  value:fmt(stats.totalEventsIngested), color:C.accent },
              ].map(k=>(
                <div key={k.label} style={{ ...card, padding:"12px 16px" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:4 }}>{k.label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono', monospace" }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar: search + add */}
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ position:"relative" as const, flex:1 }}>
              <span style={{ position:"absolute" as const, left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.muted, pointerEvents:"none" }}>🔍</span>
              <input
                value={connSearch} onChange={e=>setConnSearch(e.target.value)}
                placeholder="Search connected integrations by name or category…"
                style={{ ...INP, paddingLeft:32 }}
              />
            </div>
            <button
              onClick={()=>setSubTab("marketplace")}
              style={{ ...BTN(C.accent,"rgba(147,197,253,0.1)","rgba(147,197,253,0.3)"), padding:"9px 18px", fontSize:12, whiteSpace:"nowrap" as const, flexShrink:0 }}>
              + Add Connector
            </button>
          </div>

          {/* Connection cards */}
          {loading ? (
            <div style={{ textAlign:"center" as const, padding:"32px 0", color:C.muted }}>Loading connections…</div>
          ) : connections.length === 0 ? (
            <div style={{ ...card, textAlign:"center" as const, padding:"40px 0" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>◈</div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:8 }}>No integrations connected yet</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:18 }}>Browse the Marketplace to connect your first integration.</div>
              <button onClick={()=>setSubTab("marketplace")} style={{ ...BTN(C.accent,"rgba(147,197,253,0.1)","rgba(147,197,253,0.3)"), fontSize:13, padding:"10px 22px" }}>Browse Marketplace →</button>
            </div>
          ) : (() => {
            const filtered = connections.filter(conn => {
              if (!connSearch) return true;
              const q = connSearch.toLowerCase();
              return conn.connectorName?.toLowerCase().includes(q) || conn.category?.toLowerCase().includes(q) || conn.status?.toLowerCase().includes(q);
            });
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {filtered.length === 0 && (
                  <div style={{ ...card, textAlign:"center" as const, padding:"32px 0", color:C.muted }}>
                    No connectors match "{connSearch}"
                  </div>
                )}
                {filtered.map(conn => {
                  const def = connectors.find(c => c.id === conn.connectorId);
                  if (!def) return null;
                  const isSelected = selectedConn?.id === conn.id;
                  return (
                    <div key={conn.id}
                      onClick={() => setSelectedConn(isSelected ? null : { conn, def })}
                      style={{
                        ...card, padding:"14px 18px", display:"flex", alignItems:"center", gap:14,
                        cursor:"pointer", transition:"border-color 0.15s, box-shadow 0.15s",
                        borderColor: isSelected ? `${def.logoColor}55` : undefined,
                        boxShadow: isSelected ? `0 0 0 2px ${def.logoColor}22, 0 2px 16px rgba(0,0,0,0.45)` : undefined,
                      }}
                      onMouseEnter={e=>{ if(!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor=`${def.logoColor}44`; }}
                      onMouseLeave={e=>{ if(!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor=C.border; }}>
                      <LogoTile color={def.logoColor} initial={def.logoInitial} size={40} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{conn.connectorName}</span>
                          <StatusBadge status={conn.status} />
                          <span style={{ fontSize:10, color:C.muted, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px" }}>{conn.category}</span>
                        </div>
                        <div style={{ display:"flex", gap:16, fontSize:11, color:C.muted }}>
                          <span>Last sync: <strong style={{ color:C.text }}>{ago(conn.lastSync)}</strong></span>
                          <span>Assets: <strong style={{ color:C.accent }}>{fmt(conn.assetsIngested)}</strong></span>
                          <span>Events: <strong style={{ color:C.accent }}>{fmt(conn.eventsIngested)}</strong></span>
                          {conn.errorCount > 0 && <span style={{ color:C.danger }}>⚠ {conn.errorCount} error{conn.errorCount!==1?"s":""}</span>}
                        </div>
                        {conn.nextSync && (
                          <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>Next sync: {new Date(conn.nextSync).toLocaleTimeString()}</div>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>setWizard({connector:def, existingConn:conn})} style={BTN(C.accent,"rgba(147,197,253,0.06)","rgba(147,197,253,0.2)")}>Configure</button>
                        <button onClick={()=>handleSync(conn.id)} disabled={syncing===conn.id} style={{ ...BTN(C.green,"rgba(52,211,153,0.06)","rgba(52,211,153,0.2)"), opacity:syncing===conn.id?0.5:1 }}>
                          {syncing===conn.id ? "⟳ Syncing" : "Sync"}
                        </button>
                        <button
                          onClick={()=>setConfirmDisconn({ id:conn.id, name:conn.connectorName })}
                          disabled={disconnecting===conn.id}
                          style={{ ...BTN(C.danger,"rgba(239,68,68,0.06)","rgba(239,68,68,0.2)"), opacity:disconnecting===conn.id?0.5:1 }}>
                          {disconnecting===conn.id ? "…" : "Disconnect"}
                        </button>
                      </div>
                      <span style={{ fontSize:10, color:C.muted, flexShrink:0, paddingLeft:4 }}>{isSelected?"▲":"▼"}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Connector detail panel */}
          {selectedConn && (() => {
            const { conn, def } = selectedConn;
            const authType = def.authType ?? "api-key";
            const steps = WIZARD_STEPS[authType] ?? WIZARD_STEPS["api-key"];
            return (
              <div style={{ ...card, padding:0, overflow:"hidden", borderColor:`${def.logoColor}33` }}>
                {/* Panel header */}
                <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:14, background:`${def.logoColor}08` }}>
                  <LogoTile color={def.logoColor} initial={def.logoInitial} size={48} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                      <span style={{ fontSize:16, fontWeight:800, color:C.text }}>{def.name}</span>
                      <StatusBadge status={conn.status} />
                    </div>
                    <div style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>{def.description}</div>
                  </div>
                  <button onClick={()=>setSelectedConn(null)} style={{ background:"transparent", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:"4px 8px", lineHeight:1 }}>✕</button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0, borderBottom:`1px solid ${C.border}` }}>
                  {[
                    { label:"Auth Method",     value:AUTH_LABELS[authType] ?? authType },
                    { label:"Sync Schedule",   value:"Every hour" },
                    { label:"Last Sync",       value:ago(conn.lastSync) },
                    { label:"Assets Ingested", value:fmt(conn.assetsIngested) },
                    { label:"Events Ingested", value:fmt(conn.eventsIngested) },
                    { label:"Error Count",     value:conn.errorCount ?? 0 },
                  ].map((m,i) => (
                    <div key={m.label} style={{ padding:"12px 18px", borderRight: i%3!==2 ? `1px solid ${C.border}` : "none", borderBottom: i<3 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:C.muted, textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:3 }}>{m.label}</div>
                      <div style={{ fontSize:14, fontWeight:800, color: m.label==="Error Count"&&(m.value as number)>0 ? C.danger : C.text, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0, borderBottom:`1px solid ${C.border}` }}>
                  {/* Capabilities */}
                  <div style={{ padding:"16px 20px", borderRight:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Data collected</div>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                      {def.capabilities?.map(cap => (
                        <span key={cap} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:5, padding:"3px 9px", fontSize:10, fontWeight:600, color:C.accent }}>
                          {cap.replace(/-/g," ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* GRC modules this feeds */}
                  <div style={{ padding:"16px 20px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.purple, marginBottom:10, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Feeds into GRC modules</div>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                      {(def.grcModules ?? ["GovOps","RiskOps","ComplianceOps","SecOps"]).map(m => (
                        <span key={m} style={{ background:"rgba(167,139,250,0.08)", border:"1px solid rgba(167,139,250,0.2)", borderRadius:5, padding:"3px 9px", fontSize:10, fontWeight:600, color:C.purple }}>→ {m}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Setup steps */}
                <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:12, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Connection steps</div>
                  <div style={{ display:"flex", gap:0, position:"relative" as const }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column" as const, alignItems:"center", gap:6, position:"relative" as const }}>
                        {i > 0 && <div style={{ position:"absolute" as const, top:11, right:"50%", width:"100%", height:2, background:C.purple }} />}
                        <div style={{
                          width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                          background:C.purple, fontSize:10, fontWeight:800, color:"#fff", zIndex:1, position:"relative" as const,
                        }}>✓</div>
                        <div style={{ fontSize:9, fontWeight:700, color:C.purple, textAlign:"center" as const, letterSpacing:"0.3px", textTransform:"uppercase" as const }}>{s.title}</div>
                        <div style={{ fontSize:9, color:C.muted, textAlign:"center" as const, lineHeight:1.4, paddingInline:4 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel action buttons */}
                <div style={{ padding:"14px 20px", display:"flex", gap:10, alignItems:"center" }}>
                  <button onClick={()=>setWizard({connector:def, existingConn:conn})} style={{ ...BTN(C.accent,"rgba(147,197,253,0.08)","rgba(147,197,253,0.25)"), fontSize:13, padding:"9px 20px" }}>
                    ⚙ Configure / Reconfigure
                  </button>
                  <button onClick={()=>handleSync(conn.id)} disabled={syncing===conn.id} style={{ ...BTN(C.green,"rgba(52,211,153,0.08)","rgba(52,211,153,0.25)"), fontSize:13, padding:"9px 20px", opacity:syncing===conn.id?0.5:1 }}>
                    {syncing===conn.id ? "⟳ Syncing…" : "⟳ Sync Now"}
                  </button>
                  <div style={{ flex:1 }} />
                  <button onClick={()=>setConfirmDisconn({ id:conn.id, name:conn.connectorName })} style={{ ...BTN(C.danger,"rgba(239,68,68,0.06)","rgba(239,68,68,0.2)"), fontSize:13, padding:"9px 20px" }}>
                    Disconnect
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── MARKETPLACE ───────────────────────────────────────────────────── */}
      {subTab==="marketplace" && (
        <>
          {/* Category pills */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={()=>setCatFilter(cat)} style={{
                padding:"5px 12px", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit",
                border:`1px solid ${catFilter===cat?"rgba(147,197,253,0.4)":C.border}`,
                background:catFilter===cat?"rgba(147,197,253,0.1)":C.bg3,
                color:catFilter===cat?C.accent:C.muted,
              }}>{cat}</button>
            ))}
          </div>

          {/* Results count */}
          <div style={{ fontSize:12, color:C.muted }}>
            Showing <strong style={{ color:C.text }}>{filtered.length}</strong> connector{filtered.length!==1?"s":""} {catFilter!=="All"&&`in ${catFilter}`} {search&&`matching "${search}"`}
          </div>

          {/* Connector cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            {filtered.map(def => {
              const isConn = connectedIds.has(def.id);
              return (
                <div key={def.id} style={{
                  background:C.bg, border:`1px solid ${isConn?"rgba(52,211,153,0.25)":C.border}`,
                  borderRadius:12, padding:"16px", display:"flex", flexDirection:"column", gap:10,
                  transition:"border-color 0.15s", cursor:"pointer",
                  position:"relative" as const,
                }}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=isConn?"rgba(52,211,153,0.5)":def.logoColor+"50")}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=isConn?"rgba(52,211,153,0.25)":C.border)}
                >
                  {def.featured && !isConn && (
                    <div style={{ position:"absolute", top:10, right:10, background:"rgba(167,139,250,0.12)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>FEATURED</div>
                  )}
                  {isConn && (
                    <div style={{ position:"absolute", top:10, right:10, background:"rgba(52,211,153,0.12)", color:C.green, border:"1px solid rgba(52,211,153,0.3)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>✓ CONNECTED</div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <LogoTile color={def.logoColor} initial={def.logoInitial} size={36} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3 }}>{def.name}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{def.category} · {AUTH_LABELS[def.authType]}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{def.description}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const }}>
                    {def.capabilities.slice(0,3).map(cap => (
                      <span key={cap} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:600, color:C.muted }}>{cap.replace(/-/g," ")}</span>
                    ))}
                    {def.capabilities.length > 3 && <span style={{ fontSize:9, color:C.muted }}>+{def.capabilities.length-3}</span>}
                  </div>
                  <button
                    onClick={()=>setWizard({connector:def, existingConn:null})}
                    style={{ ...BTN(isConn?C.green:def.logoColor, isConn?`rgba(52,211,153,0.1)`:`${def.logoColor}14`, isConn?`rgba(52,211,153,0.3)`:`${def.logoColor}40`), width:"100%", textAlign:"center" as const, marginTop:"auto" }}
                  >
                    {isConn ? "✓ Reconfigure" : "+ Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── WEBHOOKS ──────────────────────────────────────────────────────── */}
      {subTab==="webhooks" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontSize:12, color:C.muted }}>Manage inbound and outbound webhook endpoints. HMAC-SHA256 signatures are verified automatically.</div>
            <button onClick={()=>setShowWH(true)} style={BTN(C.green,"rgba(52,211,153,0.08)","rgba(52,211,153,0.25)")}>+ New Webhook</button>
          </div>

          {/* Webhook cards */}
          {webhooks.length === 0 ? (
            <div style={{ ...card, textAlign:"center" as const, padding:"32px 0" }}>
              <div style={{ fontSize:13, color:C.muted }}>No webhooks configured yet.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {webhooks.map(wh => (
                <div key={wh.id} style={{ ...card, padding:0, overflow:"hidden" }}>
                  <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:wh.direction==="inbound"?"rgba(52,211,153,0.1)":"rgba(147,197,253,0.1)", border:`1px solid ${wh.direction==="inbound"?"rgba(52,211,153,0.3)":"rgba(147,197,253,0.3)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:wh.direction==="inbound"?C.green:C.accent, flexShrink:0 }}>
                      {wh.direction==="inbound" ? "↓" : "↑"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontWeight:700, color:C.text, fontSize:13 }}>{wh.name}</span>
                        <span style={{ background:wh.direction==="inbound"?"rgba(52,211,153,0.1)":"rgba(147,197,253,0.1)", color:wh.direction==="inbound"?C.green:C.accent, border:`1px solid ${wh.direction==="inbound"?"rgba(52,211,153,0.3)":"rgba(147,197,253,0.3)"}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700, textTransform:"uppercase" as const }}>{wh.direction}</span>
                        <span style={{ background:wh.active?"rgba(52,211,153,0.1)":"rgba(239,68,68,0.1)", color:wh.active?C.green:C.danger, border:`1px solid ${wh.active?"rgba(52,211,153,0.3)":"rgba(239,68,68,0.3)"}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{wh.active?"ACTIVE":"PAUSED"}</span>
                      </div>
                      <code style={{ fontSize:11, color:C.muted, fontFamily:"'JetBrains Mono', monospace" }}>{wh.url}</code>
                      <div style={{ display:"flex", gap:4, marginTop:5, flexWrap:"wrap" as const }}>
                        {wh.eventTypes.map(e=><span key={e} style={{ background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.15)", borderRadius:4, padding:"1px 6px", fontSize:9, color:C.muted }}>{e}</span>)}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>expandWebhook(wh.id)} style={BTN(C.accent,"rgba(147,197,253,0.06)","rgba(147,197,253,0.2)")}>
                        {expandedWh===wh.id ? "▲ Logs" : "▼ Logs"}
                      </button>
                      <button onClick={()=>handleDeleteWebhook(wh.id)} style={BTN(C.danger,"rgba(239,68,68,0.06)","rgba(239,68,68,0.2)")}>Delete</button>
                    </div>
                  </div>

                  {/* Delivery logs */}
                  {expandedWh===wh.id && (
                    <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 18px" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10 }}>Delivery Log (last 20 events)</div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:8 }}>
                        Signing Secret: <code style={{ color:C.warn, fontFamily:"'JetBrains Mono', monospace" }}>{wh.signingSecret?.slice(0,12)}•••••</code>
                      </div>
                      {(whLogs[wh.id] ?? []).length === 0 ? (
                        <div style={{ color:C.muted, fontSize:12 }}>No delivery logs yet.</div>
                      ) : (
                        <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                          <thead>
                            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                              {["Timestamp","Event","Status","Latency","Result"].map(h=>(
                                <th key={h} style={{ padding:"4px 8px", textAlign:"left" as const, color:C.muted, fontWeight:700, fontSize:10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(whLogs[wh.id] ?? []).map((log,i)=>(
                              <tr key={log.id} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?"transparent":C.bg3 }}>
                                <td style={{ padding:"5px 8px", color:C.muted, fontFamily:"'JetBrains Mono', monospace", fontSize:10 }}>{new Date(log.ts).toLocaleTimeString()}</td>
                                <td style={{ padding:"5px 8px", color:C.text }}>{log.event}</td>
                                <td style={{ padding:"5px 8px" }}>
                                  <span style={{ color:log.statusCode<400?C.green:C.danger, fontFamily:"'JetBrains Mono', monospace", fontWeight:700 }}>{log.statusCode}</span>
                                </td>
                                <td style={{ padding:"5px 8px", color:C.muted, fontFamily:"'JetBrains Mono', monospace" }}>{log.latencyMs}ms</td>
                                <td style={{ padding:"5px 8px" }}>
                                  <span style={{ color:log.success?C.green:C.danger, fontWeight:700, fontSize:10 }}>{log.success?"✓ OK":"✕ FAIL"}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PIPELINE ──────────────────────────────────────────────────────── */}
      {subTab==="pipeline" && (
        <>
          {/* Cumulative counts */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
            {[
              { label:"Risks Created",      value:pipeline.reduce((s,e)=>s+(e.ingested?.risks??0),0),    color:C.danger },
              { label:"Findings Ingested",  value:pipeline.reduce((s,e)=>s+(e.ingested?.findings??0),0), color:C.warn },
              { label:"Controls Updated",   value:pipeline.reduce((s,e)=>s+(e.ingested?.controls??0),0), color:C.accent },
              { label:"Tickets Opened",     value:pipeline.reduce((s,e)=>s+(e.ingested?.tickets??0),0),  color:C.purple },
              { label:"Assets Discovered",  value:pipeline.reduce((s,e)=>s+(e.ingested?.assets??0),0),   color:C.green },
            ].map(k=>(
              <div key={k.label} style={{ ...card, padding:"12px 16px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono', monospace" }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Event log */}
          {pipeline.length === 0 ? (
            <div style={{ ...card, textAlign:"center" as const, padding:"40px 0" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>◎</div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:8 }}>No ingestion events yet</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:18 }}>Connect an integration and click "Sync" — data will flow here in real time.</div>
              <button onClick={()=>setSubTab("marketplace")} style={{ ...BTN(C.accent,"rgba(147,197,253,0.1)","rgba(147,197,253,0.3)"), fontSize:13, padding:"10px 22px" }}>Browse Marketplace →</button>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pipeline.map(event => {
                const def = connectors.find(c => c.id === event.connectorId);
                const total = (event.ingested?.risks??0)+(event.ingested?.findings??0)+(event.ingested?.controls??0)+(event.ingested?.tickets??0)+(event.ingested?.assets??0);
                return (
                  <div key={event.id} style={{ ...card, padding:"14px 18px" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      {def && <LogoTile color={def.logoColor} initial={def.logoInitial} size={38} />}
                      {!def && <div style={{ width:38, height:38, borderRadius:10, background:"var(--secondary)", border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:C.muted }}>◎</div>}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" as const }}>
                          <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{event.connectorName}</span>
                          <span style={{
                            background:event.status==="success"?"rgba(52,211,153,0.1)":event.status==="failed"?"rgba(239,68,68,0.1)":"rgba(251,191,36,0.1)",
                            color:event.status==="success"?C.green:event.status==="failed"?C.danger:C.warn,
                            border:`1px solid ${event.status==="success"?"rgba(52,211,153,0.3)":event.status==="failed"?"rgba(239,68,68,0.3)":"rgba(251,191,36,0.3)"}`,
                            borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700, textTransform:"uppercase" as const,
                          }}>
                            {event.status==="success"?"✓ Success":event.status==="partial"?"◐ Partial":"✕ Failed"}
                          </span>
                          <span style={{ fontSize:10, color:C.muted }}>{ago(event.ts)}</span>
                          <span style={{ fontSize:10, color:C.muted, fontFamily:"'JetBrains Mono', monospace" }}>{event.duration}ms</span>
                        </div>

                        {/* Data counts row */}
                        <div style={{ display:"flex", gap:12, fontSize:11, marginBottom:7, flexWrap:"wrap" as const }}>
                          {(event.ingested?.risks??0) > 0    && <span style={{ color:C.muted }}>⚠ <strong style={{ color:C.danger }}>{event.ingested.risks}</strong> risks</span>}
                          {(event.ingested?.findings??0) > 0 && <span style={{ color:C.muted }}>◎ <strong style={{ color:C.warn }}>{event.ingested.findings}</strong> findings</span>}
                          {(event.ingested?.controls??0) > 0 && <span style={{ color:C.muted }}>✓ <strong style={{ color:C.accent }}>{event.ingested.controls}</strong> controls</span>}
                          {(event.ingested?.tickets??0) > 0  && <span style={{ color:C.muted }}>◈ <strong style={{ color:C.purple }}>{event.ingested.tickets}</strong> tickets</span>}
                          {(event.ingested?.assets??0) > 0   && <span style={{ color:C.muted }}>▣ <strong style={{ color:C.green }}>{event.ingested.assets}</strong> assets</span>}
                          {total === 0 && <span style={{ color:C.muted, fontStyle:"italic" as const }}>No data ingested</span>}
                        </div>

                        {/* Modules */}
                        {event.modules?.length > 0 && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const, marginBottom:7 }}>
                            {event.modules.map(m => (
                              <span key={m} style={{ background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.15)", borderRadius:4, padding:"2px 8px", fontSize:9, color:C.accent }}>→ {m}</span>
                            ))}
                          </div>
                        )}

                        {/* Sample */}
                        {event.sample?.length > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            {event.sample.map((s, si) => (
                              <div key={si} style={{ fontSize:10, color:C.muted, display:"flex", gap:6, alignItems:"flex-start" }}>
                                <span style={{ color:C.green, flexShrink:0, marginTop:1 }}>✓</span>
                                <span>{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Disconnect Confirmation Modal ────────────────────────────────── */}
      {confirmDisconn && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000 }}>
          <div style={{ ...card, width:420, padding:"28px 28px 22px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <div style={{ width:42, height:42, borderRadius:"50%", background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.35)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:C.danger, flexShrink:0 }}>⚠</div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:2 }}>Disconnect integration?</div>
                <div style={{ fontSize:12, color:C.muted }}>This will remove the connection to <strong style={{ color:C.text }}>{confirmDisconn.name}</strong>.</div>
              </div>
            </div>
            <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:18 }}>
              <div style={{ fontSize:11, color:C.muted, lineHeight:1.6 }}>
                Any data that was ingested from this connector will remain in the platform. You can reconnect at any time from the Marketplace.
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>setConfirmDisconn(null)} style={{ ...BTN(C.muted,C.bg3,C.border), padding:"9px 20px" }}>Cancel</button>
              <button onClick={()=>handleDisconnect(confirmDisconn.id)} style={{ ...BTN(C.danger,"rgba(239,68,68,0.1)","rgba(239,68,68,0.35)"), padding:"9px 20px" }}>Disconnect</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup Wizard Modal ───────────────────────────────────────────── */}
      {wizard && (
        <SetupWizard
          connector={wizard.connector}
          existingConn={wizard.existingConn}
          onClose={()=>setWizard(null)}
          onConnected={handleWizardDone}
        />
      )}

      {/* ── Create Webhook Modal ─────────────────────────────────────────── */}
      {showWH && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
          <div style={{ ...card, width:500 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.purple, marginBottom:18 }}>⊕ New Webhook</div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div><label style={LBL}>Name</label><input style={INP} value={whForm.name} onChange={e=>setWhForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Jira Issue Creator" autoFocus /></div>
              <div>
                <label style={LBL}>Direction</label>
                <div style={{ display:"flex", gap:8 }}>
                  {["inbound","outbound"].map(d=>(
                    <button key={d} onClick={()=>setWhForm(f=>({...f,direction:d}))} style={{
                      flex:1, padding:"8px", borderRadius:7, cursor:"pointer", fontFamily:"inherit",
                      border:`1px solid ${whForm.direction===d?"rgba(147,197,253,0.4)":C.border}`,
                      background:whForm.direction===d?"rgba(147,197,253,0.08)":C.bg3,
                      color:whForm.direction===d?C.accent:C.muted, fontWeight:700, fontSize:12,
                    }}>
                      {d==="inbound"?"↓ Inbound (receive events)":"↑ Outbound (send events)"}
                    </button>
                  ))}
                </div>
              </div>
              {whForm.direction==="outbound" && (
                <div><label style={LBL}>Target URL</label><input style={INP} value={whForm.url} onChange={e=>setWhForm(f=>({...f,url:e.target.value}))} placeholder="https://hooks.example.com/events" /></div>
              )}
              <div>
                <label style={LBL}>Event Types</label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                  {["risk.critical","risk.changed","finding.critical","finding.created","incident.created","user.created","policy.violated","asset.discovered"].map(evt=>(
                    <label key={evt} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", background:whForm.eventTypes.includes(evt)?"rgba(147,197,253,0.08)":"transparent", border:`1px solid ${whForm.eventTypes.includes(evt)?"rgba(147,197,253,0.25)":C.border}`, borderRadius:5, padding:"3px 9px", fontSize:10, color:whForm.eventTypes.includes(evt)?C.accent:C.muted }}>
                      <input type="checkbox" checked={whForm.eventTypes.includes(evt)} onChange={e=>setWhForm(f=>({...f,eventTypes:e.target.checked?[...f.eventTypes,evt]:f.eventTypes.filter(x=>x!==evt)}))} style={{ margin:0 }} />
                      {evt}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={handleCreateWebhook} disabled={whSaving||!whForm.name.trim()} style={{ ...BTN(C.purple,"rgba(167,139,250,0.1)","rgba(167,139,250,0.3)"), flex:1, opacity:whSaving?0.5:1 }}>
                {whSaving?"Creating…":"Create Webhook"}
              </button>
              <button onClick={()=>setShowWH(false)} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
