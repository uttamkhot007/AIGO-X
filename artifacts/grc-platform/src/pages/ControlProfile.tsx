import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { controlMap } from "@/lib/control-library";
import type { ComplianceControlFull } from "@/lib/control-library";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/grc-platform", "");
const api = (p: string) => `${BASE}/api${p}`;

// ── Design tokens (CSS-variable based — works in all themes) ──────────────────
const D = {
  bg:     "var(--background)",
  card:   "var(--card)",
  border: "var(--border)",
  text:   "var(--foreground)",
  muted:  "var(--muted-foreground)",
  dim:    "color-mix(in oklch, var(--muted-foreground), transparent 40%)",
  accent: "rgb(147,197,253)",
  green:  "#059669",
  amber:  "#D97706",
  red:    "#DC2626",
  indigo: "#6366F1",
  purple: "#8B5CF6",
};
const EME = "#059669", AMB = "#D97706", RED = "#DC2626", BLU = "rgb(147,197,253)";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, ...extra,
});

// ── Shared helpers ─────────────────────────────────────────────────────────────
function RingChart({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 12) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ, cx = size / 2;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="10" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color, lineHeight: 1 }}>{pct}%</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, { bg: string; color: string; label: string }> = {
    "implemented":  { bg: "rgba(5,150,105,0.12)",  color: EME,  label: "Implemented"  },
    "partial":      { bg: "rgba(217,119,6,0.12)",   color: AMB,  label: "Partial"      },
    "planned":      { bg: "rgba(99,102,241,0.12)",  color: D.indigo, label: "Planned"  },
    "not-started":  { bg: "rgba(239,68,68,0.1)",    color: RED,  label: "Not Started"  },
  };
  const v = s[status] ?? { bg: "rgba(148,163,184,0.12)", color: D.muted, label: status };
  return (
    <span style={{ background: v.bg, color: v.color, border: `1px solid ${v.color}44`, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
      {v.label}
    </span>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: "var(--secondary)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${color}88,${color})`, borderRadius: 3, transition: "width 0.5s ease" }} />
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string | number; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${D.border}`, fontSize: 12 }}>
      <span style={{ color: D.muted }}>{k}</span>
      <span style={{ color: D.text, fontWeight: 600, fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit" }}>{v}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: BLU, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
}

// ── Deterministic demo data generator ─────────────────────────────────────────
function mkRand(controlId: string) {
  const s = controlId.split("").reduce((n, c) => n * 31 + c.charCodeAt(0), 17) | 0;
  let st = s;
  return (min: number, max: number, salt = 0) => {
    st = (st * 1664525 + salt * 22695477 + 1013904223) | 0;
    const t = (Math.abs(st) / 2147483647);
    return Math.round(min + t * (max - min));
  };
}

const EVIDENCE_TYPES = ["MFA Report", "Access Review Log", "Pen Test Report", "Audit Certificate", "Screen Recording", "Policy Sign-off", "Configuration Export", "Monitoring Dashboard", "Scan Report", "SIEM Alert Log"];
const EVIDENCE_SOURCES = ["Azure AD", "AWS Config", "CrowdStrike", "Qualys", "Cynet", "Jira", "ServiceNow", "Manual Upload", "Auditor Review", "Vicarius", "Tenable"];
const POLICIES = ["Access Control Policy", "Information Security Policy", "Data Classification Policy", "Password & Authentication Policy", "Incident Response Policy", "Encryption & Key Management Policy", "Remote Work Policy", "Change Management Policy"];
const PROCEDURES = ["User Provisioning SOP", "User Deprovisioning SOP", "Privileged Access SOP", "Patch Management Procedure", "Incident Response Playbook", "Backup & Recovery Procedure", "Change Request Process", "Access Review Procedure"];
const LINKED_RISKS = [
  { id: "RK-2041", name: "Cloud Misconfiguration — S3 Buckets",   severity: "Critical", residual: "Low" },
  { id: "RK-2039", name: "Privileged Account without MFA",         severity: "High",     residual: "Medium" },
  { id: "RK-2037", name: "Unpatched Linux Kernel (3 servers)",     severity: "High",     residual: "Low" },
  { id: "RK-2035", name: "Vendor Data Processing Agreement Missing",severity: "Medium",  residual: "Medium" },
  { id: "RK-2033", name: "DSAR Response SLA Breach Risk",          severity: "Medium",   residual: "Low" },
];

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: "overview",        label: "Overview" },
  { key: "applicability",   label: "Applicability" },
  { key: "implementation",  label: "Implementation" },
  { key: "assessment",      label: "Assessment" },
  { key: "evidence",        label: "Evidence" },
  { key: "browser-checks",  label: "🤖 Browser Checks" },
  { key: "assets",          label: "Assets" },
  { key: "risks",           label: "Risks" },
  { key: "policies",        label: "Policies" },
  { key: "procedures",      label: "Procedures" },
  { key: "incidents",       label: "Incidents" },
  { key: "exceptions",      label: "Exceptions" },
  { key: "vendors",         label: "Vendors" },
  { key: "ai-systems",      label: "AI Systems" },
  { key: "findings",        label: "Findings" },
  { key: "capa",            label: "CAPA" },
  { key: "monitoring",      label: "Monitoring" },
  { key: "audit-history",   label: "Audit History" },
];

function TabBar({ active, onSelect }: { active: string; onSelect: (k: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, overflowX: "auto", borderBottom: `1px solid ${D.border}`, paddingBottom: 0, scrollbarWidth: "none" }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => onSelect(t.key)} style={{
          padding: "9px 14px", background: "none", border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? BLU : D.muted,
          borderBottom: active === t.key ? `2px solid ${BLU}` : "2px solid transparent",
          whiteSpace: "nowrap", fontFamily: "inherit", transition: "color 0.15s",
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Score component ────────────────────────────────────────────────────────────
function ScoreModel({ scores }: { scores: { label: string; score: number; weight: number; color: string }[] }) {
  const composite = Math.round(scores.reduce((s, c) => s + c.score * c.weight / 100, 0));
  const compColor = composite >= 90 ? EME : composite >= 70 ? AMB : RED;
  return (
    <div style={card({ padding: "20px 24px" })}>
      <SectionTitle>Control Scoring Model</SectionTitle>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center", minWidth: 100 }}>
          <RingChart pct={composite} color={compColor} size={96} />
          <div style={{ fontSize: 11, color: D.muted, marginTop: 8 }}>Composite Score</div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          {scores.map(s => (
            <div key={s.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: D.text }}>{s.label}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: D.dim, fontSize: 10 }}>Weight {s.weight}%</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: s.color, fontWeight: 700 }}>{s.score}%</span>
                </div>
              </div>
              <ProgressBar pct={s.score} color={s.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
// ── Types for browser checks ──────────────────────────────────────────────────
interface BrowserCheck {
  id: number; checkId: string; name: string; url: string; instruction: string;
  templateId: string | null; scheduleCron: string; enabled: boolean;
  lastRunAt: string | null; lastStatus: string | null; lastError: string | null;
  alertSlackWebhookUrl: string | null; alertEmailRecipients: string[];
  createdAt: string;
}
interface BrowserCheckRun {
  runId: string; checkId: string; status: string; screenshotUrl: string | null;
  verdict: string | null; errorMessage: string | null; durationMs: number | null;
  triggeredBy: string; createdAt: string;
}
interface BcTemplate {
  id: string; name: string; description: string; category: string;
  frameworks: string[]; url: string; instruction: string; scheduleCron: string;
}

export default function ControlProfile() {
  const [location, navigate] = useLocation();
  const [tab, setTab] = useState("overview");

  // ── Browser Checks state ──────────────────────────────────────────────────
  const [bcChecks, setBcChecks] = useState<BrowserCheck[]>([]);
  const [bcRuns, setBcRuns] = useState<BrowserCheckRun[]>([]);
  const [bcTemplates, setBcTemplates] = useState<BcTemplate[]>([]);
  const [bcLoading, setBcLoading] = useState(false);
  const [bcRunning, setBcRunning] = useState<string | null>(null);
  const [bcPollTimer, setBcPollTimer] = useState<ReturnType<typeof setInterval> | null>(null);
  const [bcForm, setBcForm] = useState<{ open: boolean; templateId: string; name: string; url: string; instruction: string; cron: string }>({
    open: false, templateId: "", name: "", url: "", instruction: "", cron: "0 8 * * *",
  });
  const [bcSaving, setBcSaving] = useState(false);
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcExpanded, setBcExpanded] = useState<string | null>(null);

  // ── Browser Check Alert Settings state ────────────────────────────────────
  const [bcAlertSettings, setBcAlertSettings] = useState<{
    enabled: boolean; slackWebhookUrl: string | null; emailRecipients: string[];
  }>({ enabled: false, slackWebhookUrl: null, emailRecipients: [] });
  const [bcAlertSlack, setBcAlertSlack] = useState("");
  const [bcAlertEmails, setBcAlertEmails] = useState<string[]>([]);
  const [bcAlertNewEmail, setBcAlertNewEmail] = useState("");
  const [bcAlertEnabled, setBcAlertEnabled] = useState(false);
  const [bcAlertSaving, setBcAlertSaving] = useState(false);
  const [bcAlertTesting, setBcAlertTesting] = useState(false);
  const [bcAlertMsg, setBcAlertMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bcAlertHistory, setBcAlertHistory] = useState<{
    id: number; runId: string; checkName: string; verdict: string; controlRef: string;
    channel: string; destination: string; status: string; error: string | null; sentAt: string | null; createdAt: string;
  }[]>([]);
  const [bcAlertOpen, setBcAlertOpen] = useState(false);
  const [bcExporting, setBcExporting] = useState(false);

  // Per-check alert destination overrides (keyed by checkId)
  const [perCheckAlertForm, setPerCheckAlertForm] = useState<Record<string, { slack: string; emails: string[]; emailInput: string; saving: boolean; msg: string | null }>>({});

  const getPerCheckForm = (check: BrowserCheck) =>
    perCheckAlertForm[check.checkId] ?? {
      slack:      check.alertSlackWebhookUrl ?? "",
      emails:     check.alertEmailRecipients ?? [],
      emailInput: "",
      saving:     false,
      msg:        null,
    };

  const setPerCheckField = (checkId: string, patch: Partial<{ slack: string; emails: string[]; emailInput: string; saving: boolean; msg: string | null }>) =>
    setPerCheckAlertForm(prev => ({ ...prev, [checkId]: { ...getPerCheckForm({ checkId } as BrowserCheck), ...patch } }));

  const match = location.match(/\/govops\/controls\/(.+)$/);
  const controlId = match ? decodeURIComponent(match[1]!) : "";
  const ctrl: ComplianceControlFull | undefined = controlMap.get(controlId);

  // ── Browser Checks data fetch ─────────────────────────────────────────────
  // Always read token fresh from localStorage (app stores JWT under "grc_token")
  const getBcAuthH = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("grc_token") ?? "" : ""}`,
  });

  const [bcScreenshots, setBcScreenshots] = useState<Map<string, string>>(new Map());

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      bcScreenshots.forEach(objUrl => URL.revokeObjectURL(objUrl));
    };
  }, []);

  // Fetch screenshot blobs with auth header and store as object URLs for inline rendering.
  // Browser <img src> cannot include Authorization headers, so we proxy via fetch+blob.
  const loadScreenshotBlobs = useCallback(async (runs: BrowserCheckRun[]) => {
    const authH = getBcAuthH();
    const urlsToLoad = runs
      .map(r => r.screenshotUrl)
      .filter((u): u is string => !!u && !bcScreenshots.has(u));

    if (urlsToLoad.length === 0) return;

    const entries = await Promise.all(
      urlsToLoad.map(async screenshotUrl => {
        try {
          const res = await fetch(`${BASE}/api${screenshotUrl}`, { headers: authH });
          if (!res.ok) return null;
          const blob = await res.blob();
          return [screenshotUrl, URL.createObjectURL(blob)] as [string, string];
        } catch {
          return null;
        }
      })
    );

    setBcScreenshots(prev => {
      const next = new Map(prev);
      for (const entry of entries) {
        if (entry) next.set(entry[0], entry[1]);
      }
      return next;
    });
  }, []);

  const loadBcData = useCallback(async (cid: string) => {
    if (!cid) return;
    setBcLoading(true);
    try {
      const authH = getBcAuthH();
      const [checksRes, runsRes, tmplRes, alertSettRes, alertHistRes] = await Promise.all([
        fetch(api(`/controls/${encodeURIComponent(cid)}/browser-checks`), { headers: authH }),
        fetch(api(`/controls/${encodeURIComponent(cid)}/browser-checks/runs`), { headers: authH }),
        fetch(api(`/browser-check-templates`), { headers: authH }),
        fetch(api(`/browser-check-alerts/settings`), { headers: authH }),
        fetch(api(`/browser-check-alerts/history`), { headers: authH }),
      ]);
      if (checksRes.ok) setBcChecks(await checksRes.json());
      if (tmplRes.ok)   setBcTemplates(await tmplRes.json());
      if (runsRes.ok) {
        const runs: BrowserCheckRun[] = await runsRes.json();
        setBcRuns(runs);
        void loadScreenshotBlobs(runs);
      }
      if (alertSettRes.ok) {
        const s = await alertSettRes.json();
        setBcAlertSettings(s);
        setBcAlertEnabled(s.enabled);
        setBcAlertSlack(s.slackWebhookUrl ?? "");
        setBcAlertEmails(s.emailRecipients ?? []);
      }
      if (alertHistRes.ok) setBcAlertHistory(await alertHistRes.json());
    } catch { /* silent */ }
    finally { setBcLoading(false); }
  }, [controlId, loadScreenshotBlobs]);

  useEffect(() => {
    if (tab === "browser-checks" && controlId) loadBcData(controlId);
  }, [tab, controlId]);

  // Cleanup polling timer on unmount
  useEffect(() => () => { if (bcPollTimer) clearInterval(bcPollTimer); }, [bcPollTimer]);

  const handleSelectTemplate = (tmpl: BcTemplate) => {
    setBcForm(f => ({ ...f, templateId: tmpl.id, name: tmpl.name, url: tmpl.url, instruction: tmpl.instruction, cron: tmpl.scheduleCron }));
  };

  const handleSaveCheck = async () => {
    if (!bcForm.name || !bcForm.url || !bcForm.instruction) {
      setBcError("Name, URL, and instruction are required."); return;
    }
    setBcSaving(true); setBcError(null);
    try {
      const res = await fetch(api(`/controls/${encodeURIComponent(controlId)}/browser-checks`), {
        method: "POST",
        headers: { ...getBcAuthH(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: bcForm.name, url: bcForm.url, instruction: bcForm.instruction, templateId: bcForm.templateId || null, scheduleCron: bcForm.cron }),
      });
      if (!res.ok) { const j = await res.json(); setBcError(j.error ?? "Save failed"); return; }
      setBcForm({ open: false, templateId: "", name: "", url: "", instruction: "", cron: "0 8 * * *" });
      await loadBcData(controlId);
    } catch (e) { setBcError(String(e)); }
    finally { setBcSaving(false); }
  };

  const handleRunCheck = async (check: BrowserCheck) => {
    setBcRunning(check.checkId);
    try {
      const res = await fetch(api(`/controls/${encodeURIComponent(controlId)}/browser-checks/${check.checkId}/run`), {
        method: "POST", headers: getBcAuthH(),
      });
      if (res.status === 409) { setBcRunning(null); return; }
      const j = await res.json();
      const runId: string = j.runId;
      // Poll for result
      const timer = setInterval(async () => {
        try {
          const pr = await fetch(api(`/browser-check-runs/${runId}`), { headers: getBcAuthH() });
          if (pr.ok) {
            const data = await pr.json();
            if (data.status !== "running") {
              clearInterval(timer); setBcRunning(null);
              await loadBcData(controlId);
            }
          }
        } catch { clearInterval(timer); setBcRunning(null); }
      }, 3000);
      setBcPollTimer(timer);
    } catch { setBcRunning(null); }
  };

  const handleDeleteCheck = async (checkId: string) => {
    await fetch(api(`/controls/${encodeURIComponent(controlId)}/browser-checks/${checkId}`), { method: "DELETE", headers: getBcAuthH() });
    await loadBcData(controlId);
  };

  const handleSavePerCheckAlertConfig = async (check: BrowserCheck) => {
    const form = getPerCheckForm(check);
    setPerCheckField(check.checkId, { saving: true, msg: null });
    try {
      const res = await fetch(
        api(`/controls/${encodeURIComponent(controlId)}/browser-checks/${check.checkId}/alert-config`),
        {
          method: "PUT",
          headers: { ...getBcAuthH(), "Content-Type": "application/json" },
          body: JSON.stringify({ slackWebhookUrl: form.slack.trim() || null, emailRecipients: form.emails }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setPerCheckField(check.checkId, { saving: false, msg: data.error ?? "Save failed" }); return; }
      setBcChecks(prev => prev.map(c => c.checkId === check.checkId
        ? { ...c, alertSlackWebhookUrl: data.alertSlackWebhookUrl, alertEmailRecipients: data.alertEmailRecipients }
        : c
      ));
      setPerCheckField(check.checkId, { saving: false, msg: "Saved." });
      setTimeout(() => setPerCheckField(check.checkId, { msg: null }), 3000);
    } catch { setPerCheckField(check.checkId, { saving: false, msg: "Network error" }); }
  };

  const handleSaveBcAlertSettings = async () => {
    setBcAlertSaving(true); setBcAlertMsg(null);
    try {
      const res = await fetch(api(`/browser-check-alerts/settings`), {
        method: "PUT",
        headers: { ...getBcAuthH(), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: bcAlertEnabled, slackWebhookUrl: bcAlertSlack.trim() || null, emailRecipients: bcAlertEmails }),
      });
      const data = await res.json();
      if (!res.ok) { setBcAlertMsg({ ok: false, text: data.error ?? "Save failed" }); return; }
      setBcAlertSettings(data);
      setBcAlertMsg({ ok: true, text: "Alert settings saved." });
    } catch { setBcAlertMsg({ ok: false, text: "Network error" }); }
    finally { setBcAlertSaving(false); }
  };

  const handleExportEvidencePdf = async () => {
    setBcExporting(true);
    try {
      const res = await fetch(api(`/controls/${encodeURIComponent(controlId)}/browser-checks/export/pdf`), {
        headers: getBcAuthH(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${controlId.replace(/[^a-z0-9_-]/gi, "_")}_browser_check_evidence.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed — please try again.");
    } finally {
      setBcExporting(false);
    }
  };

  const handleTestBcAlert = async () => {
    setBcAlertTesting(true); setBcAlertMsg(null);
    try {
      const res = await fetch(api(`/browser-check-alerts/test`), {
        method: "POST",
        headers: { ...getBcAuthH(), "Content-Type": "application/json" },
      });
      const data = await res.json();
      setBcAlertMsg({ ok: res.ok, text: res.ok ? data.message : (data.error ?? "Test failed") });
      if (res.ok) {
        const histRes = await fetch(api(`/browser-check-alerts/history`), { headers: getBcAuthH() });
        if (histRes.ok) setBcAlertHistory(await histRes.json());
      }
    } catch { setBcAlertMsg({ ok: false, text: "Network error" }); }
    finally { setBcAlertTesting(false); }
  };

  if (!ctrl) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg }}>
        <div style={{ padding: "32px 28px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${D.border}` }}>
          <button onClick={() => navigate("/govops")} style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: "4px 8px", borderRadius: 5 }}>
            ← GovOps / Controls
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: D.muted }}>
          Control "{controlId}" not found in the control library.
        </div>
      </div>
    );
  }

  // Deterministic demo data
  const r = mkRand(controlId);
  const impScore = ctrl.status === "implemented" ? r(85, 98) : ctrl.status === "partial" ? r(62, 84) : ctrl.status === "planned" ? r(25, 59) : r(5, 24);
  const assScore = Math.min(100, Math.max(0, impScore + r(-10, 5, 1)));
  const evScore  = Math.min(100, ctrl.evidence * 13 + r(0, 8, 2));
  const monScore = ctrl.status === "implemented" ? r(80, 98, 3) : r(50, 80, 3);
  const riskScore = ctrl.status === "implemented" ? r(75, 95, 4) : r(45, 74, 4);
  const composite = Math.round(impScore * 0.30 + assScore * 0.30 + evScore * 0.15 + monScore * 0.15 + riskScore * 0.10);
  const compColor = composite >= 90 ? EME : composite >= 70 ? AMB : RED;

  // Implementation coverage
  const totalEndpoints = r(4500, 6000, 10);
  const totalServers   = r(200, 450, 11);
  const totalCloud     = r(18, 40, 12);
  const totalApps      = r(40, 80, 13);
  const pctFactor = impScore / 100;
  const covEndpoints = Math.round(totalEndpoints * pctFactor + r(-50, 50, 14));
  const covServers   = Math.round(totalServers   * pctFactor + r(-10, 10, 15));
  const covCloud     = Math.round(totalCloud     * pctFactor + r(-2, 2, 16));
  const covApps      = Math.round(totalApps      * pctFactor + r(-5, 5, 17));
  const totalAll = totalEndpoints + totalServers + totalCloud + totalApps;
  const covAll   = covEndpoints + covServers + covCloud + covApps;
  const implScoreCalc = Math.round((covAll / totalAll) * 100);
  const implStatusLabel = implScoreCalc === 100 ? "Fully Implemented" : implScoreCalc >= 90 ? "Substantially Implemented" : implScoreCalc >= 70 ? "Partially Implemented" : "Not Implemented";
  const implStatusColor = implScoreCalc >= 90 ? EME : implScoreCalc >= 70 ? AMB : RED;

  // Evidence items
  const evCount = Math.max(ctrl.evidence, r(2, 5, 20));
  const evidenceItems = Array.from({ length: evCount }, (_, i) => ({
    type:   EVIDENCE_TYPES[r(0, EVIDENCE_TYPES.length - 1, 30 + i)],
    source: EVIDENCE_SOURCES[r(0, EVIDENCE_SOURCES.length - 1, 40 + i)],
    date:   `2026-0${r(1, 6, 50 + i)}-${String(r(1, 28, 60 + i)).padStart(2, "0")}`,
    status: i === 0 ? "Valid" : i === evCount - 1 && ctrl.status !== "implemented" ? "Expired" : "Valid",
    review: i < evCount - 1 ? "Approved" : ctrl.status === "implemented" ? "Approved" : "Pending",
  }));

  // Linked risks (2–3)
  const riskCount = r(2, 3, 70);
  const linkedRisks = LINKED_RISKS.slice(r(0, 2, 71), r(2, 5, 72)).slice(0, riskCount);

  // Policies & procedures
  const polCount  = r(2, 3, 80);
  const procCount = r(2, 3, 81);
  const mappedPolicies   = POLICIES.slice(r(0, 3, 82), r(3, 7, 83)).slice(0, polCount);
  const mappedProcedures = PROCEDURES.slice(r(0, 3, 90), r(3, 7, 91)).slice(0, procCount);

  const assessDesign    = r(75, 99, 100);
  const assessOperating = r(70, 99, 101);
  const assessEffect    = Math.round((assessDesign * assessOperating) / 100);

  // Scores for model
  const scores = [
    { label: "Implementation Score",  score: impScore,  weight: 30, color: impScore  >= 90 ? EME : impScore  >= 70 ? AMB : RED },
    { label: "Assessment Score",      score: assScore,  weight: 30, color: assScore  >= 90 ? EME : assScore  >= 70 ? AMB : RED },
    { label: "Evidence Score",        score: evScore,   weight: 15, color: evScore   >= 90 ? EME : evScore   >= 70 ? AMB : RED },
    { label: "Monitoring Score",      score: monScore,  weight: 15, color: monScore  >= 90 ? EME : monScore  >= 70 ? AMB : RED },
    { label: "Risk Reduction Score",  score: riskScore, weight: 10, color: riskScore >= 90 ? EME : riskScore >= 70 ? AMB : RED },
  ];

  // All frameworks (primary + cross-refs)
  const allFrameworks = [ctrl.framework, ...ctrl.crossReferences];

  const riskRating = composite >= 85 ? "Low" : composite >= 70 ? "Medium" : composite >= 50 ? "High" : "Critical";
  const riskRatingColor = riskRating === "Low" ? EME : riskRating === "Medium" ? AMB : RED;

  const inp: React.CSSProperties = { padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, overflow: "hidden" }}>

      {/* ── Breadcrumb ── */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button onClick={() => navigate("/govops")} style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
          ← GovOps
        </button>
        <span style={{ color: D.dim, fontSize: 12 }}>/</span>
        <span style={{ color: D.muted, fontSize: 12, cursor: "pointer" }} onClick={() => navigate("/govops")}>Controls</span>
        <span style={{ color: D.dim, fontSize: 12 }}>/</span>
        <span style={{ color: BLU, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>{ctrl.id}</span>
      </div>

      {/* ── Header ── */}
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${D.border}`, background: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: D.dim, background: "var(--secondary)", border: `1px solid ${D.border}`, padding: "2px 8px", borderRadius: 4 }}>{ctrl.id}</span>
              <span style={{ background: "rgba(59,130,246,0.12)", color: BLU, border: "1px solid rgba(99,179,237,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{ctrl.framework}</span>
              <span style={{ background: "rgba(99,102,241,0.1)", color: D.indigo, border: "1px solid rgba(99,102,241,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{ctrl.domain}</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: D.text, margin: 0, lineHeight: 1.3 }}>{ctrl.name}</h1>
            <p style={{ fontSize: 13, color: D.muted, margin: "8px 0 0", lineHeight: 1.5, maxWidth: 680 }}>{ctrl.description}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <RingChart pct={composite} color={compColor} size={88} />
            <div>
              <div style={{ fontSize: 10, color: D.dim, marginBottom: 4 }}>COMPOSITE SCORE</div>
              <StatusBadge status={ctrl.status} />
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: riskRatingColor, background: `${riskRatingColor}11`, border: `1px solid ${riskRatingColor}33`, borderRadius: 4, padding: "2px 7px" }}>Risk: {riskRating}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Header KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginTop: 16 }}>
          {[
            { label: "Owner",        value: ctrl.owner },
            { label: "Reviewer",     value: "Internal Auditor" },
            { label: "Framework",    value: ctrl.framework },
            { label: "Domain",       value: ctrl.domain },
            { label: "Last Review",  value: "01-Jun-2026" },
            { label: "Evidence",     value: `${ctrl.evidence} items` },
          ].map(item => (
            <div key={item.label} style={{ background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ borderBottom: `1px solid ${D.border}`, background: D.card, flexShrink: 0 }}>
        <div style={{ padding: "0 24px", overflowX: "auto", scrollbarWidth: "none" }}>
          <TabBar active={tab} onSelect={setTab} />
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
        {tab === "overview" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card({ padding: "20px 22px" })}>
              <SectionTitle>Control Description</SectionTitle>
              <p style={{ fontSize: 13, color: D.text, lineHeight: 1.7, margin: 0 }}>{ctrl.description}</p>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, marginBottom: 6 }}>Control Objective</div>
                <p style={{ fontSize: 12, color: D.muted, lineHeight: 1.6, margin: 0 }}>
                  Ensure that {ctrl.name.toLowerCase()} is consistently applied across all relevant systems, processes, and personnel within the organisation's scope, reducing exposure to associated threats and supporting regulatory obligations.
                </p>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, marginBottom: 6 }}>Why This Control Exists</div>
                <p style={{ fontSize: 12, color: D.muted, lineHeight: 1.6, margin: 0 }}>
                  This control addresses the risk of {ctrl.domain.toLowerCase()} failures that could lead to confidentiality, integrity, or availability breaches. Without this control, the organisation would be exposed to audit findings, regulatory penalties, and potential security incidents.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ScoreModel scores={scores} />
            </div>
          </div>

          {/* Linked Frameworks */}
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Multi-Framework Mapping ({allFrameworks.length} frameworks)</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allFrameworks.map((fw, i) => {
                const isPrimary = i === 0;
                return (
                  <div key={fw} style={{ background: isPrimary ? "rgba(59,130,246,0.12)" : "var(--secondary)", border: `1px solid ${isPrimary ? "rgba(99,179,237,0.35)" : D.border}`, borderRadius: 8, padding: "10px 14px", minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {isPrimary && <span style={{ fontSize: 8, fontWeight: 700, color: BLU, background: "rgba(59,130,246,0.2)", borderRadius: 3, padding: "1px 5px" }}>PRIMARY</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isPrimary ? BLU : D.text }}>{fw}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mapped Risks */}
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Mapped Risks (auto-fetched from RiskOps)</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                  {["Risk ID", "Risk Name", "Severity", "Residual Risk"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: D.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linkedRisks.map(risk => {
                  const sevColor = risk.severity === "Critical" ? RED : risk.severity === "High" ? AMB : D.indigo;
                  const resColor = risk.residual === "Low" ? EME : risk.residual === "Medium" ? AMB : RED;
                  return (
                    <tr key={risk.id} style={{ borderBottom: `1px solid ${D.border}`, cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--secondary)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: D.dim }}>{risk.id}</td>
                      <td style={{ padding: "10px 12px", color: D.text, fontWeight: 500 }}>{risk.name}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ color: sevColor, background: `${sevColor}11`, border: `1px solid ${sevColor}33`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{risk.severity}</span></td>
                      <td style={{ padding: "10px 12px" }}><span style={{ color: resColor, background: `${resColor}11`, border: `1px solid ${resColor}33`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{risk.residual}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ── APPLICABILITY ──────────────────────────────────────────────────── */}
        {tab === "applicability" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card({ padding: "20px 22px" })}>
              <SectionTitle>Applicability Status</SectionTitle>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1, background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>✓</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: EME }}>Applicable</div>
                  <div style={{ fontSize: 10, color: D.muted, marginTop: 4 }}>This control is in scope</div>
                </div>
                <div style={{ flex: 1, background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 8, padding: "12px 16px", textAlign: "center", opacity: 0.4 }}>
                  <div style={{ fontSize: 20, marginBottom: 4, color: D.dim }}>✕</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: D.muted }}>Not Applicable</div>
                </div>
              </div>
              <KV k="Applicability Owner" v={ctrl.owner} />
              <KV k="Date Assessed" v="01-Jun-2026" />
              <KV k="Next Review" v="01-Dec-2026" />
              <KV k="Justification" v="Confirmed in scope — all business units" />
            </div>
            <div style={card({ padding: "20px 22px" })}>
              <SectionTitle>In-Scope Business Units</SectionTitle>
              {["Engineering", "Finance", "Legal", "HR", "Sales", "IT Operations", "Marketing", "Operations"].map((dept, i) => (
                <div key={dept} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${D.border}`, fontSize: 12 }}>
                  <span style={{ color: D.text }}>{dept}</span>
                  <span style={{ color: i < 6 ? EME : AMB, fontSize: 10, fontWeight: 700 }}>{i < 6 ? "✓ In Scope" : "⚠ Partial"}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Linked Frameworks — Cross-Reference Mapping</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {allFrameworks.map((fw, i) => (
                <div key={fw} style={{ background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? BLU : D.text }}>{fw}</div>
                  <div style={{ fontSize: 10, color: D.muted, marginTop: 4 }}>{i === 0 ? "Primary framework — authoritative mapping" : "Cross-referenced — satisfies this requirement"}</div>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* ── IMPLEMENTATION ─────────────────────────────────────────────────── */}
        {tab === "implementation" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={card({ padding: "20px 22px" })}>
              <SectionTitle>Deployment Coverage</SectionTitle>
              {[
                { label: "Endpoints",      total: totalEndpoints, covered: covEndpoints, unit: "devices" },
                { label: "Servers",        total: totalServers,   covered: covServers,   unit: "servers" },
                { label: "Cloud Accounts", total: totalCloud,     covered: covCloud,     unit: "accounts" },
                { label: "Applications",   total: totalApps,      covered: covApps,      unit: "apps" },
              ].map(row => {
                const pct = Math.round((row.covered / row.total) * 100);
                const col = pct >= 90 ? EME : pct >= 70 ? AMB : RED;
                return (
                  <div key={row.label} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                      <span style={{ color: D.text, fontWeight: 600 }}>{row.label}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ color: D.muted, fontSize: 11 }}>{row.covered.toLocaleString()} / {row.total.toLocaleString()} {row.unit}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: col }}>{pct}%</span>
                      </div>
                    </div>
                    <ProgressBar pct={pct} color={col} />
                    {pct < 100 && <div style={{ fontSize: 10, color: D.dim, marginTop: 3 }}>{(row.total - row.covered).toLocaleString()} {row.unit} not covered</div>}
                  </div>
                );
              })}
              <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Composite Coverage</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: implStatusColor }}>{implScoreCalc}%</span>
                </div>
                <div style={{ fontSize: 10, color: D.muted, marginTop: 2 }}>({covAll.toLocaleString()} covered / {totalAll.toLocaleString()} total)</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card({ padding: "20px 22px" })}>
                <SectionTitle>Implementation Status</SectionTitle>
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <RingChart pct={implScoreCalc} color={implStatusColor} size={90} />
                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: implStatusColor }}>{implStatusLabel}</div>
                </div>
                <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 14 }}>
                  {[
                    { range: "100%",    label: "Fully Implemented",         color: EME  },
                    { range: "90–99%",  label: "Substantially Implemented",  color: EME  },
                    { range: "70–89%",  label: "Partially Implemented",      color: AMB  },
                    { range: "<70%",    label: "Not Implemented",            color: RED  },
                  ].map(row => (
                    <div key={row.range} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: row.color }}>{row.range}</span>
                      <span style={{ color: D.muted }}>{row.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card({ padding: "16px 18px" })}>
                <KV k="Owner" v={ctrl.owner} />
                <KV k="Last Updated" v="01-Jun-2026" />
                <KV k="Next Assessment" v="01-Dec-2026" />
              </div>
            </div>
          </div>
        </>)}

        {/* ── ASSESSMENT ─────────────────────────────────────────────────────── */}
        {tab === "assessment" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {[
              { label: "Design Effectiveness",    score: assessDesign,    desc: "Is the control properly designed to achieve its objective?" },
              { label: "Operating Effectiveness", score: assessOperating, desc: "Is the control operating consistently as designed?" },
              { label: "Control Effectiveness",   score: assessEffect,    desc: "Combined measure = Design × Operating / 100" },
            ].map(item => {
              const col = item.score >= 90 ? EME : item.score >= 70 ? AMB : RED;
              return (
                <div key={item.label} style={card({ padding: "20px 22px", textAlign: "center" as const })}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.muted, marginBottom: 16 }}>{item.label}</div>
                  <RingChart pct={item.score} color={col} size={96} />
                  <p style={{ fontSize: 11, color: D.dim, marginTop: 12, lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              );
            })}
          </div>

          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Testing History</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                  {["Test Date", "Test Type", "Tester", "Design Score", "Operating Score", "Result", "Finding"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: D.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { date: "01-Jun-2026", type: "Internal Audit",    tester: "Internal Auditor", ds: assessDesign,        os: assessOperating,    result: "Pass",  finding: "None" },
                  { date: "15-Jan-2026", type: "Automated Scan",    tester: "CrowdStrike",      ds: Math.max(60, assessDesign - r(2, 8, 110)),  os: Math.max(60, assessOperating - r(2, 8, 111)), result: "Pass",  finding: "Minor" },
                  { date: "01-Aug-2025", type: "External Audit",    tester: "KPMG",             ds: Math.max(55, assessDesign - r(5, 15, 112)), os: Math.max(55, assessOperating - r(5, 12, 113)), result: ctrl.status === "implemented" ? "Pass" : "Qualified", finding: ctrl.status === "implemented" ? "None" : "1 open" },
                  { date: "01-Mar-2025", type: "Walkthroughs",      tester: "Alex Kim",         ds: Math.max(50, assessDesign - r(8, 18, 114)), os: Math.max(50, assessOperating - r(8, 15, 115)), result: "Pass",  finding: "None" },
                ].map(row => {
                  const col = row.result === "Pass" ? EME : AMB;
                  return (
                    <tr key={row.date} style={{ borderBottom: `1px solid ${D.border}` }}>
                      <td style={{ padding: "10px 12px", color: D.muted, fontSize: 11 }}>{row.date}</td>
                      <td style={{ padding: "10px 12px", color: D.text }}>{row.type}</td>
                      <td style={{ padding: "10px 12px", color: D.muted }}>{row.tester}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono',monospace", color: EME }}>{row.ds}%</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono',monospace", color: EME }}>{row.os}%</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ color: col, fontSize: 10, fontWeight: 700 }}>{row.result}</span></td>
                      <td style={{ padding: "10px 12px", color: D.muted, fontSize: 11 }}>{row.finding}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Auditor Notes</SectionTitle>
            <p style={{ fontSize: 12, color: D.text, lineHeight: 1.7, margin: 0 }}>
              The control demonstrates {assessEffect >= 85 ? "strong" : "adequate"} design and operating effectiveness. {assessDesign >= 90 ? "Control design is well-documented and appropriately aligned with the control objective." : "Minor gaps identified in the control design documentation — recommend updating the control procedure."} {assessOperating >= 90 ? "Operating evidence supports consistent execution across the assessment period." : "Some instances of inconsistent execution were noted; management has been informed."}
            </p>
          </div>
        </>)}

        {/* ── EVIDENCE ───────────────────────────────────────────────────────── */}
        {tab === "evidence" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Automatic", count: Math.ceil(evCount * 0.6), color: EME,  icon: "⚡", desc: "Microsoft, AWS, Azure, CrowdStrike, Qualys" },
              { label: "Manual",    count: Math.floor(evCount * 0.3), color: BLU,  icon: "📤", desc: "Upload evidence files directly" },
              { label: "Third Party",count: Math.floor(evCount * 0.1) + 1, color: D.purple, icon: "📋", desc: "External audit reports and certifications" },
            ].map(s => (
              <div key={s.label} style={card({ padding: "16px 18px" })}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: s.color, marginTop: 4 }}>{s.count}</div>
                <div style={{ fontSize: 10, color: D.dim, marginTop: 6 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <div style={card({ padding: "0", overflow: "hidden" })}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${D.border}` }}>
              <SectionTitle>Evidence Registry</SectionTitle>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${D.border}`, background: D.card }}>
                  {["Evidence Type", "Source", "Collected Date", "Status", "Auditor Review", "Actions"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: D.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidenceItems.map((ev, i) => {
                  const stColor = ev.status === "Valid" ? EME : RED;
                  const rvColor = ev.review === "Approved" ? EME : ev.review === "Pending" ? AMB : RED;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${D.border}` }}>
                      <td style={{ padding: "10px 14px", color: D.text, fontWeight: 600 }}>{ev.type}</td>
                      <td style={{ padding: "10px 14px", color: BLU }}>{ev.source}</td>
                      <td style={{ padding: "10px 14px", color: D.muted, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{ev.date}</td>
                      <td style={{ padding: "10px 14px" }}><span style={{ color: stColor, background: `${stColor}11`, border: `1px solid ${stColor}33`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{ev.status}</span></td>
                      <td style={{ padding: "10px 14px" }}><span style={{ color: rvColor, background: `${rvColor}11`, border: `1px solid ${rvColor}33`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{ev.review}</span></td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${D.border}`, background: "none", color: BLU, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>View</button>
                          <button style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${D.border}`, background: "none", color: D.muted, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>↓</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ── BROWSER CHECKS ─────────────────────────────────────────────────── */}
        {tab === "browser-checks" && (<>

          {/* Stats bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Checks Defined", value: bcChecks.length, color: BLU },
              { label: "Passing",  value: bcRuns.filter(r => r.verdict === "pass").length,  color: EME },
              { label: "Failing",  value: bcRuns.filter(r => r.verdict === "fail").length,  color: RED },
              { label: "Last Run", value: bcRuns.length ? new Date(bcRuns[0]!.createdAt).toLocaleDateString("en-GB") : "Never", color: D.muted as string },
            ].map(s => (
              <div key={s.label} style={card({ padding: "16px 18px" })}>
                <div style={{ fontSize: 10, fontWeight: 700, color: D.muted, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Add check + Export buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {bcChecks.length > 0 && (
              <button
                onClick={handleExportEvidencePdf}
                disabled={bcExporting}
                title="Export all browser check results as a PDF evidence package"
                style={{
                  padding: "8px 16px", borderRadius: 7, border: `1px solid ${D.border}`,
                  cursor: bcExporting ? "not-allowed" : "pointer", fontFamily: "inherit",
                  background: "none", color: D.text, fontWeight: 700, fontSize: 12,
                  opacity: bcExporting ? 0.6 : 1,
                }}
              >
                {bcExporting ? "⏳ Exporting…" : "📄 Export Evidence PDF"}
              </button>
            )}
            <button onClick={() => setBcForm(f => ({ ...f, open: !f.open }))} style={{
              padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: BLU, color: "#fff", fontWeight: 700, fontSize: 12,
            }}>
              {bcForm.open ? "✕ Cancel" : "+ Add Browser Check"}
            </button>
          </div>

          {/* Add check form */}
          {bcForm.open && (
            <div style={card({ padding: "20px 22px" })}>
              <SectionTitle>New Browser Check</SectionTitle>

              {/* Template picker */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: D.muted, marginBottom: 8 }}>Choose a template (optional)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {bcTemplates.map(tmpl => (
                    <button key={tmpl.id} onClick={() => handleSelectTemplate(tmpl)} style={{
                      padding: "6px 12px", borderRadius: 6, border: `1px solid ${bcForm.templateId === tmpl.id ? BLU : D.border}`,
                      background: bcForm.templateId === tmpl.id ? "rgba(59,130,246,0.1)" : "none",
                      color: bcForm.templateId === tmpl.id ? BLU : D.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600,
                    }}>{tmpl.name}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Check Name *</div>
                  <input value={bcForm.name} onChange={e => setBcForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. GitHub Branch Protection" style={{ padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Schedule (cron)</div>
                  <input value={bcForm.cron} onChange={e => setBcForm(f => ({ ...f, cron: e.target.value }))}
                    placeholder="0 8 * * *" style={{ padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>URL to verify *</div>
                <input value={bcForm.url} onChange={e => setBcForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://github.com/org/repo/settings/branches" style={{ padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Verification instruction (natural language) *</div>
                <textarea value={bcForm.instruction} onChange={e => setBcForm(f => ({ ...f, instruction: e.target.value }))}
                  rows={3} placeholder="e.g. Confirm that branch protection is enabled on the main branch and requires at least 1 reviewer before merging."
                  style={{ padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const }} />
              </div>

              {bcError && <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>⚠ {bcError}</div>}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveCheck} disabled={bcSaving} style={{
                  padding: "8px 18px", borderRadius: 6, border: "none", cursor: bcSaving ? "not-allowed" : "pointer",
                  background: EME, color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: "inherit", opacity: bcSaving ? 0.6 : 1,
                }}>{bcSaving ? "Saving…" : "Save Check"}</button>
                <button onClick={() => { setBcForm({ open: false, templateId: "", name: "", url: "", instruction: "", cron: "0 8 * * *" }); setBcError(null); }} style={{
                  padding: "8px 14px", borderRadius: 6, border: `1px solid ${D.border}`, cursor: "pointer",
                  background: "none", color: D.muted, fontSize: 12, fontFamily: "inherit",
                }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Checks list */}
          {bcLoading ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: D.dim, fontSize: 13 }}>Loading browser checks…</div>
          ) : bcChecks.length === 0 ? (
            <div style={card({ padding: "40px 24px", textAlign: "center" as const })}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 8 }}>No browser checks configured</div>
              <div style={{ fontSize: 12, color: D.muted, maxWidth: 460, margin: "0 auto", lineHeight: 1.6, marginBottom: 16 }}>
                Browser checks navigate to a live URL with a headless browser, verify a control visually, and capture an auditable screenshot.
              </div>
              <button onClick={() => setBcForm(f => ({ ...f, open: true }))} style={{
                padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: BLU, color: "#fff", fontWeight: 700, fontSize: 12,
              }}>+ Add your first browser check</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bcChecks.map(check => {
                const isRunning = bcRunning === check.checkId;
                const statusColor = check.lastStatus === "pass" ? EME : check.lastStatus === "fail" ? RED : check.lastStatus === "error" ? RED : D.muted as string;
                const latestRun = bcRuns.find(r => r.checkId === check.checkId);
                const isExpanded = bcExpanded === check.checkId;

                return (
                  <div key={check.checkId} style={card({ padding: "0", overflow: "hidden" })}>
                    {/* Check header */}
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, borderBottom: isExpanded ? `1px solid ${D.border}` : "none" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>{check.name}</span>
                          {check.templateId && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: BLU, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 3, padding: "1px 6px" }}>TEMPLATE</span>
                          )}
                          {check.lastStatus && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, background: `${statusColor}11`, border: `1px solid ${statusColor}33`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" as const }}>
                              {check.lastStatus}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: D.muted, display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                          <span>🔗 <a href={check.url} target="_blank" rel="noreferrer" style={{ color: BLU, textDecoration: "none" }}>{check.url.length > 50 ? check.url.slice(0, 50) + "…" : check.url}</a></span>
                          <span>⏱ {check.scheduleCron}</span>
                          {check.lastRunAt && <span>Last run: {new Date(check.lastRunAt).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <button onClick={() => handleRunCheck(check)} disabled={isRunning || !!bcRunning} style={{
                          padding: "6px 12px", borderRadius: 6, border: "none", cursor: (isRunning || !!bcRunning) ? "not-allowed" : "pointer",
                          background: isRunning ? "rgba(217,119,6,0.12)" : "rgba(59,130,246,0.12)",
                          color: isRunning ? AMB : BLU, fontWeight: 700, fontSize: 11, fontFamily: "inherit",
                          opacity: (!!bcRunning && !isRunning) ? 0.5 : 1,
                        }}>
                          {isRunning ? "⟳ Running…" : "▶ Run Now"}
                        </button>
                        <button onClick={() => setBcExpanded(isExpanded ? null : check.checkId)} style={{
                          padding: "6px 10px", borderRadius: 6, border: `1px solid ${D.border}`, cursor: "pointer",
                          background: "none", color: D.muted, fontSize: 11, fontFamily: "inherit",
                        }}>{isExpanded ? "▲" : "▼"}</button>
                        <button onClick={() => { if (confirm("Delete this browser check?")) handleDeleteCheck(check.checkId); }} style={{
                          padding: "6px 10px", borderRadius: 6, border: `1px solid ${D.border}`, cursor: "pointer",
                          background: "none", color: RED, fontSize: 11, fontFamily: "inherit",
                        }}>✕</button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: "14px 18px" }}>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, marginBottom: 4 }}>Instruction</div>
                          <div style={{ fontSize: 12, color: D.text, lineHeight: 1.6, background: "var(--secondary)", padding: "10px 12px", borderRadius: 6 }}>{check.instruction}</div>
                        </div>

                        {check.lastError && (
                          <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 4 }}>LAST ERROR</div>
                            <div style={{ fontSize: 11, color: D.text }}>{check.lastError}</div>
                          </div>
                        )}

                        {/* Recent runs */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, marginBottom: 8 }}>Run History</div>
                        {bcRuns.filter(r => r.checkId === check.checkId).slice(0, 5).length === 0 ? (
                          <div style={{ fontSize: 12, color: D.dim }}>No runs yet for this check.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {bcRuns.filter(r => r.checkId === check.checkId).slice(0, 5).map(run => {
                              const rc = run.verdict === "pass" ? EME : run.verdict === "fail" ? RED : D.muted as string;
                              return (
                                <div key={run.runId} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", background: "var(--secondary)", borderRadius: 6 }}>
                                  {/* Screenshot thumbnail */}
                                  {run.screenshotUrl && (() => {
                                    const blobUrl = bcScreenshots.get(run.screenshotUrl);
                                    return (
                                      <div
                                        style={{ width: 80, height: 50, background: "var(--border)", borderRadius: 4, overflow: "hidden", flexShrink: 0, cursor: blobUrl ? "pointer" : "default", border: `1px solid ${D.border}` }}
                                        onClick={() => { if (blobUrl) { const a = document.createElement("a"); a.href = blobUrl; a.target = "_blank"; a.click(); } }}
                                        title={blobUrl ? "Click to view full screenshot" : "Loading screenshot…"}
                                      >
                                        {blobUrl
                                          ? <img src={blobUrl} alt="screenshot" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⏳</div>
                                        }
                                      </div>
                                    );
                                  })()}
                                  {!run.screenshotUrl && (
                                    <div style={{ width: 80, height: 50, background: "var(--border)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>📷</div>
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: rc, background: `${rc}11`, border: `1px solid ${rc}33`, borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" as const }}>
                                        {run.verdict ?? run.status}
                                      </span>
                                      <span style={{ fontSize: 10, color: D.dim }}>{new Date(run.createdAt).toLocaleString()}</span>
                                      {run.durationMs && <span style={{ fontSize: 10, color: D.dim }}>{(run.durationMs / 1000).toFixed(1)}s</span>}
                                      <span style={{ fontSize: 10, color: D.dim }}>by {run.triggeredBy}</span>
                                    </div>
                                    {run.errorMessage && <div style={{ fontSize: 11, color: RED }}>{run.errorMessage}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Per-check alert override */}
                        {(() => {
                          const pf = getPerCheckForm(check);
                          const hasOverride = !!(check.alertSlackWebhookUrl || check.alertEmailRecipients?.length > 0);
                          return (
                            <div style={{ marginTop: 16, borderTop: `1px solid ${D.border}`, paddingTop: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase" as const, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                Alert Destination Override
                                {hasOverride && <span style={{ fontSize: 9, fontWeight: 700, color: BLU, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 3, padding: "1px 6px" }}>OVERRIDING GLOBAL</span>}
                              </div>
                              <div style={{ fontSize: 11, color: D.muted, marginBottom: 10 }}>
                                Optional: set per-check Slack/email destinations that override the global alert settings for this check only. Leave blank to use global defaults.
                              </div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: D.muted, marginBottom: 3 }}>Slack Webhook Override</div>
                                <input
                                  value={pf.slack}
                                  onChange={e => setPerCheckField(check.checkId, { slack: e.target.value })}
                                  placeholder="https://hooks.slack.com/services/… (or leave blank)"
                                  style={{ padding: "7px 10px", borderRadius: 5, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 11, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const }}
                                />
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 11, color: D.muted, marginBottom: 3 }}>Email Recipients Override</div>
                                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 6 }}>
                                  {pf.emails.map((em, i) => (
                                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: BLU }}>
                                      {em}
                                      <button onClick={() => setPerCheckField(check.checkId, { emails: pf.emails.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input
                                    value={pf.emailInput}
                                    onChange={e => setPerCheckField(check.checkId, { emailInput: e.target.value })}
                                    onKeyDown={e => { if ((e.key === "Enter" || e.key === ",") && pf.emailInput.trim()) { e.preventDefault(); setPerCheckField(check.checkId, { emails: [...pf.emails, pf.emailInput.trim()], emailInput: "" }); } }}
                                    placeholder="Add email then press Enter"
                                    style={{ flex: 1, padding: "7px 10px", borderRadius: 5, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 11, fontFamily: "inherit", outline: "none" }}
                                  />
                                  <button onClick={() => { if (pf.emailInput.trim()) setPerCheckField(check.checkId, { emails: [...pf.emails, pf.emailInput.trim()], emailInput: "" }); }} style={{ padding: "7px 12px", borderRadius: 5, border: `1px solid ${D.border}`, cursor: "pointer", background: "none", color: D.muted, fontSize: 11, fontFamily: "inherit" }}>+ Add</button>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <button onClick={() => handleSavePerCheckAlertConfig(check)} disabled={pf.saving} style={{ padding: "6px 14px", borderRadius: 5, border: "none", cursor: pf.saving ? "not-allowed" : "pointer", background: EME, color: "#fff", fontWeight: 700, fontSize: 11, fontFamily: "inherit", opacity: pf.saving ? 0.6 : 1 }}>
                                  {pf.saving ? "Saving…" : "Save Override"}
                                </button>
                                {(check.alertSlackWebhookUrl || check.alertEmailRecipients?.length > 0) && (
                                  <button onClick={async () => {
                                    setPerCheckField(check.checkId, { saving: true, msg: null });
                                    try {
                                      const res = await fetch(
                                        api(`/controls/${encodeURIComponent(controlId)}/browser-checks/${check.checkId}/alert-config`),
                                        { method: "PUT", headers: { ...getBcAuthH(), "Content-Type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: null, emailRecipients: [] }) }
                                      );
                                      const data = await res.json();
                                      if (res.ok) {
                                        setBcChecks(prev => prev.map(c => c.checkId === check.checkId ? { ...c, alertSlackWebhookUrl: null, alertEmailRecipients: [] } : c));
                                        setPerCheckField(check.checkId, { slack: "", emails: [], emailInput: "", saving: false, msg: "Override cleared." });
                                        setTimeout(() => setPerCheckField(check.checkId, { msg: null }), 3000);
                                      } else { setPerCheckField(check.checkId, { saving: false, msg: data.error ?? "Failed" }); }
                                    } catch { setPerCheckField(check.checkId, { saving: false, msg: "Network error" }); }
                                  }} style={{ padding: "6px 12px", borderRadius: 5, border: `1px solid ${D.border}`, cursor: "pointer", background: "none", color: D.muted, fontSize: 11, fontFamily: "inherit" }}>
                                    Clear Override
                                  </button>
                                )}
                                {pf.msg && <span style={{ fontSize: 11, color: (pf.msg === "Saved." || pf.msg === "Override cleared.") ? EME : RED }}>{pf.msg}</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Templates reference */}
          <div style={card({ padding: "18px 20px" })}>
            <SectionTitle>Pre-built Template Library</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {bcTemplates.map(tmpl => (
                <div key={tmpl.id} style={{ background: "var(--secondary)", border: `1px solid ${D.border}`, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{tmpl.name}</div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: D.indigo, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" as const }}>{tmpl.category}</span>
                  </div>
                  <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5, marginBottom: 8 }}>{tmpl.description}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: 8 }}>
                    {tmpl.frameworks.map(fw => (
                      <span key={fw} style={{ fontSize: 9, color: BLU, background: "rgba(59,130,246,0.1)", borderRadius: 3, padding: "1px 5px" }}>{fw}</span>
                    ))}
                  </div>
                  <button onClick={() => setBcForm(f => ({ ...f, open: true, templateId: tmpl.id, name: tmpl.name, url: tmpl.url, instruction: tmpl.instruction, cron: tmpl.scheduleCron }))} style={{
                    padding: "5px 10px", borderRadius: 5, border: `1px solid ${D.border}`, cursor: "pointer",
                    background: "none", color: BLU, fontSize: 10, fontFamily: "inherit", fontWeight: 600,
                  }}>Use Template →</button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Browser Check Alert Settings ────────────────────────────────── */}
          <div style={card({ padding: "0", overflow: "hidden" })}>
            <button onClick={() => setBcAlertOpen(o => !o)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>🔔 Failure Alert Settings</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  background: bcAlertSettings.enabled ? "rgba(16,185,129,0.12)" : "rgba(100,116,139,0.12)",
                  color: bcAlertSettings.enabled ? EME : D.muted,
                }}>{bcAlertSettings.enabled ? "ENABLED" : "DISABLED"}</span>
              </div>
              <span style={{ fontSize: 11, color: D.muted }}>{bcAlertOpen ? "▲" : "▼"}</span>
            </button>
            {bcAlertOpen && (
              <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${D.border}` }}>
                <div style={{ fontSize: 12, color: D.muted, margin: "14px 0 16px", lineHeight: 1.6 }}>
                  Alert the team via Slack or email whenever a browser check returns a <strong>fail</strong> or <strong>error</strong> verdict. Alerts include the check name, URL, verdict, screenshot link, and control ref.
                </div>

                {/* Enable toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div
                    onClick={() => setBcAlertEnabled(e => !e)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer", transition: "background 0.2s",
                      background: bcAlertEnabled ? EME : D.border, position: "relative" as const,
                    }}
                  >
                    <div style={{
                      position: "absolute" as const, top: 3, left: bcAlertEnabled ? 18 : 3,
                      width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: D.text, fontWeight: 600 }}>
                    {bcAlertEnabled ? "Alerts enabled" : "Alerts disabled"}
                  </span>
                </div>

                {/* Slack webhook */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Slack Webhook URL</div>
                  <input
                    value={bcAlertSlack}
                    onChange={e => setBcAlertSlack(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    style={{ padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" as const }}
                  />
                </div>

                {/* Email recipients */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Email Recipients</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      value={bcAlertNewEmail}
                      onChange={e => setBcAlertNewEmail(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === "Enter" || e.key === ",") && bcAlertNewEmail.trim()) {
                          e.preventDefault();
                          const em = bcAlertNewEmail.trim().replace(/,$/, "");
                          if (em && !bcAlertEmails.includes(em)) setBcAlertEmails(prev => [...prev, em]);
                          setBcAlertNewEmail("");
                        }
                      }}
                      placeholder="email@example.com — press Enter to add"
                      style={{ flex: 1, padding: "8px 11px", borderRadius: 6, border: `1px solid ${D.border}`, background: "var(--input)", color: D.text, fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                    <button
                      onClick={() => {
                        const em = bcAlertNewEmail.trim();
                        if (em && !bcAlertEmails.includes(em)) setBcAlertEmails(prev => [...prev, em]);
                        setBcAlertNewEmail("");
                      }}
                      style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${D.border}`, cursor: "pointer", background: "none", color: BLU, fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
                    >Add</button>
                  </div>
                  {bcAlertEmails.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                      {bcAlertEmails.map(em => (
                        <span key={em} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: "rgba(59,130,246,0.08)", border: `1px solid ${D.border}`, fontSize: 11, color: D.text }}>
                          {em}
                          <button onClick={() => setBcAlertEmails(prev => prev.filter(e => e !== em))} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {bcAlertMsg && (
                  <div style={{ fontSize: 12, color: bcAlertMsg.ok ? EME : RED, marginBottom: 10 }}>
                    {bcAlertMsg.ok ? "✓" : "⚠"} {bcAlertMsg.text}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <button onClick={handleSaveBcAlertSettings} disabled={bcAlertSaving} style={{
                    padding: "8px 18px", borderRadius: 6, border: "none", cursor: bcAlertSaving ? "not-allowed" : "pointer",
                    background: BLU, color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: "inherit", opacity: bcAlertSaving ? 0.6 : 1,
                  }}>{bcAlertSaving ? "Saving…" : "Save Settings"}</button>
                  <button onClick={handleTestBcAlert} disabled={bcAlertTesting || !bcAlertSettings.enabled} title={!bcAlertSettings.enabled ? "Enable and save settings first" : "Send a test alert"} style={{
                    padding: "8px 14px", borderRadius: 6, border: `1px solid ${D.border}`, cursor: (bcAlertTesting || !bcAlertSettings.enabled) ? "not-allowed" : "pointer",
                    background: "none", color: bcAlertSettings.enabled ? D.text : D.muted, fontSize: 12, fontFamily: "inherit", opacity: bcAlertTesting ? 0.6 : 1,
                  }}>{bcAlertTesting ? "Sending…" : "Send Test Alert"}</button>
                </div>

                {/* Delivery history */}
                {bcAlertHistory.length > 0 && (<>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.muted, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 8 }}>Recent Deliveries</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {bcAlertHistory.slice(0, 10).map(h => {
                      const statusColor = h.status === "sent" ? EME : h.status === "failed" ? RED : AMB;
                      return (
                        <div key={h.id} style={{ padding: "8px 12px", borderRadius: 7, background: "var(--secondary)", border: `1px solid ${D.border}`, fontSize: 11 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: D.text }}>{h.checkName}</span>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ color: h.verdict === "fail" ? RED : AMB, fontWeight: 700, fontSize: 10 }}>{h.verdict.toUpperCase()}</span>
                              <span style={{ color: statusColor, fontWeight: 700, fontSize: 10 }}>{h.status.toUpperCase()}</span>
                            </div>
                          </div>
                          <div style={{ color: D.muted, display: "flex", gap: 10 }}>
                            <span>{h.channel === "slack" ? "💬 Slack" : "📧 " + h.destination}</span>
                            <span>·</span>
                            <span>{h.sentAt ? new Date(h.sentAt).toLocaleString("en-GB") : new Date(h.createdAt).toLocaleString("en-GB")}</span>
                          </div>
                          {h.error && <div style={{ color: RED, marginTop: 3, fontSize: 10 }}>{h.error}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>)}
              </div>
            )}
          </div>

        </>)}

        {/* ── ASSETS ─────────────────────────────────────────────────────────── */}
        {tab === "assets" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Systems Covered",      covered: covEndpoints + covServers, total: totalEndpoints + totalServers, icon: "🖥" },
              { label: "Business Applications",covered: covApps,   total: totalApps,  icon: "📱" },
              { label: "Vendors",              covered: r(10, 16, 120), total: r(14, 20, 121), icon: "🏢" },
              { label: "Databases",            covered: r(30, 42, 122), total: r(38, 50, 123), icon: "🗄" },
            ].map(row => {
              const pct = Math.round((row.covered / row.total) * 100);
              const col = pct >= 90 ? EME : pct >= 70 ? AMB : RED;
              return (
                <div key={row.label} style={card({ padding: "18px 20px" })}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{row.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.muted, marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: col }}>{row.covered.toLocaleString()}<span style={{ fontSize: 14, color: D.dim }}>/{row.total.toLocaleString()}</span></div>
                  <ProgressBar pct={pct} color={col} />
                  <div style={{ fontSize: 10, color: D.dim, marginTop: 4 }}>{pct}% coverage</div>
                </div>
              );
            })}
          </div>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Coverage automatically updates via AssetOps integration</SectionTitle>
            <p style={{ fontSize: 12, color: D.muted, margin: 0, lineHeight: 1.6 }}>
              Asset coverage is pulled in real-time from AssetOps. New assets discovered in the asset inventory are automatically assessed for control coverage. Coverage gaps trigger automatic notifications to the control owner.
            </p>
          </div>
        </>)}

        {/* ── RISKS ──────────────────────────────────────────────────────────── */}
        {tab === "risks" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Linked Risks from RiskOps</SectionTitle>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 14 }}>
              ℹ When the control score drops, residual risk automatically increases in RiskOps.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                  {["Risk ID", "Risk Name", "Severity", "Control Contribution", "Residual Risk", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: D.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linkedRisks.map(risk => {
                  const sevColor = risk.severity === "Critical" ? RED : risk.severity === "High" ? AMB : D.indigo;
                  const resColor = risk.residual === "Low" ? EME : risk.residual === "Medium" ? AMB : RED;
                  return (
                    <tr key={risk.id} style={{ borderBottom: `1px solid ${D.border}` }}>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: D.dim }}>{risk.id}</td>
                      <td style={{ padding: "10px 12px", color: D.text }}>{risk.name}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ color: sevColor, fontSize: 10, fontWeight: 700 }}>{risk.severity}</span></td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ProgressBar pct={composite} color={EME} />
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: EME, minWidth: 35 }}>{composite}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}><span style={{ color: resColor, background: `${resColor}11`, border: `1px solid ${resColor}33`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{risk.residual}</span></td>
                      <td style={{ padding: "10px 12px", color: D.muted, fontSize: 11 }}>Monitored</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ── POLICIES ───────────────────────────────────────────────────────── */}
        {tab === "policies" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Mapped Policies ({mappedPolicies.length})</SectionTitle>
            {mappedPolicies.map((pol, i) => (
              <div key={pol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${D.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{pol}</div>
                  <div style={{ fontSize: 11, color: D.muted, marginTop: 3 }}>PolicyOps · Version {2 + i}.{r(0, 3, 130 + i)} · Approved by CISO</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: D.dim }}>Approval Date</div>
                    <div style={{ fontSize: 11, color: D.muted }}>01-Mar-2026</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: D.dim }}>Review Date</div>
                    <div style={{ fontSize: 11, color: D.muted }}>01-Mar-2027</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: EME, background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 4, padding: "2px 7px" }}>Active</span>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── PROCEDURES ─────────────────────────────────────────────────────── */}
        {tab === "procedures" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Mapped SOPs ({mappedProcedures.length})</SectionTitle>
            {mappedProcedures.map((proc, i) => (
              <div key={proc} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${D.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{proc}</div>
                  <div style={{ fontSize: 11, color: D.muted, marginTop: 3 }}>SOP-{String(r(100, 999, 140 + i))} · Owner: {ctrl.owner} · {r(3, 10, 145 + i)} steps</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: EME, background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 4, padding: "2px 7px" }}>Active</span>
                  <span style={{ fontSize: 10, color: D.dim }}>Updated {r(1, 6, 150 + i)} months ago</span>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── INCIDENTS ──────────────────────────────────────────────────────── */}
        {tab === "incidents" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Related Incidents (last 12 months)</SectionTitle>
            {r(0, 2, 160) === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: D.dim }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: EME }}>No incidents related to this control</div>
                <div style={{ fontSize: 12, color: D.dim, marginTop: 4 }}>Last 12 months — clean record</div>
              </div>
            ) : (
              [1, 2].slice(0, r(1, 2, 160)).map(i => (
                <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: D.dim }}>INC-{r(1000, 9999, 161 + i)}</span>
                      <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginTop: 2 }}>Control bypass detected — {ctrl.domain}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "2px 7px" }}>Resolved</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>)}

        {/* ── EXCEPTIONS ─────────────────────────────────────────────────────── */}
        {tab === "exceptions" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Control Exceptions</SectionTitle>
            {r(0, 1, 170) === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: D.dim }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: EME }}>No active exceptions for this control</div>
              </div>
            ) : (
              <div>
                {[{ sys: "Legacy SAP ERP (v6.0)", reason: "Technical constraint — vendor end-of-life, upgrade in Q3 2026", comp: "Enhanced monitoring, isolated network segment, manual compensating review monthly", approval: "CISO", expiry: "30-Sep-2026" }].map((ex, i) => (
                  <div key={i} style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 8, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: AMB }}>{ex.sys}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "2px 7px" }}>Active Exception</span>
                    </div>
                    <KV k="Reason" v={ex.reason} />
                    <KV k="Compensating Controls" v={ex.comp} />
                    <KV k="Approved by" v={ex.approval} />
                    <KV k="Expiry" v={ex.expiry} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

        {/* ── VENDORS ────────────────────────────────────────────────────────── */}
        {tab === "vendors" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Vendor Coverage</SectionTitle>
            {["Accenture Cloud", "AWS", "Salesforce", "Stripe", "Databricks"].slice(0, r(3, 5, 180)).map((v, i) => (
              <div key={v} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${D.border}`, fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: D.text }}>{v}</div>
                  <div style={{ fontSize: 10, color: D.muted, marginTop: 2 }}>Tier {i < 2 ? 1 : 2} · Last assessed {r(1, 8, 181 + i)} months ago</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: i < 3 ? EME : AMB, background: i < 3 ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.1)", border: `1px solid ${i < 3 ? "rgba(5,150,105,0.25)" : "rgba(217,119,6,0.25)"}`, borderRadius: 4, padding: "2px 7px" }}>{i < 3 ? "Compliant" : "In Review"}</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ── AI SYSTEMS ─────────────────────────────────────────────────────── */}
        {tab === "ai-systems" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>AI Systems Coverage</SectionTitle>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 14 }}>
              AI systems subject to this control per ISO 42001 / EU AI Act mapping.
            </div>
            {["ChatGPT Integration (OpenAI)", "Internal ML Pipeline (Databricks)", "Fraud Detection Model (AWS SageMaker)"].slice(0, r(1, 3, 190)).map((sys, i) => (
              <div key={sys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${D.border}`, fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: D.text }}>{sys}</div>
                  <div style={{ fontSize: 10, color: D.muted, marginTop: 2 }}>Risk Tier: {i === 0 ? "High" : "Medium"} · ISO 42001 mapped</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: i < 2 ? EME : AMB, background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 4, padding: "2px 7px" }}>Covered</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ── FINDINGS ───────────────────────────────────────────────────────── */}
        {tab === "findings" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Open Findings",   count: ctrl.status === "implemented" ? r(0, 1, 200) : r(1, 3, 200), color: RED },
              { label: "Closed Findings", count: r(2, 6, 201), color: EME },
            ].map(item => (
              <div key={item.label} style={card({ padding: "18px 20px", textAlign: "center" as const })}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.muted, marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: item.color }}>{item.count}</div>
              </div>
            ))}
          </div>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Finding Details (from AuditOps)</SectionTitle>
            {ctrl.status !== "implemented" ? (
              <div style={{ padding: "12px 0", borderBottom: `1px solid ${D.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: AMB }}>Control not consistently applied across all systems</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: "rgba(217,119,6,0.1)", borderRadius: 4, padding: "2px 7px" }}>Open</span>
                </div>
                <div style={{ fontSize: 11, color: D.muted }}>Raised by: Internal Audit · Date: 15-Apr-2026 · Due: 30-Sep-2026</div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "30px 0", color: D.dim }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: EME }}>No open findings</div>
              </div>
            )}
          </div>
        </>)}

        {/* ── CAPA ───────────────────────────────────────────────────────────── */}
        {tab === "capa" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Corrective Actions (CAPA)</SectionTitle>
            {ctrl.status !== "implemented" ? (
              <div style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 8, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: AMB }}>CAPA-{r(100, 999, 210)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: AMB, background: "rgba(217,119,6,0.1)", borderRadius: 4, padding: "2px 7px" }}>In Progress</span>
                </div>
                <KV k="Finding" v={`${ctrl.name} not fully implemented — ${totalAll - covAll} assets uncovered`} />
                <KV k="Corrective Action" v={`Extend ${ctrl.name.toLowerCase()} deployment to remaining ${totalAll - covAll} in-scope assets`} />
                <KV k="Owner" v={ctrl.owner} />
                <KV k="Target Date" v="30-Sep-2026" />
                <KV k="Progress" v={`${covAll}/${totalAll} complete`} />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: D.dim }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: EME }}>No open corrective actions</div>
              </div>
            )}
          </div>
        </>)}

        {/* ── MONITORING ─────────────────────────────────────────────────────── */}
        {tab === "monitoring" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {[
              { label: "Yesterday",  score: Math.min(100, composite + r(1, 4, 220)), color: BLU },
              { label: "Today",      score: composite,                                color: compColor },
              { label: "30-Day Avg", score: Math.min(100, composite + r(-3, 5, 221)), color: D.purple },
            ].map(item => (
              <div key={item.label} style={card({ padding: "20px 22px", textAlign: "center" as const })}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.muted, marginBottom: 16 }}>{item.label}</div>
                <RingChart pct={item.score} color={item.color} size={88} />
              </div>
            ))}
          </div>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Continuous Monitoring — Live Compliance Score</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 7 }, (_, i) => {
                const day = new Date(2026, 5, 14 - i);
                const dayStr = day.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                const dayScore = Math.min(100, Math.max(0, composite + r(-8, 6, 230 + i)));
                const col = dayScore >= 90 ? EME : dayScore >= 70 ? AMB : RED;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, color: D.muted, minWidth: 60, fontFamily: "'JetBrains Mono',monospace" }}>{dayStr}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--secondary)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${dayScore}%`, height: "100%", background: `linear-gradient(90deg,${col}66,${col})`, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 38, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{dayScore}%</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.indigo, marginBottom: 4 }}>Auto Alerts</div>
              <div style={{ fontSize: 11, color: D.muted }}>Alert threshold set at {Math.max(60, composite - 10)}%. Notifications sent to {ctrl.owner} and CISO when score drops below threshold.</div>
            </div>
          </div>
        </>)}

        {/* ── AUDIT HISTORY ──────────────────────────────────────────────────── */}
        {tab === "audit-history" && (<>
          <div style={card({ padding: "20px 22px" })}>
            <SectionTitle>Audit History — Activity Timeline</SectionTitle>
            {[
              { date: "01-Jun-2026", action: "Status updated to Implemented", user: ctrl.owner, type: "update" },
              { date: "15-Apr-2026", action: "Assessment completed — Design: " + assessDesign + "%, Operating: " + assessOperating + "%", user: "Internal Auditor", type: "assessment" },
              { date: "01-Mar-2026", action: "Evidence uploaded: " + evidenceItems[0]?.type, user: ctrl.owner, type: "evidence" },
              { date: "15-Jan-2026", action: "Automated scan completed — " + evScore + "% compliance", user: "System", type: "scan" },
              { date: "01-Nov-2025", action: "Control added to scope — " + ctrl.framework, user: "Alex Kim", type: "create" },
              { date: "01-Sep-2025", action: "Owner assigned: " + ctrl.owner, user: "CISO", type: "admin" },
            ].map((item, i) => {
              const typeColor = item.type === "update" ? EME : item.type === "assessment" ? BLU : item.type === "evidence" ? D.purple : item.type === "scan" ? D.indigo : item.type === "create" ? AMB : D.muted;
              return (
                <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: D.text }}>{item.action}</div>
                    <div style={{ fontSize: 11, color: D.dim, marginTop: 3 }}>{item.date} · by {item.user}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

      </div>
    </div>
  );
}
