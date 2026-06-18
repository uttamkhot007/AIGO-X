import { useState, useEffect, useRef } from "react";
import {
  Shield, ShieldCheck, CheckCircle2, ChevronRight, ChevronLeft,
  Loader2, AlertTriangle, Server, Cpu, Eye, RefreshCw,
  Wifi, Lock, Terminal, Building2, ExternalLink,
} from "lucide-react";

const API = "/admin-api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WizardState {
  phase: string;
  progress: number;
  logs: string[];
  agent_id: string | null;
  error: string | null;
  config: WizardConfig | null;
}

interface WizardConfig {
  tenant_id: string;
  server_url: string;
  install_path: string;
  features: string[];
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEPS = ["Welcome", "License", "Features", "Configuration", "Installing", "Complete"];

const DEFAULT_FEATURES = [
  { id: "compliance",   label: "Compliance Monitoring",     desc: "Continuous policy checks, CIS/NIST benchmarks, audit evidence collection", icon: <ShieldCheck size={18} />, required: true },
  { id: "threat",       label: "Threat Detection",          desc: "Real-time behavioural analysis, IOC scanning, MITRE ATT&CK mapping",       icon: <Eye size={18} />,         required: false },
  { id: "remediation",  label: "Auto-Remediation",          desc: "Automated fixes for common misconfigurations with audit trail",             icon: <RefreshCw size={18} />,   required: false },
  { id: "offline",      label: "Offline Mode",              desc: "Encrypted local telemetry cache — syncs automatically on reconnect",        icon: <Wifi size={18} />,        required: false },
  { id: "azure_ad",     label: "Azure AD Integration",      desc: "Device compliance state, conditional access posture reporting",             icon: <Building2 size={18} />,   required: false },
  { id: "hardening",    label: "Endpoint Hardening",        desc: "CIS hardening checks, tamper-proof service, immutable binary protection",   icon: <Lock size={18} />,        required: false },
];

const EULA_TEXT = `AIGO-X ENDPOINT AGENT — END-USER LICENSE AGREEMENT

Version 2.2 | Effective: 2025

IMPORTANT: PLEASE READ THIS AGREEMENT CAREFULLY BEFORE INSTALLING OR USING THE SOFTWARE.

1. GRANT OF LICENSE
AIGO-X GRC Platform ("Company") grants you a non-exclusive, non-transferable license to install and use the AIGO-X Endpoint Agent software ("Software") solely for your organisation's internal governance, risk, and compliance monitoring purposes.

2. SCOPE OF DATA COLLECTION
The Software collects the following categories of endpoint telemetry:
  • Operating system version, patch level, and configuration settings
  • Encryption status of storage volumes
  • Firewall and antivirus configuration state
  • Active user account policies (password, lockout, MFA)
  • Azure AD / directory membership (if Azure AD Integration is enabled)
  • Network interface configuration (no packet capture or payload inspection)
  • Process resource utilisation (CPU, RAM, disk)

No document content, browser history, personal communications, or user-generated files are collected. All telemetry is transmitted encrypted (TLS 1.3) to the configured AIGO-X console server.

3. RESTRICTIONS
You may not: (a) reverse engineer, decompile, or disassemble the Software; (b) remove or alter any proprietary notices; (c) use the Software to provide services to third parties without a separate reseller agreement; (d) attempt to circumvent tamper-protection mechanisms.

4. TAMPER PROTECTION
The Software installs a hardened Windows service and applies DACL/ACL restrictions to prevent unauthorised modification. These protections may not be disabled in production environments.

5. UNINSTALLATION
The Software may be removed via Add/Remove Programs or by running the agent with the "uninstall" subcommand with the password set at install time.

6. WARRANTY DISCLAIMER
THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE COMPANY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED.

7. LIMITATION OF LIABILITY
IN NO EVENT SHALL THE COMPANY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE SOFTWARE.

8. GOVERNING LAW
This Agreement is governed by the laws of the jurisdiction in which the Company is incorporated.

9. CONTACT
AIGO-X GRC Platform | support@aigox.io | https://aigox.io/legal`;

// ── Trust badge row ────────────────────────────────────────────────────────────

function TrustBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck size={14} style={{ color: "#6ee7b7" }} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                style={{
                  background: done ? "linear-gradient(135deg,#10b981,#059669)"
                    : active ? "linear-gradient(135deg,#3b82f6,#6366f1)"
                    : "rgba(255,255,255,0.06)",
                  border: active ? "2px solid rgba(99,102,241,0.6)" : "2px solid transparent",
                  color: done || active ? "#fff" : "#334155",
                }}>
                {done ? <CheckCircle2 size={12} /> : i + 1}
              </div>
              <span
                className="text-[9px] font-semibold whitespace-nowrap hidden sm:block"
                style={{ color: active ? "#93c5fd" : done ? "#6ee7b7" : "#334155" }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px mx-1" style={{
                background: i < current
                  ? "linear-gradient(90deg,#10b981,#059669)"
                  : "rgba(255,255,255,0.07)",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Navigation buttons ─────────────────────────────────────────────────────────

function NavRow({
  step, total, onBack, onNext, nextLabel = "Next", nextDisabled = false,
}: {
  step: Step; total: number; onBack: () => void; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <div className="flex justify-between mt-8 pt-4"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={onBack}
        disabled={step === 0}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-20"
        style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}>
        <ChevronLeft size={15} /> Back
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-30"
        style={{
          background: nextDisabled ? "rgba(59,130,246,0.1)" : "linear-gradient(135deg,#3b82f6,#6366f1)",
          color: "#fff",
          boxShadow: nextDisabled ? "none" : "0 0 20px rgba(99,102,241,0.35)",
        }}>
        {nextLabel} <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Step components
// ══════════════════════════════════════════════════════════════════════════════

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      {/* Logo */}
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg,#3b82f6 0%,#6366f1 50%,#8b5cf6 100%)",
            boxShadow: "0 0 60px rgba(99,102,241,0.45), 0 0 120px rgba(59,130,246,0.2)",
          }}>
          <Shield size={40} style={{ color: "#fff" }} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: "#10b981", boxShadow: "0 0 10px rgba(16,185,129,0.6)" }}>
          <CheckCircle2 size={14} style={{ color: "#fff" }} />
        </div>
      </div>

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold gradient-text-blue mb-1">AIGO-X Endpoint Agent</h1>
        <p className="text-sm text-slate-400">Enterprise Security &amp; Compliance Platform</p>
        <p className="text-xs text-slate-600 mt-1">Version {__VERSION__} · Publisher: AIGO-X GRC Platform</p>
      </div>

      {/* Trust signals */}
      <div className="glass-inner p-4 w-full max-w-sm space-y-2.5 text-left">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Verified Software</div>
        <TrustBadge label="Tamper-Protected Windows Service" />
        <TrustBadge label="Appears in Add/Remove Programs" />
        <TrustBadge label="Published by AIGO-X GRC Platform" />
        <TrustBadge label="TLS-encrypted telemetry — no packet capture" />
        <TrustBadge label="Uninstall password protection" />
      </div>

      {/* What this does */}
      <div className="glass-inner p-4 w-full max-w-sm text-left space-y-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">What this installer does</div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { icon: <ShieldCheck size={14} />, label: "Compliance Monitoring", color: "#6ee7b7" },
            { icon: <Eye size={14} />, label: "Threat Detection", color: "#93c5fd" },
            { icon: <Terminal size={14} />, label: "Audit Evidence", color: "#c4b5fd" },
          ].map(f => (
            <div key={f.label} className="flex flex-col items-center gap-1 p-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: f.color }}>{f.icon}</span>
              <span className="text-[9px] text-slate-500 text-center leading-tight">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full max-w-sm py-3 rounded-xl text-sm font-bold transition-all"
        style={{
          background: "linear-gradient(135deg,#3b82f6,#6366f1)",
          color: "#fff",
          boxShadow: "0 0 30px rgba(99,102,241,0.4)",
        }}>
        Get Started →
      </button>

      <p className="text-[10px] text-slate-700">
        Need help?{" "}
        <a href="https://aigox.io/docs/agent" target="_blank" rel="noreferrer"
          className="text-blue-500 hover:text-blue-400">
          View documentation
        </a>
      </p>
    </div>
  );
}

function StepEula({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setScrolled(true);
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-1">License Agreement</h2>
      <p className="text-xs text-slate-400 mb-4">Please read the entire agreement before continuing.</p>

      <div
        ref={boxRef}
        onScroll={onScroll}
        className="glass-inner p-4 font-mono text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap overflow-y-auto"
        style={{ height: "260px" }}>
        {EULA_TEXT}
      </div>

      {!scrolled && (
        <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1">
          <ChevronRight size={11} className="shrink-0" />
          Scroll to the bottom to enable acceptance.
        </p>
      )}

      <label className="flex items-start gap-3 mt-4 cursor-pointer group">
        <input
          type="checkbox"
          checked={accepted}
          disabled={!scrolled}
          onChange={e => setAccepted(e.target.checked)}
          className="mt-0.5 accent-blue-500 w-4 h-4 shrink-0" />
        <span className={`text-sm transition-colors ${scrolled ? "text-slate-300 group-hover:text-white" : "text-slate-600"}`}>
          I have read and accept the terms of the License Agreement
        </span>
      </label>

      <NavRow step={1} total={6} onBack={onBack} onNext={onNext}
        nextLabel="Accept & Continue" nextDisabled={!accepted} />
    </div>
  );
}

function StepFeatures({
  selected, onChange, onBack, onNext,
}: {
  selected: string[];
  onChange: (f: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-1">Select Features</h2>
      <p className="text-xs text-slate-400 mb-4">
        Choose which capabilities to enable. Required features cannot be deselected.
      </p>

      <div className="space-y-2.5">
        {DEFAULT_FEATURES.map(f => {
          const on = f.required || selected.includes(f.id);
          return (
            <button
              key={f.id}
              onClick={() => !f.required && toggle(f.id)}
              disabled={f.required}
              className="w-full text-left p-3.5 rounded-xl transition-all"
              style={{
                background: on ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                border: on ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: on ? "0 0 12px rgba(59,130,246,0.12)" : "none",
                cursor: f.required ? "default" : "pointer",
              }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0" style={{ color: on ? "#93c5fd" : "#334155" }}>
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${on ? "text-white" : "text-slate-500"}`}>
                        {f.label}
                      </span>
                      {f.required && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}>
                          REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5 truncate">{f.desc}</p>
                  </div>
                </div>
                {/* Toggle pill */}
                <div className="shrink-0 w-9 h-5 rounded-full transition-all flex items-center px-0.5"
                  style={{
                    background: on ? "linear-gradient(90deg,#3b82f6,#6366f1)" : "rgba(255,255,255,0.08)",
                    boxShadow: on ? "0 0 8px rgba(99,102,241,0.4)" : "none",
                  }}>
                  <div className="w-4 h-4 rounded-full bg-white transition-all"
                    style={{ marginLeft: on ? "auto" : 0 }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <NavRow step={2} total={6} onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </div>
  );
}

function StepConfig({
  config, onChange, onBack, onNext, installing,
}: {
  config: { tenantId: string; serverUrl: string; installPath: string };
  onChange: (f: Partial<typeof config>) => void;
  onBack: () => void;
  onNext: () => void;
  installing: boolean;
}) {
  const valid = config.tenantId.trim().length > 4 && config.serverUrl.trim().startsWith("http");

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-1">Configuration</h2>
      <p className="text-xs text-slate-400 mb-5">
        Enter your AIGO-X console details. Find your Tenant ID in{" "}
        <span className="text-blue-400">Settings → Agent Deployment</span>.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Tenant ID <span className="text-red-400">*</span>
          </label>
          <div className="flex items-center gap-2 glass-inner px-3 py-2.5 rounded-xl">
            <Building2 size={14} style={{ color: "#475569" }} className="shrink-0" />
            <input
              type="text"
              value={config.tenantId}
              onChange={e => onChange({ tenantId: e.target.value })}
              placeholder="e.g. acme-corp or a UUID from the console"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            AIGO-X Console URL <span className="text-red-400">*</span>
          </label>
          <div className="flex items-center gap-2 glass-inner px-3 py-2.5 rounded-xl">
            <Server size={14} style={{ color: "#475569" }} className="shrink-0" />
            <input
              type="url"
              value={config.serverUrl}
              onChange={e => onChange({ serverUrl: e.target.value })}
              placeholder="https://platform.aigox.io"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 outline-none"
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Cloud-hosted: https://platform.aigox.io · Self-hosted: your own server URL
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Install Location
          </label>
          <div className="flex items-center gap-2 glass-inner px-3 py-2.5 rounded-xl">
            <Cpu size={14} style={{ color: "#475569" }} className="shrink-0" />
            <input
              type="text"
              value={config.installPath}
              onChange={e => onChange({ installPath: e.target.value })}
              className="flex-1 bg-transparent text-sm text-slate-500 outline-none font-mono"
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Agent binary, manifest, and offline store will be placed here.
          </p>
        </div>

        {/* Summary box */}
        <div className="glass-inner p-3 space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Installation Summary
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Windows service</span>
            <span className="text-slate-300">AIGOXAgent (auto-start)</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Add/Remove Programs</span>
            <span className="text-slate-300">AIGO-X Endpoint Agent</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Disk space</span>
            <span className="text-slate-300">~12 MB</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Requires</span>
            <span className="text-slate-300">Administrator privileges</span>
          </div>
        </div>
      </div>

      {!valid && (
        <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg"
          style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.18)" }}>
          <AlertTriangle size={13} style={{ color: "#fde047" }} className="shrink-0" />
          <p className="text-xs text-amber-300/80">
            Tenant ID (min 5 chars) and a valid https:// URL are required to proceed.
          </p>
        </div>
      )}

      <NavRow step={3} total={6} onBack={onBack} onNext={onNext}
        nextLabel={installing ? "Starting…" : "Install Now"}
        nextDisabled={!valid || installing} />
    </div>
  );
}

function StepInstalling({ wizard }: { wizard: WizardState | null }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [wizard?.logs]);

  const progress = wizard?.progress ?? 0;

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-1">Installing…</h2>
      <p className="text-xs text-slate-400 mb-5">
        Please wait while the AIGO-X agent is configured. This takes about 10–15 seconds.
      </p>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400 font-semibold">Progress</span>
          <span className="font-bold" style={{ color: progress === 100 ? "#10b981" : "#93c5fd" }}>
            {progress}%
          </span>
        </div>
        <div className="progress-bar-track h-3 relative overflow-hidden rounded-full">
          <div
            className="progress-bar-fill h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: progress === 100
                ? "linear-gradient(90deg,#10b981,#059669)"
                : "linear-gradient(90deg,#3b82f6,#6366f1)",
              boxShadow: `0 0 10px ${progress === 100 ? "rgba(16,185,129,0.5)" : "rgba(99,102,241,0.5)"}`,
            }} />
          {/* Shimmer sweep */}
          {progress < 100 && (
            <div className="absolute inset-0 shimmer opacity-30" />
          )}
        </div>
      </div>

      {/* Log output */}
      <div
        ref={logRef}
        className="glass-inner p-3 font-mono text-[11px] leading-relaxed space-y-1 overflow-y-auto"
        style={{ height: "220px", color: "#94a3b8" }}>
        {(wizard?.logs ?? []).map((line, i) => (
          <div key={i}
            className="flex items-start gap-2"
            style={{
              color: line.startsWith("✓") ? "#6ee7b7"
                : line.startsWith("⚠") ? "#fde047"
                : line.startsWith("✗") ? "#fca5a5"
                : "#94a3b8",
            }}>
            {line}
          </div>
        ))}
        {progress < 100 && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Loader2 size={11} className="animate-spin" />
            <span>Working…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StepComplete({ wizard, onOpenDashboard }: { wizard: WizardState | null; onOpenDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      {/* Success icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg,#10b981,#059669)",
            boxShadow: "0 0 50px rgba(16,185,129,0.5), 0 0 100px rgba(16,185,129,0.2)",
          }}>
          <CheckCircle2 size={40} style={{ color: "#fff" }} />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Installation Complete</h2>
        <p className="text-sm text-slate-400">
          The AIGO-X Endpoint Agent is now running as a Windows service.
        </p>
      </div>

      {/* Details */}
      <div className="glass-inner p-4 w-full max-w-sm space-y-2.5 text-left">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
          Deployment Summary
        </div>
        {[
          { label: "Service", value: "AIGOXAgent — Running" },
          { label: "Add/Remove Programs", value: "Registered ✓" },
          { label: "Tamper protection", value: "Active ✓" },
          { label: "Console reporting", value: wizard?.logs?.some(l => l.includes("Console")) ? "Reported ✓" : "Pending sync" },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-xs">
            <span className="text-slate-500">{r.label}</span>
            <span className="text-emerald-400 font-semibold">{r.value}</span>
          </div>
        ))}
        {wizard?.agent_id && (
          <div className="pt-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Agent ID</div>
            <div className="font-mono text-xs text-blue-400 break-all">{wizard.agent_id}</div>
          </div>
        )}
      </div>

      {/* Console report highlight */}
      <div className="glass-inner p-4 w-full max-w-sm"
        style={{ background: "rgba(16,185,129,0.07)", borderColor: "rgba(16,185,129,0.22)" }}>
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={20} style={{ color: "#6ee7b7" }} className="shrink-0" />
          <div className="text-left">
            <div className="text-sm font-bold text-emerald-400">
              Reported to AIGO-X Console
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              This device now appears in your asset inventory and compliance dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onOpenDashboard}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: "linear-gradient(135deg,#3b82f6,#6366f1)",
            color: "#fff",
            boxShadow: "0 0 20px rgba(99,102,241,0.35)",
          }}>
          <ExternalLink size={14} /> Open Dashboard
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}>
          Close
        </button>
      </div>

      <p className="text-[10px] text-slate-700">
        To uninstall: Add/Remove Programs → AIGO-X Endpoint Agent → Uninstall
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Wizard component
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_INSTALL_PATH = "C:\\Program Files\\AIGO-X\\Agent";

// Package version injected at build time; fallback to "2.2.0"
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "2.2.0";

export default function Wizard() {
  const [step, setStep] = useState<Step>(0);
  const [features, setFeatures] = useState<string[]>(["compliance", "threat", "remediation"]);
  const [cfg, setCfg] = useState({
    tenantId: "",
    serverUrl: "https://platform.aigox.io",
    installPath: DEFAULT_INSTALL_PATH,
  });
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [installing, setInstalling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll wizard state from the backend while installation is in progress
  useEffect(() => {
    if (step === 4) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API}/wizard/state`);
          if (r.ok) {
            const data: WizardState = await r.json();
            setWizardState(data);
            if (data.phase === "complete" || data.phase === "error") {
              clearInterval(pollRef.current!);
              setStep(data.phase === "complete" ? 5 : 4);
            }
          }
        } catch { /* network not yet ready */ }
      }, 800);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step]);

  async function startInstall() {
    setInstalling(true);
    try {
      // Step 1: send config
      await fetch(`${API}/wizard/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id:    cfg.tenantId,
          server_url:   cfg.serverUrl,
          install_path: cfg.installPath,
          features,
        }),
      });
      // Step 2: trigger installation
      await fetch(`${API}/wizard/run`, { method: "POST" });
      setStep(4);
    } catch (e) {
      console.error("Failed to start wizard:", e);
    } finally {
      setInstalling(false);
    }
  }

  function next() {
    if (step === 3) {
      startInstall();
    } else {
      setStep((s => Math.min(s + 1, 5) as Step)(step));
    }
  }
  function back() { setStep(s => Math.max(s - 1, 0) as Step); }

  function openDashboard() {
    window.location.href = "/";
  }

  return (
    <div className="mesh-bg min-h-screen flex flex-col items-center justify-center py-8 px-4">
      {/* Window chrome */}
      <div className="w-full max-w-lg">
        {/* Header bar */}
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-t-2xl"
          style={{
            background: "rgba(10,15,30,0.95)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
          <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}>
            <Shield size={11} style={{ color: "#fff" }} />
          </div>
          <span className="text-xs font-bold gradient-text-blue">AIGO-X</span>
          <span className="text-xs text-slate-600">Endpoint Agent Setup</span>
          <div className="ml-auto flex items-center gap-1.5">
            <ShieldCheck size={12} style={{ color: "#6ee7b7" }} />
            <span className="text-[10px] text-slate-600">Verified Publisher</span>
          </div>
        </div>

        {/* Main content card */}
        <div className="glass-card rounded-t-none rounded-b-2xl p-6"
          style={{
            background: "rgba(13,21,40,0.92)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "none",
            minHeight: "520px",
          }}>
          <StepBar current={step} />

          {step === 0 && <StepWelcome onNext={next} />}
          {step === 1 && <StepEula onBack={back} onNext={next} />}
          {step === 2 && (
            <StepFeatures selected={features} onChange={setFeatures} onBack={back} onNext={next} />
          )}
          {step === 3 && (
            <StepConfig config={cfg} onChange={p => setCfg(c => ({ ...c, ...p }))} onBack={back} onNext={next} installing={installing} />
          )}
          {step === 4 && <StepInstalling wizard={wizardState} />}
          {step === 5 && <StepComplete wizard={wizardState} onOpenDashboard={openDashboard} />}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-3 px-1">
          <span className="text-[10px] text-slate-700">
            © 2025 AIGO-X GRC Platform · aigox.io
          </span>
          <span className="text-[10px] text-slate-700">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </div>
    </div>
  );
}
