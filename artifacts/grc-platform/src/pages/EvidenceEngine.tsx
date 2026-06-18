import React, { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/grc-platform", "");
const api = (p: string) => `${BASE}/api${p}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Integration {
  id: string; name: string; category: string; icon: string;
  checksTotal: number; checksPassing: number; controlsCovered: number;
  status: "connected" | "disconnected" | "warning" | "simulated";
  credentialMode?: "connected" | "simulated";
  lastSync: string; description: string;
}

interface Check {
  id: string; integrationId: string; name: string;
  frameworks: string[]; control: string; category: string;
  status: "pass" | "fail" | "warning" | "not-run";
  lastRun: string; evidence: string;
}

interface Run {
  id: string; timestamp: string; duration: string;
  total: number; passed: number; failed: number; warnings: number;
  triggeredBy: string;
}

interface Coverage {
  overall: { covered: number; total: number; pct: number };
  byFramework: { framework: string; covered: number; total: number; pct: number }[];
}

interface CredentialStatus {
  configured: boolean;
  mode: "live" | "simulated";
  detail: string;
}

interface CredentialsState {
  github: CredentialStatus;
  aws: CredentialStatus;
  okta: CredentialStatus;
}

interface TestResult {
  ok: boolean;
  accountName?: string;
  detail: string;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const EME = "#059669", AMB = "#D97706", RED = "#DC2626", BLU = "#3B82F6";

const statusColor = (s: string) =>
  s === "pass" ? EME : s === "fail" ? RED : s === "warning" ? AMB : "var(--muted-foreground)";
const statusBg = (s: string) =>
  s === "pass" ? "rgba(5,150,105,0.1)" : s === "fail" ? "rgba(220,38,38,0.1)" : s === "warning" ? "rgba(217,119,6,0.1)" : "var(--secondary)";
const statusLabel = (s: string) =>
  s === "pass" ? "Pass" : s === "fail" ? "Fail" : s === "warning" ? "Warning" : "Not Run";
const statusIcon = (s: string) =>
  s === "pass" ? "✓" : s === "fail" ? "✕" : s === "warning" ? "⚠" : "–";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? "var(--foreground)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusDot({ status }: { status: Integration["status"] }) {
  const c = status === "connected" ? EME : status === "warning" ? AMB : status === "simulated" ? AMB : "var(--muted-foreground)";
  return (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: status === "connected" ? `0 0 6px ${c}` : undefined }} />
  );
}

function DonutChart({ pct, size = 80, color = BLU }: { pct: number; size?: number; color?: string }) {
  const r = (size - 10) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: size > 90 ? 18 : 13, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</div>
      </div>
    </div>
  );
}

// ── Credential card ───────────────────────────────────────────────────────────

const CRED_META: Record<string, {
  icon: string; name: string; color: string;
  secrets: { key: string; label: string; required: boolean; placeholder?: string }[];
  docsUrl: string; docsLabel: string;
  permissions: string[];
}> = {
  github: {
    icon: "🐱", name: "GitHub", color: "#1a1a2e",
    secrets: [
      { key: "GITHUB_TOKEN", label: "Personal Access Token (classic)", required: true, placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx" },
    ],
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
    docsLabel: "GitHub token docs",
    permissions: ["repo", "read:org", "read:user", "security_events"],
  },
  aws: {
    icon: "☁️", name: "AWS", color: "#FF9900",
    secrets: [
      { key: "AWS_ACCESS_KEY_ID",     label: "Access Key ID",     required: true,  placeholder: "AKIA..." },
      { key: "AWS_SECRET_ACCESS_KEY", label: "Secret Access Key", required: true,  placeholder: "wJalrXUtn..." },
      { key: "AWS_DEFAULT_REGION",    label: "Default Region",    required: false, placeholder: "us-east-1" },
    ],
    docsUrl: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
    docsLabel: "AWS access key docs",
    permissions: ["iam:GetAccountSummary", "iam:GenerateCredentialReport", "iam:GetCredentialReport", "iam:ListVirtualMFADevices", "s3:GetAccountPublicAccessBlock", "sts:GetCallerIdentity"],
  },
  okta: {
    icon: "🔐", name: "Okta", color: "#007DC1",
    secrets: [
      { key: "OKTA_DOMAIN",    label: "Okta Domain",    required: true, placeholder: "yourdomain.okta.com" },
      { key: "OKTA_API_TOKEN", label: "API Token (SSWS)", required: true, placeholder: "00xxxxxxxxxxxx..." },
    ],
    docsUrl: "https://developer.okta.com/docs/guides/create-an-api-token/main/",
    docsLabel: "Okta API token docs",
    permissions: ["policies:read", "users:read", "groups:read", "org:read"],
  },
};

interface CredentialCardProps {
  id: "github" | "aws" | "okta";
  status: CredentialStatus;
  testResult: TestResult | null;
  testing: boolean;
  onTest: () => void;
}

function CredentialCard({ id, status, testResult, testing, onTest }: CredentialCardProps) {
  const meta = CRED_META[id];
  const isLive = status.mode === "live";

  return (
    <div style={{
      background: "var(--card)", border: `1px solid ${isLive ? "rgba(5,150,105,0.35)" : "var(--border)"}`,
      borderRadius: 12, padding: "20px 24px",
      boxShadow: isLive ? "0 0 0 1px rgba(5,150,105,0.1) inset" : undefined,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>{meta.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>{meta.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Evidence collector</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isLive ? (
            <span style={{ background: "rgba(5,150,105,0.12)", color: EME, border: "1px solid rgba(5,150,105,0.3)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
              ● LIVE
            </span>
          ) : (
            <span style={{ background: "rgba(217,119,6,0.1)", color: AMB, border: "1px solid rgba(217,119,6,0.3)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
              ◐ SIMULATED
            </span>
          )}
        </div>
      </div>

      {/* Status detail */}
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
        {status.detail}
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          background: testResult.ok ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)",
          border: `1px solid ${testResult.ok ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)"}`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: testResult.ok ? EME : RED, marginBottom: 4 }}>
            {testResult.ok ? "✓ Connection successful" : "✕ Connection failed"}
            {testResult.accountName && <span style={{ fontWeight: 400, color: "var(--foreground)", marginLeft: 6 }}>— {testResult.accountName}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{testResult.detail}</div>
        </div>
      )}

      {/* Setup instructions (only when simulated) */}
      {!isLive && (
        <div style={{ background: "var(--secondary)", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Setup — add these to Replit Secrets
          </div>
          {meta.secrets.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <code style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: BLU, whiteSpace: "nowrap" }}>
                {s.key}
              </code>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{s.label}{!s.required && " (optional)"}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            Required scopes / permissions:{" "}
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{meta.permissions.join(", ")}</span>
          </div>
          <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: BLU, textDecoration: "none" }}>
            ↗ {meta.docsLabel}
          </a>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onTest} disabled={testing || !isLive}
          style={{
            padding: "7px 14px", background: isLive ? "rgba(59,130,246,0.1)" : "var(--secondary)",
            border: `1px solid ${isLive ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
            borderRadius: 7, color: isLive ? BLU : "var(--muted-foreground)",
            cursor: (testing || !isLive) ? "not-allowed" : "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: (testing || !isLive) ? 0.6 : 1,
          }}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {!isLive && (
          <span style={{ fontSize: 11, color: "var(--muted-foreground)", alignSelf: "center" }}>
            Add secrets in the Replit Secrets panel, then reload.
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface AlertSettings {
  enabled: boolean;
  alertOnFailed: boolean;
  alertOnStale: boolean;
  minFailedCount: number;
  slackWebhookUrl: string | null;
  emailRecipients: string[];
}

interface AlertHistoryRow {
  id: number;
  runId: string;
  channel: string;
  destination: string;
  failedCount: number;
  staleCount: number;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function EvidenceEngine() {
  const [tab, setTab] = useState<"overview" | "checks" | "integrations" | "credentials" | "runs" | "alerts">("overview");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult | null>>({ github: null, aws: null, okta: null });
  const [testing, setTesting] = useState<Record<string, boolean>>({ github: false, aws: false, okta: false });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selIntegration, setSelIntegration] = useState<string>("all");
  const [checkStatus, setCheckStatus] = useState<string>("all");
  const [checkSearch, setCheckSearch] = useState("");
  const [selIntDetail, setSelIntDetail] = useState<Integration | null>(null);

  // ── Alert settings state ────────────────────────────────────────────────────
  const [alertSettings, setAlertSettings] = useState<AlertSettings>({
    enabled: false, alertOnFailed: true, alertOnStale: false,
    minFailedCount: 1, slackWebhookUrl: null, emailRecipients: [],
  });
  const [alertHistory, setAlertHistory] = useState<AlertHistoryRow[]>([]);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaveMsg, setAlertSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [alertTesting, setAlertTesting] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const token = localStorage.getItem("grc_token");
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(api("/evidence-engine/integrations"), { headers }).then(r => r.json()),
      fetch(api("/evidence-engine/checks"), { headers }).then(r => r.json()),
      fetch(api("/evidence-engine/runs"), { headers }).then(r => r.json()),
      fetch(api("/evidence-engine/coverage"), { headers }).then(r => r.json()),
      fetch(api("/evidence/credentials"), { headers }).then(r => r.json()).catch(() => null),
    ]).then(([ints, chks, rs, cov, creds]) => {
      setIntegrations(ints);
      setChecks(chks);
      setRuns(rs);
      setCoverage(cov);
      if (creds && !creds.error) setCredentials(creds);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "alerts") return;
    Promise.all([
      fetch(api("/evidence/alerts/settings"), { headers }).then(r => r.ok ? r.json() : null),
      fetch(api("/evidence/alerts/history"), { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([s, h]) => {
      if (s) setAlertSettings(s);
      if (Array.isArray(h)) setAlertHistory(h);
    }).catch(console.error);
  }, [tab]);

  async function triggerRun() {
    setRunning(true);
    try {
      const r = await fetch(api("/evidence-engine/run"), { method: "POST", headers });
      const run = await r.json();
      setRuns(prev => [run, ...prev]);
    } finally {
      setRunning(false);
    }
  }

  async function testConnection(integration: "github" | "aws" | "okta") {
    setTesting(prev => ({ ...prev, [integration]: true }));
    try {
      const r = await fetch(api(`/evidence/credentials/test/${integration}`), { method: "POST", headers });
      const result: TestResult = await r.json();
      setTestResults(prev => ({ ...prev, [integration]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [integration]: { ok: false, detail: String(err) } }));
    } finally {
      setTesting(prev => ({ ...prev, [integration]: false }));
    }
  }

  async function saveAlertSettings() {
    setAlertSaving(true);
    setAlertSaveMsg(null);
    try {
      const r = await fetch(api("/evidence/alerts/settings"), {
        method: "PUT", headers, body: JSON.stringify(alertSettings),
      });
      if (r.ok) {
        const updated = await r.json();
        setAlertSettings(updated);
        setAlertSaveMsg({ ok: true, text: "Settings saved." });
      } else {
        const e = await r.json();
        setAlertSaveMsg({ ok: false, text: e.error ?? "Save failed." });
      }
    } catch {
      setAlertSaveMsg({ ok: false, text: "Network error." });
    } finally {
      setAlertSaving(false);
      setTimeout(() => setAlertSaveMsg(null), 4000);
    }
  }

  async function sendTestAlert() {
    setAlertTesting(true);
    setAlertSaveMsg(null);
    try {
      const r = await fetch(api("/evidence/alerts/test"), { method: "POST", headers });
      const body = await r.json();
      if (r.ok) {
        setAlertSaveMsg({ ok: true, text: body.message ?? "Test alert sent." });
        const h = await fetch(api("/evidence/alerts/history"), { headers }).then(res => res.ok ? res.json() : []);
        if (Array.isArray(h)) setAlertHistory(h);
      } else {
        setAlertSaveMsg({ ok: false, text: body.error ?? "Test failed." });
      }
    } catch {
      setAlertSaveMsg({ ok: false, text: "Network error." });
    } finally {
      setAlertTesting(false);
      setTimeout(() => setAlertSaveMsg(null), 5000);
    }
  }

  function addEmail() {
    const e = emailInput.trim();
    if (!e || alertSettings.emailRecipients.includes(e)) return;
    setAlertSettings(s => ({ ...s, emailRecipients: [...s.emailRecipients, e] }));
    setEmailInput("");
  }

  function removeEmail(email: string) {
    setAlertSettings(s => ({ ...s, emailRecipients: s.emailRecipients.filter(r => r !== email) }));
  }

  const connected = integrations.filter(i => i.status === "connected").length;
  const liveEvidenceCount = credentials
    ? [credentials.github, credentials.aws, credentials.okta].filter(c => c.mode === "live").length
    : 0;
  const totalChecks = checks.length;
  const passing = checks.filter(c => c.status === "pass").length;
  const failing = checks.filter(c => c.status === "fail").length;
  const warnings = checks.filter(c => c.status === "warning").length;

  const filteredChecks = checks.filter(c => {
    if (selIntegration !== "all" && c.integrationId !== selIntegration) return false;
    if (checkStatus !== "all" && c.status !== checkStatus) return false;
    if (checkSearch && !c.name.toLowerCase().includes(checkSearch.toLowerCase()) && !c.control.toLowerCase().includes(checkSearch.toLowerCase())) return false;
    return true;
  });

  const TABS = [
    { key: "overview",     label: "Overview" },
    { key: "checks",       label: `Checks (${totalChecks})` },
    { key: "integrations", label: `Integrations (${integrations.filter(i=>i.status!=="disconnected").length})` },
    { key: "credentials",  label: `Credentials (${liveEvidenceCount}/3 live)` },
    { key: "runs",         label: "Collection Runs" },
    { key: "alerts",        label: "🔔 Alert Settings" },
  ] as const;

  const inp: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)",
    background: "var(--input)", color: "var(--foreground)", fontSize: 12,
    fontFamily: "inherit", outline: "none",
  };

  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${BLU}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Loading evidence engine…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "18px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>🔬</span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--foreground)" }}>Evidence Collection Engine</h1>
              <span style={{ background: "rgba(59,130,246,0.12)", color: BLU, border: "1px solid rgba(59,130,246,0.3)", borderRadius: 12, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>AUTOMATED</span>
              {liveEvidenceCount > 0 && (
                <span style={{ background: "rgba(5,150,105,0.12)", color: EME, border: "1px solid rgba(5,150,105,0.3)", borderRadius: 12, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>
                  {liveEvidenceCount}/3 LIVE
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
              Continuous compliance evidence collection — {connected} integrations active, {passing}/{totalChecks} checks passing
              {liveEvidenceCount > 0 && ` — ${liveEvidenceCount} integration${liveEvidenceCount > 1 ? "s" : ""} pulling real evidence`}
            </p>
          </div>
          <button
            onClick={triggerRun} disabled={running}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: BLU, color: "#fff", border: "none", borderRadius: 8, cursor: running ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: running ? 0.7 : 1 }}>
            {running ? "⟳ Running…" : "▶ Run Collection"}
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <StatCard label="Coverage Score" value={`${coverage?.overall.pct ?? 88}%`} sub={`${coverage?.overall.covered ?? 148}/${coverage?.overall.total ?? 168} checks`} color={EME} />
          <StatCard label="Passing" value={passing} sub="checks passing" color={EME} />
          <StatCard label="Failing" value={failing} sub="require attention" color={failing > 0 ? RED : "var(--foreground)"} />
          <StatCard label="Warnings" value={warnings} sub="need review" color={warnings > 0 ? AMB : "var(--foreground)"} />
          <StatCard label="Integrations" value={connected} sub={`of ${integrations.length} connected`} color={BLU} />
          <StatCard label="Live Evidence" value={`${liveEvidenceCount}/3`} sub="GitHub · AWS · Okta" color={liveEvidenceCount === 3 ? EME : liveEvidenceCount > 0 ? AMB : "var(--muted-foreground)"} />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "9px 18px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? BLU : "var(--muted-foreground)", borderBottom: tab === t.key ? `2px solid ${BLU}` : "2px solid transparent", whiteSpace: "nowrap", fontFamily: "inherit", transition: "color 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && coverage && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Coverage by framework */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 16 }}>📊 Coverage by Framework</div>
              {coverage.byFramework.map(fw => (
                <div key={fw.framework} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{fw.framework}</span>
                    <span style={{ color: fw.pct >= 90 ? EME : fw.pct >= 75 ? AMB : RED, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{fw.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--secondary)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${fw.pct}%`, height: "100%", background: fw.pct >= 90 ? EME : fw.pct >= 75 ? AMB : RED, borderRadius: 3, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{fw.covered}/{fw.total} checks automated</div>
                </div>
              ))}
            </div>

            {/* Overall health + last run */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", display: "flex", gap: 24, alignItems: "center" }}>
                <DonutChart pct={coverage.overall.pct} size={100} color={EME} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>Overall Evidence Coverage</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "Automated", value: coverage.overall.covered, color: EME },
                      { label: "Failing",   value: failing,  color: RED },
                      { label: "Warnings",  value: warnings, color: AMB },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10 }}>Last collection: {runs[0]?.timestamp ? new Date(runs[0].timestamp).toLocaleString() : "—"}</div>
                </div>
              </div>

              {/* Check status breakdown */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 14 }}>Check Status Breakdown</div>
                {[
                  { label: "Passing",  count: passing,  color: EME, icon: "✓" },
                  { label: "Failing",  count: failing,  color: RED, icon: "✕" },
                  { label: "Warning",  count: warnings, color: AMB, icon: "⚠" },
                  { label: "Not Run",  count: checks.filter(c => c.status === "not-run").length, color: "var(--muted-foreground)", icon: "–" },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: `${s.color}20`, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{s.icon}</span>
                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent failing checks */}
            <div style={{ gridColumn: "1 / -1", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 14 }}>🚨 Failing & Warning Checks</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Status", "Check", "Integration", "Control", "Frameworks"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--muted-foreground)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checks.filter(c => c.status === "fail" || c.status === "warning").map(c => {
                    const intg = integrations.find(i => i.id === c.integrationId);
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ background: statusBg(c.status), color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}33`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            {statusIcon(c.status)} {statusLabel(c.status)}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--foreground)", fontWeight: 500, maxWidth: 280 }}>{c.name}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted-foreground)" }}>
                            <span>{intg?.icon}</span><span>{intg?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: BLU }}>{c.control}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {c.frameworks.slice(0, 2).map(f => (
                              <span key={f} style={{ background: "rgba(59,130,246,0.08)", color: BLU, border: "1px solid rgba(59,130,246,0.2)", borderRadius: 3, padding: "1px 6px", fontSize: 10 }}>{f}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CHECKS TAB ── */}
        {tab === "checks" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input placeholder="🔍 Search checks or controls…" value={checkSearch}
                onChange={e => setCheckSearch(e.target.value)}
                style={{ ...inp, flex: "1 1 220px" }} />
              <select value={selIntegration} onChange={e => setSelIntegration(e.target.value)} style={sel}>
                <option value="all">All Integrations</option>
                {integrations.filter(i => i.status !== "disconnected").map(i => (
                  <option key={i.id} value={i.id}>{i.icon} {i.name}</option>
                ))}
              </select>
              <select value={checkStatus} onChange={e => setCheckStatus(e.target.value)} style={sel}>
                <option value="all">All Statuses</option>
                <option value="pass">✓ Passing</option>
                <option value="fail">✕ Failing</option>
                <option value="warning">⚠ Warning</option>
              </select>
              <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--muted-foreground)", fontSize: 12 }}>
                {filteredChecks.length} checks
              </div>
            </div>

            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                    {["Status", "Check Name", "Integration", "Control ID", "Frameworks", "Evidence", "Last Run"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "var(--muted-foreground)", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredChecks.map(c => {
                    const intg = integrations.find(i => i.id === c.integrationId);
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--secondary)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: statusBg(c.status), color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}33`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            {statusIcon(c.status)} {statusLabel(c.status)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--foreground)", fontWeight: 500, maxWidth: 300 }}>{c.name}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 14 }}>{intg?.icon}</span>
                            <span style={{ color: "var(--muted-foreground)" }}>{intg?.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: BLU }}>{c.control}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {c.frameworks.slice(0, 2).map(f => (
                              <span key={f} style={{ background: "rgba(59,130,246,0.08)", color: BLU, border: "1px solid rgba(59,130,246,0.2)", borderRadius: 3, padding: "1px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{f}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", fontSize: 11, maxWidth: 180 }}>{c.evidence}</td>
                        <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", fontSize: 11, whiteSpace: "nowrap" }}>{c.lastRun}</td>
                      </tr>
                    );
                  })}
                  {filteredChecks.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>No checks match filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── INTEGRATIONS TAB ── */}
        {tab === "integrations" && (
          <div>
            {selIntDetail ? (
              <div>
                <button onClick={() => setSelIntDetail(null)}
                  style={{ background: "none", border: "none", color: BLU, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 16, padding: 0, fontFamily: "inherit" }}>
                  ← Back to Integrations
                </button>
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 28px", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{selIntDetail.icon}</span>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>{selIntDetail.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{selIntDetail.description}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <StatusDot status={selIntDetail.status} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: selIntDetail.status === "connected" ? EME : selIntDetail.status === "warning" ? AMB : selIntDetail.status === "simulated" ? AMB : "var(--muted-foreground)" }}>
                        {selIntDetail.status === "connected" ? "Connected" : selIntDetail.status === "warning" ? "Warning" : selIntDetail.status === "simulated" ? "Simulated" : "Disconnected"}
                      </span>
                      {selIntDetail.credentialMode === "simulated" && (
                        <span style={{ background: "rgba(217,119,6,0.1)", color: AMB, border: "1px solid rgba(217,119,6,0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                          onClick={() => setTab("credentials")}>
                          ◐ Simulated — add credentials →
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "Total Checks", value: selIntDetail.checksTotal },
                      { label: "Passing", value: selIntDetail.checksPassing, color: EME },
                      { label: "Failing", value: selIntDetail.checksTotal - selIntDetail.checksPassing, color: selIntDetail.checksTotal - selIntDetail.checksPassing > 0 ? RED : EME },
                      { label: "Controls Covered", value: selIntDetail.controlsCovered },
                      { label: "Last Sync", value: selIntDetail.lastSync },
                    ].map(s => (
                      <div key={s.label} style={{ background: "var(--secondary)", borderRadius: 8, padding: "10px 16px", flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: (s as { color?: string }).color ?? "var(--foreground)", fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Checks for {selIntDetail.name}</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                        {["Status", "Check", "Control", "Evidence"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--muted-foreground)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {checks.filter(c => c.integrationId === selIntDetail.id).map(c => (
                        <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: statusBg(c.status), color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}33`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                              {statusIcon(c.status)} {statusLabel(c.status)}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--foreground)", fontWeight: 500 }}>{c.name}</td>
                          <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: BLU }}>{c.control}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontSize: 11 }}>{c.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {integrations.map(intg => {
                    const passPct = intg.checksTotal > 0 ? Math.round(intg.checksPassing / intg.checksTotal * 100) : 0;
                    const isDisconnected = intg.status === "disconnected";
                    const isSimulated   = intg.credentialMode === "simulated";
                    return (
                      <div key={intg.id}
                        onClick={() => !isDisconnected && setSelIntDetail(intg)}
                        style={{ background: "var(--card)", border: `1px solid ${isSimulated ? "rgba(217,119,6,0.25)" : "var(--border)"}`, borderRadius: 12, padding: "18px 20px", cursor: isDisconnected ? "default" : "pointer", opacity: isDisconnected ? 0.6 : 1, transition: "border-color 0.15s" }}
                        onMouseEnter={e => { if (!isDisconnected) e.currentTarget.style.borderColor = BLU; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = isSimulated ? "rgba(217,119,6,0.25)" : "var(--border)"; }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 24 }}>{intg.icon}</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{intg.name}</div>
                              <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{intg.category}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <StatusDot status={intg.status} />
                              <span style={{ fontSize: 11, color: intg.status === "connected" ? EME : intg.status === "warning" ? AMB : intg.status === "simulated" ? AMB : "var(--muted-foreground)" }}>
                                {intg.status === "connected" ? "Live" : intg.status === "warning" ? "Warning" : intg.status === "simulated" ? "Simulated" : "Not connected"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!isDisconnected && (
                          <>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>{intg.description}</div>
                            {isSimulated && (
                              <div style={{ fontSize: 10, color: AMB, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                                <span>◐</span><span>Running on simulated data — <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={e => { e.stopPropagation(); setTab("credentials"); }}>add credentials</span> for live evidence</span>
                              </div>
                            )}
                            <div style={{ height: 5, background: "var(--secondary)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                              <div style={{ width: `${passPct}%`, height: "100%", background: passPct >= 90 ? EME : passPct >= 70 ? AMB : RED, borderRadius: 3 }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ color: "var(--muted-foreground)" }}>{intg.checksPassing}/{intg.checksTotal} checks passing</span>
                              <span style={{ color: passPct >= 90 ? EME : passPct >= 70 ? AMB : RED, fontWeight: 700 }}>{passPct}%</span>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 6 }}>Last sync: {intg.lastSync}</div>
                          </>
                        )}
                        {isDisconnected && (
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Click to connect this integration</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CREDENTIALS TAB ── */}
        {tab === "credentials" && (
          <div>
            {/* Banner */}
            <div style={{ background: liveEvidenceCount === 3 ? "rgba(5,150,105,0.08)" : "rgba(217,119,6,0.06)", border: `1px solid ${liveEvidenceCount === 3 ? "rgba(5,150,105,0.2)" : "rgba(217,119,6,0.2)"}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{liveEvidenceCount === 3 ? "✅" : "🔧"}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
                  {liveEvidenceCount === 3
                    ? "All three evidence collectors are running on live data"
                    : `${3 - liveEvidenceCount} collector${3 - liveEvidenceCount > 1 ? "s" : ""} still using simulated data`}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  {liveEvidenceCount === 3
                    ? "GitHub, AWS, and Okta are all connected with real credentials. Evidence collected is auditor-accepted and reflects your actual compliance posture."
                    : "Add the missing secrets in the Replit Secrets panel (left sidebar → 🔒 Secrets) and restart the API server. Each collector falls back to simulated data when its credential is absent — no real API calls are made in simulated mode."
                  }
                </div>
              </div>
            </div>

            {/* Credential cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
              {(["github", "aws", "okta"] as const).map(id => (
                credentials ? (
                  <CredentialCard
                    key={id}
                    id={id}
                    status={credentials[id]}
                    testResult={testResults[id]}
                    testing={testing[id]}
                    onTest={() => testConnection(id)}
                  />
                ) : (
                  <div key={id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
                    <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Loading credential status…</div>
                  </div>
                )
              ))}
            </div>

            {/* Help section */}
            <div style={{ marginTop: 24, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 12 }}>📋 How to add secrets</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--muted-foreground)", lineHeight: 2 }}>
                <li>Open the <strong style={{ color: "var(--foreground)" }}>Replit Secrets panel</strong> (🔒 icon in the left sidebar)</li>
                <li>Click <strong style={{ color: "var(--foreground)" }}>+ New secret</strong></li>
                <li>Enter the exact <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, background: "var(--secondary)", padding: "1px 5px", borderRadius: 3 }}>KEY</code> and paste your credential value</li>
                <li>Restart the API Server workflow (or it picks up secrets on next boot)</li>
                <li>Return to this tab and click <strong style={{ color: "var(--foreground)" }}>Test Connection</strong> to verify</li>
              </ol>
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8, fontSize: 11, color: "var(--muted-foreground)" }}>
                <strong style={{ color: BLU }}>Least-privilege recommendation:</strong> create a read-only IAM user for AWS (permissions listed above), a fine-grained GitHub token scoped to your org, and an Okta read-only API token. No write permissions are required by the evidence collectors.
              </div>
            </div>
          </div>
        )}

        {/* ── RUNS TAB ── */}
        {tab === "runs" && (
          <div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Collection Run History</span>
                <button onClick={triggerRun} disabled={running}
                  style={{ padding: "6px 14px", background: BLU, color: "#fff", border: "none", borderRadius: 6, cursor: running ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: running ? 0.7 : 1 }}>
                  {running ? "Running…" : "▶ Run Now"}
                </button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                    {["Run ID", "Timestamp", "Duration", "Passed", "Failed", "Warnings", "Triggered By"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--muted-foreground)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: BLU }}>{r.id}</td>
                      <td style={{ padding: "10px 14px", color: "var(--foreground)" }}>{new Date(r.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{r.duration}</td>
                      <td style={{ padding: "10px 14px" }}><span style={{ color: EME, fontWeight: 700 }}>{r.passed}</span></td>
                      <td style={{ padding: "10px 14px" }}><span style={{ color: r.failed > 0 ? RED : "var(--muted-foreground)", fontWeight: r.failed > 0 ? 700 : 400 }}>{r.failed}</span></td>
                      <td style={{ padding: "10px 14px" }}><span style={{ color: r.warnings > 0 ? AMB : "var(--muted-foreground)", fontWeight: r.warnings > 0 ? 700 : 400 }}>{r.warnings}</span></td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{r.triggeredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {tab === "alerts" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Settings card */}
            <div style={{ gridColumn: "1 / -1", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>🔔 Evidence Alert Settings</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Get notified via email or Slack when controls fail evidence collection</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {alertSaveMsg && (
                    <span style={{ fontSize: 12, color: alertSaveMsg.ok ? EME : RED, fontWeight: 600 }}>{alertSaveMsg.text}</span>
                  )}
                  <button onClick={sendTestAlert} disabled={alertTesting}
                    style={{ padding: "7px 14px", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, cursor: alertTesting ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: alertTesting ? 0.7 : 1 }}>
                    {alertTesting ? "Sending…" : "Send Test Alert"}
                  </button>
                  <button onClick={saveAlertSettings} disabled={alertSaving}
                    style={{ padding: "7px 16px", background: BLU, color: "#fff", border: "none", borderRadius: 6, cursor: alertSaving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: alertSaving ? 0.7 : 1 }}>
                    {alertSaving ? "Saving…" : "Save Settings"}
                  </button>
                </div>
              </div>

              {/* Enable toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--secondary)", borderRadius: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Enable Evidence Alerts</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>When enabled, alerts are sent after each evidence collection run</div>
                </div>
                <button onClick={() => setAlertSettings(s => ({ ...s, enabled: !s.enabled }))}
                  style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: alertSettings.enabled ? BLU : "var(--border)", position: "relative", transition: "background 0.2s" }}>
                  <span style={{ position: "absolute", top: 3, left: alertSettings.enabled ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                </button>
              </div>

              {/* Alert triggers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "var(--secondary)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={alertSettings.alertOnFailed}
                    onChange={e => setAlertSettings(s => ({ ...s, alertOnFailed: e.target.checked }))}
                    style={{ marginTop: 2, accentColor: RED }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>Alert on Failed Controls</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Notify when controls produce a "failed" evidence status</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "var(--secondary)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={alertSettings.alertOnStale}
                    onChange={e => setAlertSettings(s => ({ ...s, alertOnStale: e.target.checked }))}
                    style={{ marginTop: 2, accentColor: AMB }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>Alert on Stale Evidence</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Notify when evidence exceeds the staleness threshold</div>
                  </div>
                </label>
              </div>

              {/* Minimum threshold */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Minimum failures to trigger alert:</label>
                <input type="number" min={1} max={100} value={alertSettings.minFailedCount}
                  onChange={e => setAlertSettings(s => ({ ...s, minFailedCount: Math.max(1, Number(e.target.value)) }))}
                  style={{ width: 70, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: 13, fontFamily: "inherit", textAlign: "center" }} />
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>control(s) must fail before alerting</span>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Slack */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16 }}>💬</span> Slack Webhook URL
                  </div>
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/services/…"
                    value={alertSettings.slackWebhookUrl ?? ""}
                    onChange={e => setAlertSettings(s => ({ ...s, slackWebhookUrl: e.target.value || null }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>
                    Create an Incoming Webhook at api.slack.com/messaging/webhooks
                  </div>
                </div>

                {/* Email recipients */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16 }}>📧</span> Email Recipients
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input
                      type="email"
                      placeholder="security@company.com"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addEmail()}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: 12, fontFamily: "inherit" }} />
                    <button onClick={addEmail}
                      style={{ padding: "7px 12px", background: BLU, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {alertSettings.emailRecipients.map(email => (
                      <span key={email} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.1)", color: BLU, border: "1px solid rgba(59,130,246,0.25)", borderRadius: 12, padding: "3px 10px", fontSize: 11 }}>
                        {email}
                        <button onClick={() => removeEmail(email)}
                          style={{ background: "none", border: "none", color: BLU, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</button>
                      </span>
                    ))}
                    {alertSettings.emailRecipients.length === 0 && (
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>No recipients added. Requires SENDGRID_API_KEY.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery history */}
            <div style={{ gridColumn: "1 / -1", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                📋 Alert Delivery History
              </div>
              {alertHistory.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
                  No alerts sent yet. Alerts will appear here after evidence runs trigger notifications.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                      {["Run ID", "Channel", "Destination", "Failed", "Stale", "Status", "Sent At"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--muted-foreground)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alertHistory.map(r => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: BLU }}>{r.runId}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--foreground)" }}>
                            {r.channel === "slack" ? "💬" : "📧"} {r.channel}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.destination}</td>
                        <td style={{ padding: "10px 14px" }}><span style={{ color: r.failedCount > 0 ? RED : "var(--muted-foreground)", fontWeight: r.failedCount > 0 ? 700 : 400 }}>{r.failedCount}</span></td>
                        <td style={{ padding: "10px 14px" }}><span style={{ color: r.staleCount > 0 ? AMB : "var(--muted-foreground)" }}>{r.staleCount}</span></td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{
                            background: r.status === "sent" ? "rgba(5,150,105,0.1)" : r.status === "failed" ? "rgba(220,38,38,0.1)" : "rgba(107,114,128,0.1)",
                            color: r.status === "sent" ? EME : r.status === "failed" ? RED : "var(--muted-foreground)",
                            border: `1px solid ${r.status === "sent" ? EME : r.status === "failed" ? RED : "var(--border)"}33`,
                            borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700
                          }}>
                            {r.status === "sent" ? "✓ Sent" : r.status === "failed" ? "✕ Failed" : r.status}
                          </span>
                          {r.error && <div style={{ fontSize: 10, color: RED, marginTop: 2 }}>{r.error}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontSize: 11 }}>
                          {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
