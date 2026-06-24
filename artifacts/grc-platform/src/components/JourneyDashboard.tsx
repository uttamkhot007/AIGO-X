import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/context/ThemeContext";
import {
  getJourneyTemplate,
  type StepStatus,
  type JourneyStep,
  type JourneyTemplate,
  type SubTask,
  type EvidenceItem,
} from "@/lib/journey-data";
import {
  getStepControls,
  CTRL_STATUS_CFG,
  type AnnexControl,
  type ControlImplStatus,
} from "@/lib/annex-a-controls";

// ─── Persistence ──────────────────────────────────────────────────────────────
interface TaskOwner {
  name: string;
  role?: string;
  email?: string;
  dept?: string;
  source: "directory" | "manual" | "role";
}

type TaskRoleType = "owner" | "reviewer" | "approver";

interface TaskRoleSet {
  owner?: TaskOwner;
  reviewer?: TaskOwner;
  approver?: TaskOwner;
}

interface DirectoryPerson {
  id: number;
  name: string;
  role: string;
  email: string;
  dept: string;
}

interface JourneyState {
  stepStatuses: Record<number, StepStatus>;
  taskChecks: Record<string, boolean>;
  taskOwners: Record<string, TaskOwner>;
  taskRoles: Record<string, TaskRoleSet>;
  evidenceUploads: Record<string, UploadedEvidence>;
  evidenceValidations: Record<string, EvidenceValidation>;
  controlStatuses: Record<string, ControlImplStatus>;
  startedAt?: string;
}

interface UploadedEvidence {
  fileName: string;
  uploadedAt: string;
  fileSize?: string;
}

interface EvidenceValidation {
  status: "validating" | "validated" | "partial" | "insufficient";
  coveragePct: number;
  summary: string;
  findings: string[];
  validatedAt: string;
}

function storageKey(tenantId: string | number, fwName: string) {
  return `jrn2_${tenantId}_${fwName.toLowerCase().replace(/\s+/g, "_")}`;
}

function loadState(tenantId: string | number, fwName: string, steps: JourneyStep[]): JourneyState {
  try {
    const raw = localStorage.getItem(storageKey(tenantId, fwName));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<JourneyState>;
      return { taskOwners: {}, taskRoles: {}, controlStatuses: {}, ...parsed } as JourneyState;
    }
  } catch {}
  const stepStatuses: Record<number, StepStatus> = {};
  steps.forEach(s => { stepStatuses[s.num] = s.defaultStatus; });
  return { stepStatuses, taskChecks: {}, taskOwners: {}, taskRoles: {}, evidenceUploads: {}, evidenceValidations: {}, controlStatuses: {} };
}

function saveState(tenantId: string | number, fwName: string, state: JourneyState) {
  try { localStorage.setItem(storageKey(tenantId, fwName), JSON.stringify(state)); } catch {}
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<StepStatus, { label: string; color: string; bg: string; border: string }> = {
  "not-started": { label: "Not Started", color: "var(--muted-foreground)", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)" },
  "in-progress": { label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)" },
  "done":        { label: "Done",        color: "#10B981", bg: "rgba(16,185,129,0.08)",   border: "rgba(16,185,129,0.25)" },
  "skipped":     { label: "Skipped",     color: "#6366F1", bg: "rgba(99,102,241,0.08)",   border: "rgba(99,102,241,0.2)"  },
};

// ─── AI Evidence Validation (simulated) ──────────────────────────────────────
function generateAIValidation(evItem: EvidenceItem, stepRef: string, isUpload: boolean): EvidenceValidation {
  const now = new Date().toISOString();
  // Simulate different validation outcomes based on evidence type
  const platformEvidence: Record<string, EvidenceValidation> = {
    platform: {
      status: "validated",
      coveragePct: 85,
      summary: `Platform record confirms ${evItem.requirement} is actively tracked in ${evItem.sourceModule}. Evidence is current, structured, and directly satisfies the ${stepRef} requirement.`,
      findings: [
        `✓ Record exists and is actively maintained in ${evItem.sourceModule}`,
        `✓ Data is current (last updated within 30 days)`,
        `✓ Meets the structural requirements of ${stepRef}`,
        `⚠ Manual review recommended to verify completeness of coverage`,
      ],
      validatedAt: now,
    },
  };
  if (evItem.source === "platform") {
    return { ...platformEvidence.platform, coveragePct: 78 + Math.floor(Math.random() * 17) };
  }
  // Upload evidence - higher variance
  const uploadCoverage = isUpload ? 65 + Math.floor(Math.random() * 30) : 0;
  const uploadStatus: EvidenceValidation["status"] = uploadCoverage >= 85 ? "validated" : uploadCoverage >= 60 ? "partial" : "insufficient";
  return {
    status: uploadStatus,
    coveragePct: uploadCoverage,
    summary: uploadCoverage >= 85
      ? `Uploaded document comprehensively addresses ${evItem.requirement}. Content analysis confirms strong alignment with ${stepRef} requirements. Document appears complete and well-structured.`
      : uploadCoverage >= 60
      ? `Uploaded document partially addresses ${evItem.requirement}. Key elements are present but some sections require strengthening before this evidence can be considered fully sufficient for ${stepRef}.`
      : `Uploaded document does not sufficiently address ${evItem.requirement}. Significant gaps identified. Please review and resubmit a more complete document for ${stepRef}.`,
    findings: uploadCoverage >= 85
      ? [
          `✓ Document structure aligns with ${stepRef} requirements`,
          `✓ Key required elements are present and clearly documented`,
          `✓ Scope and coverage appear comprehensive`,
          `⚠ Ensure document is version-controlled and management-approved`,
        ]
      : uploadCoverage >= 60
      ? [
          `✓ Document contains relevant content for ${stepRef}`,
          `⚠ Coverage gaps identified — some required elements are missing or unclear`,
          `⚠ Document may need management approval or formal review`,
          `✗ Recommend strengthening sections on ${evItem.requirement}`,
        ]
      : [
          `✗ Document does not adequately address ${evItem.requirement}`,
          `✗ Required structure and elements for ${stepRef} are not evident`,
          `✗ Please use the provided template and resubmit`,
        ],
    validatedAt: now,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const color = pct >= 75 ? "#10B981" : pct >= 40 ? "#F59E0B" : "#63B3ED";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition:"stroke-dasharray 0.6s ease" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform:`rotate(90deg) translate(0,0)`, fontSize: 11, fill: color, fontWeight: 800, fontFamily: "inherit" }}
        transform={`rotate(90,${size/2},${size/2})`}>{pct}%</text>
    </svg>
  );
}

function EvidencePanel({
  evidence, stepRef, state, tenantId, fwName,
  onStateChange,
}: {
  evidence: EvidenceItem[];
  stepRef: string;
  state: JourneyState;
  tenantId: string | number;
  fwName: string;
  onStateChange: (s: JourneyState) => void;
}) {
  const [validating, setValidating] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleValidate = async (ev: EvidenceItem) => {
    const hasUpload = !!state.evidenceUploads[ev.id];
    if (ev.source === "platform" || hasUpload) {
      setValidating(ev.id);
      // Simulate AI analysis delay
      await new Promise(r => setTimeout(r, 1800));
      const result = generateAIValidation(ev, stepRef, hasUpload);
      const next = {
        ...state,
        evidenceValidations: { ...state.evidenceValidations, [ev.id]: result },
      };
      onStateChange(next);
      saveState(tenantId, fwName, next);
      setValidating(null);
    }
  };

  const handleFileSelect = (ev: EvidenceItem, file: File) => {
    const upload: UploadedEvidence = {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      fileSize: file.size > 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`,
    };
    const next = {
      ...state,
      evidenceUploads: { ...state.evidenceUploads, [ev.id]: upload },
      // Clear old validation when new file uploaded
      evidenceValidations: { ...state.evidenceValidations, [ev.id]: undefined as any },
    };
    onStateChange(next);
    saveState(tenantId, fwName, next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {evidence.map(ev => {
        const upload = state.evidenceUploads[ev.id];
        const validation = state.evidenceValidations[ev.id];
        const isPlatform = ev.source === "platform";
        const isAvailable = isPlatform || !!upload;
        const isValidating = validating === ev.id;

        return (
          <div key={ev.id} style={{
            border: `1px solid ${isAvailable ? (validation ? (validation.status === "validated" ? "rgba(16,185,129,0.3)" : validation.status === "partial" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)") : "rgba(99,179,237,0.2)") : "var(--border)"}`,
            borderRadius: 10, overflow: "hidden",
            background: isAvailable ? "rgba(16,185,129,0.03)" : "rgba(255,255,255,0.01)",
          }}>
            {/* Evidence header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px" }}>
              {/* Source icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: isPlatform ? "rgba(99,179,237,0.12)" : "rgba(139,92,246,0.12)",
                border: `1px solid ${isPlatform ? "rgba(99,179,237,0.2)" : "rgba(139,92,246,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}>
                {isPlatform ? "🔗" : "📎"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{ev.name}</span>
                  {/* Source badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.06em",
                    background: isPlatform ? "rgba(99,179,237,0.1)" : "rgba(139,92,246,0.1)",
                    border: `1px solid ${isPlatform ? "rgba(99,179,237,0.2)" : "rgba(139,92,246,0.2)"}`,
                    color: isPlatform ? "#63B3ED" : "#A78BFA",
                  }}>
                    {isPlatform ? `FROM ${ev.sourceModule?.toUpperCase()}` : "UPLOAD"}
                  </span>
                  {/* Availability badge */}
                  {isPlatform && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981",
                    }}>
                      ● AVAILABLE
                    </span>
                  )}
                  {!isPlatform && upload && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981",
                    }}>
                      ● UPLOADED
                    </span>
                  )}
                  {!isPlatform && !upload && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444",
                    }}>
                      ● REQUIRED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{ev.description}</div>
                <div style={{ fontSize: 10, color: "#4B5563", marginTop: 2 }}>
                  <span style={{ color: "#60A5FA" }}>Requirement: </span>{ev.requirement}
                </div>
                {upload && (
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 3 }}>
                    📄 {upload.fileName} {upload.fileSize && `(${upload.fileSize})`} — uploaded {new Date(upload.uploadedAt).toLocaleDateString("en-GB")}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                {isAvailable && !validation && !isValidating && (
                  <button onClick={() => handleValidate(ev)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer",
                      fontFamily: "inherit", background: "rgba(99,179,237,0.12)", border: "1px solid rgba(99,179,237,0.3)", color: "#63B3ED",
                      whiteSpace: "nowrap",
                    }}>
                    ✦ AI Validate
                  </button>
                )}
                {isValidating && (
                  <div style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: "rgba(99,179,237,0.08)", border: "1px solid rgba(99,179,237,0.2)", color: "#63B3ED",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Analysing…
                  </div>
                )}
                {validation && !isValidating && (
                  <button onClick={() => handleValidate(ev)}
                    style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)",
                    }}>
                    Re-validate
                  </button>
                )}
                {!isPlatform && (
                  <>
                    <input
                      type="file" ref={r => { fileInputRefs.current[ev.id] = r; }} style={{ display: "none" }}
                      onChange={e => { if (e.target.files?.[0]) handleFileSelect(ev, e.target.files[0]); }}
                      accept=".pdf,.doc,.docx,.xlsx,.xls,.ppt,.pptx,.png,.jpg,.txt"
                    />
                    <button
                      onClick={() => fileInputRefs.current[ev.id]?.click()}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        fontFamily: "inherit", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#A78BFA",
                        whiteSpace: "nowrap",
                      }}>
                      {upload ? "Replace" : "Upload"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* AI Validation result */}
            {validation && !isValidating && (
              <div style={{
                borderTop: `1px solid ${validation.status === "validated" ? "rgba(16,185,129,0.15)" : validation.status === "partial" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)"}`,
                background: validation.status === "validated" ? "rgba(16,185,129,0.04)" : validation.status === "partial" ? "rgba(245,158,11,0.04)" : "rgba(239,68,68,0.04)",
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                    color: validation.status === "validated" ? "#10B981" : validation.status === "partial" ? "#F59E0B" : "#EF4444" }}>
                    ✦ AI ANALYSIS
                  </span>
                  {/* Coverage bar */}
                  <div style={{ flex: 1, height: 4, background: "var(--secondary)", borderRadius: 99, overflow: "hidden", maxWidth: 120 }}>
                    <div style={{
                      height: "100%", borderRadius: 99, transition: "width 0.5s ease",
                      width: `${validation.coveragePct}%`,
                      background: validation.coveragePct >= 85 ? "#10B981" : validation.coveragePct >= 60 ? "#F59E0B" : "#EF4444",
                    }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800,
                    color: validation.coveragePct >= 85 ? "#10B981" : validation.coveragePct >= 60 ? "#F59E0B" : "#EF4444" }}>
                    {validation.coveragePct}% coverage
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase",
                    background: validation.status === "validated" ? "rgba(16,185,129,0.12)" : validation.status === "partial" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
                    border: `1px solid ${validation.status === "validated" ? "rgba(16,185,129,0.25)" : validation.status === "partial" ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)"}`,
                    color: validation.status === "validated" ? "#10B981" : validation.status === "partial" ? "#F59E0B" : "#EF4444",
                  }}>
                    {validation.status}
                  </span>
                  <span style={{ fontSize: 9, color: "#4B5563", marginLeft: "auto" }}>
                    {new Date(validation.validatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: 6 }}>
                  {validation.summary}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {validation.findings.map((f, i) => (
                    <div key={i} style={{
                      fontSize: 10, lineHeight: 1.5,
                      color: f.startsWith("✓") ? "#10B981" : f.startsWith("⚠") ? "#F59E0B" : "#EF4444",
                    }}>{f}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main JourneyDashboard ─────────────────────────────────────────────────────
interface Props {
  fwName: string;
  tenantId: string | number;
}

type TabKey = "overview" | "tasks" | "controls" | "deliverables" | "evidence";

export function JourneyDashboard({ fwName, tenantId }: Props) {
  const [, setLocation] = useLocation();
  const { isDark } = useTheme();
  const template: JourneyTemplate = getJourneyTemplate(fwName);
  const steps = template.steps;

  const [state, setState] = useState<JourneyState>(() => loadState(tenantId, fwName, steps));
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, TabKey>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState<string | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<string, { name: string; role: string }>>({});
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedControl, setSelectedControl] = useState<AnnexControl | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; description: string } | null>(null);

  useEffect(() => {
    // Auto-expand the first in-progress step
    const first = steps.find(s => {
      const st = state.stepStatuses[s.num] ?? s.defaultStatus;
      return st === "in-progress";
    });
    if (first) setExpandedStep(first.num);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fwName, tenantId]);

  // Re-load when tenant/fw changes
  useEffect(() => {
    const loaded = loadState(tenantId, fwName, steps);
    setState(loaded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, fwName]);

  const mutate = useCallback((updater: (prev: JourneyState) => JourneyState) => {
    setState(prev => {
      const next = updater(prev);
      saveState(tenantId, fwName, next);
      return next;
    });
  }, [tenantId, fwName]);

  // ── Step lock logic ──────────────────────────────────────────────────────
  function isLocked(stepNum: number): boolean {
    if (stepNum <= 1) return false;
    const prevStatus = state.stepStatuses[stepNum - 1] ?? steps.find(s => s.num === stepNum - 1)?.defaultStatus;
    return prevStatus !== "done";
  }

  function getStatus(stepNum: number): StepStatus {
    return state.stepStatuses[stepNum] ?? steps.find(s => s.num === stepNum)?.defaultStatus ?? "not-started";
  }

  // ── Task checkbox ────────────────────────────────────────────────────────
  function toggleTask(taskId: string, stepNum: number) {
    mutate(prev => {
      const checks = { ...prev.taskChecks, [taskId]: !prev.taskChecks[taskId] };
      // Auto-set step to in-progress when first task checked
      const step = steps.find(s => s.num === stepNum)!;
      const anyChecked = step.subTasks.some(t => checks[t.id]);
      const allRequired = step.subTasks.filter(t => t.required).every(t => checks[t.id]);
      let stepStatuses = { ...prev.stepStatuses };
      if (allRequired && stepStatuses[stepNum] !== "done") {
        // Don't auto-complete — let user click Mark Done. But surface the option.
      }
      if (anyChecked && stepStatuses[stepNum] === "not-started") {
        stepStatuses[stepNum] = "in-progress";
      }
      return { ...prev, taskChecks: checks, stepStatuses, startedAt: prev.startedAt ?? new Date().toISOString() };
    });
  }

  // ── Step status change ───────────────────────────────────────────────────
  function setStepStatus(stepNum: number, status: StepStatus) {
    mutate(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [stepNum]: status },
      startedAt: prev.startedAt ?? new Date().toISOString(),
    }));
  }

  function handleStart(step: JourneyStep) {
    if (getStatus(step.num) === "not-started") setStepStatus(step.num, "in-progress");
    setLocation(step.route);
  }

  function resetJourney() {
    const fresh: JourneyState = { stepStatuses: {}, taskChecks: {}, taskOwners: {}, taskRoles: {}, evidenceUploads: {}, evidenceValidations: {}, controlStatuses: {} };
    steps.forEach(s => { fresh.stepStatuses[s.num] = s.defaultStatus; });
    saveState(tenantId, fwName, fresh);
    setState(fresh);
    setConfirmReset(false);
  }

  // ── Task expand / owner helpers ──────────────────────────────────────────
  function toggleTaskExpand(taskId: string) {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  function assignTaskRole(taskId: string, roleType: TaskRoleType, person: TaskOwner) {
    mutate(prev => {
      const roles = { ...(prev.taskRoles ?? {}) };
      roles[taskId] = { ...(roles[taskId] ?? {}), [roleType]: person };
      const taskOwners = roleType === "owner" ? { ...(prev.taskOwners ?? {}), [taskId]: person } : (prev.taskOwners ?? {});
      return { ...prev, taskRoles: roles, taskOwners };
    });
    setOwnerPickerOpen(null);
  }

  function clearTaskRole(taskId: string, roleType: TaskRoleType) {
    mutate(prev => {
      const roles = { ...(prev.taskRoles ?? {}) };
      if (roles[taskId]) {
        const updated = { ...roles[taskId] };
        delete updated[roleType];
        roles[taskId] = updated;
      }
      const taskOwners = roleType === "owner"
        ? (() => { const next = { ...(prev.taskOwners ?? {}) }; delete next[taskId]; return next; })()
        : (prev.taskOwners ?? {});
      return { ...prev, taskRoles: roles, taskOwners };
    });
  }

  async function fetchPeople() {
    if (people.length > 0 || peopleLoading) return;
    setPeopleLoading(true);
    try {
      const r = await fetch("/api/governance/people", { credentials: "include" });
      if (r.ok) setPeople(await r.json());
    } catch { /* silent */ }
    setPeopleLoading(false);
  }

  // ── Computed stats ───────────────────────────────────────────────────────
  const counts = { done: 0, "in-progress": 0, skipped: 0, "not-started": 0 };
  steps.forEach(s => { counts[getStatus(s.num)]++; });
  const pct = Math.round((counts.done / steps.length) * 100);

  // ── Tab helpers ──────────────────────────────────────────────────────────
  function getTab(stepNum: number): TabKey {
    return activeTab[stepNum] ?? "overview";
  }
  function setTab(stepNum: number, tab: TabKey) {
    setActiveTab(p => ({ ...p, [stepNum]: tab }));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: isDark
          ? "linear-gradient(135deg,rgba(30,58,95,0.7) 0%,rgba(15,23,42,0.95) 100%)"
          : "linear-gradient(135deg,rgba(59,130,246,0.08) 0%,rgba(99,179,237,0.12) 100%)",
        border: isDark ? "1px solid rgba(99,179,237,0.15)" : "1px solid rgba(59,130,246,0.2)",
        borderRadius: 14, padding: "18px 22px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#63B3ED", letterSpacing: "0.1em", marginBottom: 4 }}>
              IMPLEMENTATION JOURNEY
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--foreground)", marginBottom: 3, lineHeight: 1.25 }}>
              {template.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{template.subtitle}</div>
          </div>
          <ProgressRing pct={pct} size={56} />
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginTop: 14 }}>
          <div style={{
            height: "100%", borderRadius: 99, transition: "width 0.5s ease",
            width: `${pct}%`,
            background: pct >= 75 ? "linear-gradient(90deg,#10B981,#34D399)" : pct >= 40 ? "linear-gradient(90deg,#F59E0B,#FCD34D)" : "linear-gradient(90deg,#3B82F6,#63B3ED)",
          }} />
        </div>

        {/* Pill counts */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {(["done","in-progress","not-started","skipped"] as StepStatus[]).map(st =>
            counts[st] > 0 && (
              <span key={st} style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                background: STATUS_CFG[st].bg, border: `1px solid ${STATUS_CFG[st].border}`, color: STATUS_CFG[st].color,
              }}>
                {counts[st]} {STATUS_CFG[st].label}
              </span>
            )
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => setConfirmReset(true)}
            style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 6, cursor: "pointer",
              fontFamily: "inherit", background: "transparent", border: "1px solid rgba(239,68,68,0.25)", color: "rgba(239,68,68,0.6)" }}>
            Reset Journey
          </button>
        </div>

        {confirmReset && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#EF4444", flex: 1 }}>Reset all step progress? Cannot be undone.</span>
            <button onClick={resetJourney} style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Confirm
            </button>
            <button onClick={() => setConfirmReset(false)} style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid var(--border)",
              background: "transparent", color: "var(--muted-foreground)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Vertical step list ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((step, idx) => {
          const st = getStatus(step.num);
          const locked = isLocked(step.num);
          const cfg = STATUS_CFG[st];
          const isExpanded = expandedStep === step.num && !locked;
          const isDone = st === "done";
          const isActive = st === "in-progress";
          const isLast = idx === steps.length - 1;
          const tab = getTab(step.num);

          // Task completion
          const requiredTasks = step.subTasks.filter(t => t.required);
          const completedRequired = requiredTasks.filter(t => state.taskChecks[t.id]).length;
          const allRequiredDone = completedRequired === requiredTasks.length;

          return (
            <div key={step.num} style={{ display: "flex", gap: 0 }}>

              {/* ── Left: timeline column ─────────────────────────────── */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 44, flexShrink: 0 }}>
                {/* Circle */}
                <button
                  onClick={() => !locked && setExpandedStep(p => p === step.num ? null : step.num)}
                  disabled={locked}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: isDone ? "#10B981" : locked ? "var(--secondary)" : isActive ? "rgba(245,158,11,0.15)" : "rgba(99,179,237,0.1)",
                    border: `2px solid ${isDone ? "#10B981" : locked ? "rgba(148,163,184,0.2)" : isActive ? "#F59E0B" : "rgba(99,179,237,0.3)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900,
                    color: isDone ? "#fff" : locked ? "#4B5563" : isActive ? "#F59E0B" : "#63B3ED",
                    cursor: locked ? "default" : "pointer", flexShrink: 0,
                    transition: "all 0.2s", boxShadow: isActive && !locked ? "0 0 0 3px rgba(245,158,11,0.15)" : isDone ? "0 0 0 3px rgba(16,185,129,0.15)" : "none",
                    zIndex: 1, position: "relative",
                  }}>
                  {isDone ? "✓" : locked ? "🔒" : step.num}
                </button>
                {/* Connector line */}
                {!isLast && (
                  <div style={{
                    width: 2, flex: 1, minHeight: 16,
                    background: isDone ? "linear-gradient(180deg,#10B981,rgba(16,185,129,0.3))" : "var(--border)",
                    marginTop: 2, marginBottom: 2,
                  }} />
                )}
              </div>

              {/* ── Right: step card ──────────────────────────────────── */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 8, paddingLeft: 8 }}>
                <div style={{
                  background: isDone ? "rgba(16,185,129,0.04)" : locked ? "rgba(255,255,255,0.01)" : "var(--card)",
                  border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : locked ? "rgba(255,255,255,0.04)" : isActive ? "rgba(245,158,11,0.2)" : "var(--border)"}`,
                  borderRadius: 11, overflow: "hidden", opacity: locked ? 0.45 : 1,
                  transition: "all 0.2s",
                }}>

                  {/* Step header row */}
                  <div
                    onClick={() => !locked && setExpandedStep(p => p === step.num ? null : step.num)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", cursor: locked ? "default" : "pointer" }}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title + badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 800,
                          color: isDone ? "rgba(255,255,255,0.5)" : "var(--foreground)",
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {step.title}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.05em",
                          background: "rgba(99,179,237,0.08)", border: "1px solid rgba(99,179,237,0.15)", color: "#93C5FD",
                        }}>
                          {step.ref}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: "1px 7px", borderRadius: 20,
                          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                        {locked && (
                          <span style={{ fontSize: 9, color: "#4B5563", fontWeight: 600 }}>
                            Complete step {step.num - 1} to unlock
                          </span>
                        )}
                      </div>
                      {/* Meta row */}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>⏱ {step.duration}</span>
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>👤 {step.owner}</span>
                        {!locked && requiredTasks.length > 0 && (
                          <span style={{ fontSize: 10, color: completedRequired === requiredTasks.length ? "#10B981" : "#6B7280" }}>
                            ✓ {completedRequired}/{requiredTasks.length} tasks
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chevron + actions */}
                    {!locked && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {!isDone && (
                          <button
                            onClick={e => { e.stopPropagation(); handleStart(step); }}
                            style={{
                              padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer",
                              fontFamily: "inherit",
                              background: isActive ? "rgba(245,158,11,0.12)" : "rgba(99,179,237,0.1)",
                              border: `1px solid ${isActive ? "rgba(245,158,11,0.3)" : "rgba(99,179,237,0.25)"}`,
                              color: isActive ? "#F59E0B" : "#63B3ED",
                            }}>
                            {st === "not-started" ? "Start →" : "Continue →"}
                          </button>
                        )}
                        {isDone && (
                          <button
                            onClick={e => { e.stopPropagation(); setStepStatus(step.num, "in-progress"); }}
                            style={{
                              padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              fontFamily: "inherit", background: "transparent", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981",
                            }}>
                            Reopen
                          </button>
                        )}
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                      </div>
                    )}
                  </div>

                  {/* ── Expanded content ──────────────────────────────── */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid var(--border)" }}>

                      {/* Tab bar */}
                      {(() => {
                        const stepControls = getStepControls(step.num);
                        const labels: Record<TabKey, string> = {
                          overview: "Overview",
                          tasks: `Tasks (${step.subTasks.length})`,
                          controls: `Controls (${stepControls.length})`,
                          deliverables: `Deliverables (${step.deliverables.length})`,
                          evidence: `Evidence (${step.evidence.length})`,
                        };
                        return (
                          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.01)", overflowX: "auto" }}>
                            {(["overview","tasks","controls","deliverables","evidence"] as TabKey[]).map(t => (
                              <button key={t} onClick={() => setTab(step.num, t)}
                                style={{
                                  padding: "8px 14px", fontSize: 11, fontWeight: tab === t ? 800 : 600,
                                  cursor: "pointer", fontFamily: "inherit", border: "none", background: "transparent",
                                  borderBottom: `2px solid ${tab === t ? "#63B3ED" : "transparent"}`,
                                  color: tab === t ? "#63B3ED" : "var(--muted-foreground)",
                                  transition: "all 0.15s", whiteSpace: "nowrap",
                                }}>
                                {labels[t]}
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Tab content */}
                      <div style={{ padding: "14px 16px" }}>

                        {/* ── OVERVIEW tab ────────────────────────────── */}
                        {tab === "overview" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
                              {step.description}
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 140 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 3 }}>ESTIMATED DURATION</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{step.duration}</div>
                              </div>
                              <div style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 140 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 3 }}>RESPONSIBLE</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{step.owner}</div>
                              </div>
                              <div style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 140 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 3 }}>REFERENCE</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD" }}>{step.ref}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => handleStart(step)}
                                style={{
                                  padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: "pointer",
                                  fontFamily: "inherit", background: "rgba(99,179,237,0.12)", border: "1px solid rgba(99,179,237,0.3)", color: "#63B3ED",
                                }}>
                                Open {step.routeLabel.split("→")[0].trim()} →
                              </button>
                              {!isDone && (
                                <button onClick={() => setStepStatus(step.num, "done")}
                                  style={{
                                    padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: "pointer",
                                    fontFamily: "inherit", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981",
                                  }}>
                                  ✓ Mark as Done
                                </button>
                              )}
                              {!isDone && st !== "skipped" && (
                                <button onClick={() => setStepStatus(step.num, "skipped")}
                                  style={{
                                    padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    fontFamily: "inherit", background: "transparent", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8",
                                  }}>
                                  Skip
                                </button>
                              )}
                            </div>
                            {/* All-required-tasks completion prompt */}
                            {allRequiredDone && !isDone && (
                              <div style={{
                                padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8,
                                fontSize: 12, color: "#10B981", fontWeight: 600,
                              }}>
                                ✓ All required tasks completed — click "Mark as Done" to unlock the next step.
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── TASKS tab ───────────────────────────────── */}
                        {tab === "tasks" && (() => {
                          const critStyles: Record<string, { label: string; bg: string; border: string; color: string }> = {
                            critical: { label: "CRITICAL", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", color: "#EF4444" },
                            high: { label: "HIGH", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", color: "#F59E0B" },
                            medium: { label: "MEDIUM", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", color: "#3B82F6" },
                            low: { label: "LOW", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", color: "#10B981" },
                          };
                          const ROLES: { type: TaskRoleType; label: string; icon: string; color: string }[] = [
                            { type: "owner", label: "TASK OWNER", icon: "👤", color: "#63B3ED" },
                            { type: "reviewer", label: "REVIEWER", icon: "🔍", color: "#A78BFA" },
                            { type: "approver", label: "APPROVER", icon: "✅", color: "#10B981" },
                          ];
                          return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, padding: "0 2px" }}>
                              Click any task to view its full specification — overview, implementation guidance, Owner / Reviewer / Approver assignments, deliverables, evidence, and sample documents.
                            </div>
                            {step.subTasks.map(task => {
                              const checked = !!state.taskChecks[task.id];
                              const isTaskExpanded = expandedTasks.has(task.id);
                              const taskRoleSet: TaskRoleSet = (state.taskRoles ?? {})[task.id] ?? {};
                              const assignedOwner = taskRoleSet.owner ?? (state.taskOwners ?? {})[task.id];
                              const assignedReviewer = taskRoleSet.reviewer;
                              const assignedApprover = taskRoleSet.approver;
                              const crit = task.criticality ? critStyles[task.criticality] : null;
                              const pickerParts = (ownerPickerOpen ?? "").split(":");
                              const isThisTaskPicker = pickerParts[0] === task.id;
                              const activeRole = isThisTaskPicker ? pickerParts[1] as TaskRoleType : undefined;
                              const activeMode = isThisTaskPicker ? pickerParts[2] as "directory" | "manual" : undefined;
                              const filteredPeople = people.filter(p =>
                                !peopleSearch ||
                                p.name.toLowerCase().includes(peopleSearch.toLowerCase()) ||
                                p.role.toLowerCase().includes(peopleSearch.toLowerCase()) ||
                                (p.dept ?? "").toLowerCase().includes(peopleSearch.toLowerCase())
                              );
                              const getRoleAssigned = (rt: TaskRoleType) => rt === "owner" ? assignedOwner : rt === "reviewer" ? assignedReviewer : assignedApprover;
                              const getSuggestedRole = (rt: TaskRoleType) => rt === "owner" ? task.ownerRole : rt === "reviewer" ? task.reviewerRole : task.approverRole;
                              return (
                                <div key={task.id} style={{
                                  border: `1px solid ${checked ? "rgba(16,185,129,0.25)" : isTaskExpanded ? "rgba(99,179,237,0.3)" : "var(--border)"}`,
                                  borderRadius: 9, marginBottom: 7, overflow: "hidden",
                                  background: checked ? "rgba(16,185,129,0.03)" : isTaskExpanded ? "rgba(99,179,237,0.02)" : "rgba(255,255,255,0.01)",
                                }}>
                                  {/* ── Header ── */}
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px", cursor: "pointer" }}
                                    onClick={() => toggleTaskExpand(task.id)}>
                                    <div onClick={e => { e.stopPropagation(); toggleTask(task.id, step.num); }}
                                      style={{
                                        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
                                        border: `2px solid ${checked ? "#10B981" : "rgba(255,255,255,0.2)"}`,
                                        background: checked ? "#10B981" : "transparent",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 10, color: "#fff", transition: "all 0.15s", cursor: "pointer",
                                      }}>
                                      {checked ? "✓" : ""}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                        <span style={{
                                          fontSize: 12, fontWeight: checked ? 500 : 700,
                                          color: checked ? "rgba(255,255,255,0.4)" : "var(--foreground)",
                                          textDecoration: checked ? "line-through" : "none",
                                        }}>{task.task}</span>
                                        {task.required && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 3, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#EF4444" }}>REQUIRED</span>}
                                        {crit && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 3, background: crit.bg, border: `1px solid ${crit.border}`, color: crit.color }}>{crit.label}</span>}
                                      </div>
                                      {(assignedOwner || assignedReviewer || assignedApprover) ? (
                                        <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                                          {assignedOwner && <span style={{ fontSize: 10, color: "#63B3ED" }}>👤 {assignedOwner.name}</span>}
                                          {assignedReviewer && <span style={{ fontSize: 10, color: "#A78BFA" }}>🔍 {assignedReviewer.name}</span>}
                                          {assignedApprover && <span style={{ fontSize: 10, color: "#10B981" }}>✅ {assignedApprover.name}</span>}
                                        </div>
                                      ) : task.ownerRole && (
                                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>Suggested: {task.ownerRole}{task.reviewerRole ? ` · Review: ${task.reviewerRole}` : ""}{task.approverRole ? ` · Approve: ${task.approverRole}` : ""}</div>
                                      )}
                                    </div>
                                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", transform: isTaskExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginTop: 3 }}>▾</span>
                                  </div>

                                  {/* ── Expanded specification panel ── */}
                                  {isTaskExpanded && (
                                    <div style={{ borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>

                                      {/* Overview */}
                                      {(task.description ?? task.guidance) && (
                                        <div style={{ padding: "14px 14px 0" }}>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 6 }}>OVERVIEW</div>
                                          <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.75, padding: "10px 12px", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 7 }}>
                                            {task.description ?? task.guidance}
                                          </div>
                                        </div>
                                      )}

                                      {/* How to Implement */}
                                      <div style={{ padding: "14px 14px 0" }}>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 7 }}>HOW TO IMPLEMENT</div>
                                        {task.howTo && task.howTo.length > 0 ? (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            {task.howTo.map((s, i) => (
                                              <div key={i} style={{ display: "flex", gap: 10, padding: "7px 10px", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 6 }}>
                                                <span style={{ fontSize: 10, fontWeight: 800, color: "#63B3ED", minWidth: 18, flexShrink: 0 }}>{i + 1}.</span>
                                                <span style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.6 }}>{s}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div style={{ padding: "9px 12px", background: "rgba(99,179,237,0.04)", border: "1px solid rgba(99,179,237,0.12)", borderRadius: 7, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                                            Navigate to <strong style={{ color: "#63B3ED" }}>{step.routeLabel}</strong> to complete this task.
                                          </div>
                                        )}
                                      </div>

                                      {/* Roles: Owner | Reviewer | Approver */}
                                      <div style={{ padding: "14px 14px 0" }}>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 8 }}>ROLES & ASSIGNMENTS</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                          {ROLES.map(({ type: rt, label, icon, color }) => {
                                            const assigned = getRoleAssigned(rt);
                                            const suggested = getSuggestedRole(rt);
                                            const isDirOpen = isThisTaskPicker && activeRole === rt && activeMode === "directory";
                                            const isManOpen = isThisTaskPicker && activeRole === rt && activeMode === "manual";
                                            return (
                                              <div key={rt} style={{ background: "var(--secondary)", border: `1px solid ${(isDirOpen || isManOpen) ? color + "50" : "var(--border)"}`, borderRadius: 8, padding: "10px 10px", minHeight: 90 }}>
                                                <div style={{ fontSize: 8, fontWeight: 800, color, letterSpacing: "0.1em", marginBottom: 7 }}>{icon} {label}</div>
                                                {assigned ? (
                                                  <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                                                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>
                                                        {assigned.name.charAt(0).toUpperCase()}
                                                      </div>
                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assigned.name}</div>
                                                        {assigned.role && <div style={{ fontSize: 9, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assigned.role}</div>}
                                                      </div>
                                                    </div>
                                                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                                      {assigned.email && <a href={`mailto:${assigned.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: 9, color, textDecoration: "none" }}>✉ Email</a>}
                                                      <button onClick={e => { e.stopPropagation(); clearTaskRole(task.id, rt); }} style={{ fontSize: 9, padding: "0 5px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.6)" }}>× Remove</button>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div>
                                                    {suggested && (
                                                      <div style={{ marginBottom: 5 }}>
                                                        <div style={{ fontSize: 8, color: "var(--muted-foreground)", marginBottom: 3 }}>SUGGESTED</div>
                                                        {suggested.split(/\s*\/\s*/).slice(0, 2).map(r => (
                                                          <button key={r} onClick={e => { e.stopPropagation(); assignTaskRole(task.id, rt, { name: r.trim(), role: r.trim(), source: "role" }); }}
                                                            style={{ display: "block", width: "100%", textAlign: "left" as const, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", marginBottom: 2, background: color + "10", border: `1px solid ${color}30`, color }}>
                                                            {r.trim()}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {!isDirOpen && !isManOpen && (
                                                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                                        <button onClick={e => { e.stopPropagation(); setOwnerPickerOpen(`${task.id}:${rt}:directory`); fetchPeople(); setPeopleSearch(""); }}
                                                          style={{ fontSize: 9, fontWeight: 700, padding: "4px 6px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", background: color + "10", border: `1px solid ${color}30`, color }}>
                                                          👥 Directory
                                                        </button>
                                                        <button onClick={e => { e.stopPropagation(); setOwnerPickerOpen(`${task.id}:${rt}:manual`); setManualInputs(p => ({ ...p, [`${task.id}:${rt}`]: { name: "", role: "" } })); }}
                                                          style={{ fontSize: 9, fontWeight: 700, padding: "4px 6px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                                                          ✏ Manual
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Directory picker (inline below roles grid) */}
                                      {isThisTaskPicker && activeRole && activeMode === "directory" && (
                                        <div style={{ margin: "8px 14px 0", border: "1px solid rgba(99,179,237,0.25)", borderRadius: 8, overflow: "hidden" }}>
                                          <div style={{ padding: "7px 10px", background: "rgba(99,179,237,0.04)", borderBottom: "1px solid rgba(99,179,237,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 10, color: "#63B3ED", fontWeight: 700, flexShrink: 0, textTransform: "capitalize" as const }}>Assign {activeRole}</span>
                                            <input autoFocus placeholder="Search name, role, or department…" value={peopleSearch}
                                              onChange={e => setPeopleSearch(e.target.value)} onClick={e => e.stopPropagation()}
                                              style={{ flex: 1, padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(99,179,237,0.3)", background: "var(--background)", color: "var(--foreground)", fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                                            <button onClick={e => { e.stopPropagation(); setOwnerPickerOpen(null); }} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>✕</button>
                                          </div>
                                          <div style={{ maxHeight: 180, overflowY: "auto" as const }}>
                                            {peopleLoading
                                              ? <div style={{ padding: 14, textAlign: "center" as const, fontSize: 11, color: "var(--muted-foreground)" }}>Loading directory…</div>
                                              : filteredPeople.length === 0
                                                ? <div style={{ padding: 14, textAlign: "center" as const, fontSize: 11, color: "var(--muted-foreground)" }}>No people found</div>
                                                : filteredPeople.slice(0, 50).map(p => (
                                                  <div key={p.id} onClick={e => { e.stopPropagation(); assignTaskRole(task.id, activeRole, { name: p.name, role: p.role, email: p.email, dept: p.dept, source: "directory" }); }}
                                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,179,237,0.06)")}
                                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(99,179,237,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#63B3ED", flexShrink: 0 }}>
                                                      {p.name.charAt(0)}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{p.name}</div>
                                                      <div style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{p.role}{p.dept ? ` · ${p.dept}` : ""}</div>
                                                    </div>
                                                    {p.email && <span style={{ fontSize: 9, color: "var(--muted-foreground)", flexShrink: 0 }}>{p.email}</span>}
                                                  </div>
                                                ))
                                            }
                                          </div>
                                        </div>
                                      )}

                                      {/* Manual entry */}
                                      {isThisTaskPicker && activeRole && activeMode === "manual" && (
                                        <div style={{ margin: "8px 14px 0", padding: 11, background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8 }}>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 7, textTransform: "uppercase" as const }}>Enter {activeRole} manually</div>
                                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            <input autoFocus placeholder="Full name *" value={manualInputs[`${task.id}:${activeRole}`]?.name ?? ""}
                                              onChange={e => setManualInputs(p => ({ ...p, [`${task.id}:${activeRole}`]: { ...(p[`${task.id}:${activeRole}`] ?? { name: "", role: "" }), name: e.target.value } }))}
                                              onClick={e => e.stopPropagation()}
                                              style={{ padding: "5px 9px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                                            <input placeholder="Role / title (e.g. CISO, IT Manager)" value={manualInputs[`${task.id}:${activeRole}`]?.role ?? ""}
                                              onChange={e => setManualInputs(p => ({ ...p, [`${task.id}:${activeRole}`]: { ...(p[`${task.id}:${activeRole}`] ?? { name: "", role: "" }), role: e.target.value } }))}
                                              onClick={e => e.stopPropagation()}
                                              style={{ padding: "5px 9px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" as const }}>
                                              <button onClick={e => { e.stopPropagation(); setOwnerPickerOpen(null); }} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
                                              <button disabled={!(manualInputs[`${task.id}:${activeRole}`]?.name ?? "").trim()}
                                                onClick={e => { e.stopPropagation(); const key = `${task.id}:${activeRole}`; const inp = manualInputs[key]; if (inp?.name.trim() && activeRole) assignTaskRole(task.id, activeRole, { name: inp.name.trim(), role: inp.role?.trim() || undefined, source: "manual" }); }}
                                                style={{ fontSize: 10, fontWeight: 700, padding: "3px 11px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", opacity: (manualInputs[`${task.id}:${activeRole}`]?.name ?? "").trim() ? 1 : 0.4, background: "rgba(99,179,237,0.1)", border: "1px solid rgba(99,179,237,0.3)", color: "#63B3ED" }}>
                                                Assign
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Deliverables + Evidence side by side */}
                                      {((task.deliverables?.length ?? 0) > 0 || (task.evidenceRequired?.length ?? 0) > 0) && (
                                        <div style={{ padding: "14px 14px 0", display: "grid", gridTemplateColumns: (task.deliverables?.length ?? 0) > 0 && (task.evidenceRequired?.length ?? 0) > 0 ? "1fr 1fr" : "1fr", gap: 10 }}>
                                          {(task.deliverables?.length ?? 0) > 0 && (
                                            <div>
                                              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 7 }}>TASK DELIVERABLES</div>
                                              <div style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                                                {task.deliverables!.map((d, i) => (
                                                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                                    <span style={{ color: "#63B3ED", fontSize: 11, flexShrink: 0 }}>📋</span>
                                                    <span style={{ fontSize: 10, color: "var(--foreground)", lineHeight: 1.5 }}>{d}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          {(task.evidenceRequired?.length ?? 0) > 0 && (
                                            <div>
                                              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 7 }}>EVIDENCE REQUIRED</div>
                                              <div style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                                                {task.evidenceRequired!.map((ev, i) => (
                                                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                                    <span style={{ color: "#F59E0B", fontSize: 11, flexShrink: 0 }}>🔎</span>
                                                    <span style={{ fontSize: 10, color: "var(--foreground)", lineHeight: 1.5 }}>{ev}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Sample Documents */}
                                      {(task.sampleDocs?.length ?? 0) > 0 && (
                                        <div style={{ padding: "14px 14px 0" }}>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", marginBottom: 7 }}>SAMPLE DOCUMENTS & TEMPLATES</div>
                                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                            {task.sampleDocs!.map((doc, i) => (
                                              <div key={i} style={{ padding: "10px 12px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 8, width: 220, display: "flex", flexDirection: "column", gap: 5 }}>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                                  <span style={{ fontSize: 18, lineHeight: 1 }}>📄</span>
                                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#A78BFA", lineHeight: 1.35 }}>{doc.name}</span>
                                                </div>
                                                <div style={{ fontSize: 9, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{doc.description}</div>
                                                <button
                                                  onClick={e => { e.stopPropagation(); setSelectedDoc(doc); }}
                                                  style={{ marginTop: 2, padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.1)", color: "#A78BFA", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                                                  📋 View Template
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div style={{ height: 14 }} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* Progress bar */}
                            <div style={{ marginTop: 4, padding: "8px 12px", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 99, transition: "width 0.3s", width: `${step.subTasks.length > 0 ? (step.subTasks.filter(t => state.taskChecks[t.id]).length / step.subTasks.length) * 100 : 0}%`, background: "#10B981" }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700, flexShrink: 0 }}>
                                {step.subTasks.filter(t => state.taskChecks[t.id]).length}/{step.subTasks.length} tasks ({completedRequired}/{requiredTasks.length} required)
                              </span>
                              {allRequiredDone && !isDone && (
                                <button onClick={() => setStepStatus(step.num, "done")}
                                  style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981", flexShrink: 0 }}>
                                  ✓ Mark Done
                                </button>
                              )}
                            </div>
                          </div>
                          );
                        })()}

                        {/* ── CONTROLS tab ─────────────────────────────── */}
                        {tab === "controls" && (() => {
                          const stepControls = getStepControls(step.num);
                          const domainColor: Record<string, string> = {
                            "Organisational": "#63B3ED",
                            "People": "#10B981",
                            "Physical": "#F59E0B",
                            "Technological": "#A78BFA",
                          };
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 2 }}>
                                ISO 27001:2022 Annex A controls relevant to this step. Set implementation status for each control, then click any row to view full detail and guidance.
                              </div>
                              {stepControls.length === 0 ? (
                                <div style={{ textAlign: "center" as const, padding: "28px 20px", color: "var(--muted-foreground)", fontSize: 12 }}>
                                  No specific Annex A controls mapped to this step.
                                </div>
                              ) : stepControls.map(ctrl => {
                                const controlStatus: ControlImplStatus = (state.controlStatuses ?? {})[ctrl.id] ?? "not-started";
                                const cfg = CTRL_STATUS_CFG[controlStatus];
                                const dColor = domainColor[ctrl.domain] ?? "#63B3ED";
                                return (
                                  <div key={ctrl.id}
                                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer" as const }}
                                    onClick={() => setSelectedControl(ctrl)}
                                  >
                                    {/* ID + domain */}
                                    <div style={{ flexShrink: 0, width: 42, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: dColor }}>{ctrl.id}</span>
                                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 10, background: `${dColor}20`, color: dColor, fontWeight: 700, whiteSpace: "nowrap" as const, textAlign: "center" as const }}>
                                        {ctrl.domain.slice(0, 3).toUpperCase()}
                                      </span>
                                    </div>
                                    {/* Name + desc */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>{ctrl.name}</div>
                                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ctrl.description}</div>
                                    </div>
                                    {/* Status selector */}
                                    <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                                      <select
                                        value={controlStatus}
                                        onChange={e => {
                                          const next = e.target.value as ControlImplStatus;
                                          const updated: JourneyState = { ...state, controlStatuses: { ...state.controlStatuses, [ctrl.id]: next } };
                                          setState(updated);
                                          saveState(tenantId, fwName, updated);
                                        }}
                                        style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, cursor: "pointer" as const, fontFamily: "inherit", outline: "none" }}
                                      >
                                        {(Object.keys(CTRL_STATUS_CFG) as ControlImplStatus[]).map(s => (
                                          <option key={s} value={s}>{CTRL_STATUS_CFG[s].label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {/* View arrow */}
                                    <span style={{ fontSize: 12, color: "var(--muted-foreground)", flexShrink: 0 }}>›</span>
                                  </div>
                                );
                              })}
                              <div style={{ marginTop: 4, padding: "8px 12px", borderRadius: 7, background: "rgba(99,179,237,0.05)", border: "1px solid rgba(99,179,237,0.15)", fontSize: 10, color: "var(--muted-foreground)" }}>
                                💡 Status changes are saved automatically. Click any control row to view full implementation guidance and testing notes.
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── DELIVERABLES tab ─────────────────────────── */}
                        {tab === "deliverables" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 2 }}>
                              Required outputs and documents for this step. Auditors will expect these as evidence of completion.
                            </div>
                            {step.deliverables.map((d, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 13px",
                                background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 9,
                              }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: 7, flexShrink: 0, fontSize: 15,
                                  background: d.required ? "rgba(99,179,237,0.1)" : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${d.required ? "rgba(99,179,237,0.2)" : "var(--border)"}`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  📄
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{d.name}</span>
                                    <span style={{
                                      fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                                      background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)", color: "var(--muted-foreground)",
                                    }}>
                                      {d.format}
                                    </span>
                                    {d.required && (
                                      <span style={{
                                        fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
                                        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#EF4444",
                                      }}>
                                        REQUIRED
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{d.description}</div>
                                  {d.template && (
                                    <div style={{ fontSize: 10, color: "#60A5FA", marginTop: 3 }}>
                                      📋 Template: {d.template}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── EVIDENCE tab ─────────────────────────────── */}
                        {tab === "evidence" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 2 }}>
                              Evidence items for this step. Platform-connected evidence is fetched automatically. Upload additional documents and use AI validation to confirm coverage.
                            </div>
                            <EvidencePanel
                              evidence={step.evidence}
                              stepRef={step.ref}
                              state={state}
                              tenantId={tenantId}
                              fwName={fwName}
                              onStateChange={next => { setState(next); saveState(tenantId, fwName, next); }}
                            />
                          </div>
                        )}

                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {state.startedAt && (
        <div style={{ marginTop: 10, textAlign: "right", fontSize: 10, color: "var(--muted-foreground)" }}>
          Journey started {new Date(state.startedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
        </div>
      )}

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Control Detail Modal ──────────────────────────────────────────────── */}
      {selectedControl && (() => {
        const ctrl = selectedControl;
        const controlStatus: ControlImplStatus = (state.controlStatuses ?? {})[ctrl.id] ?? "not-started";
        const cfg = CTRL_STATUS_CFG[controlStatus];
        const domainColor: Record<string, string> = {
          "Organisational": "#63B3ED", "People": "#10B981",
          "Physical": "#F59E0B", "Technological": "#A78BFA",
        };
        const dColor = domainColor[ctrl.domain] ?? "#63B3ED";
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "stretch", justifyContent: "flex-end" }}
            onClick={() => setSelectedControl(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: "min(820px, 96vw)", height: "100vh", overflowY: "auto", background: "var(--background)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}
            >
              {/* Header */}
              <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", background: "var(--card)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                  <div style={{ flexShrink: 0, minWidth: 52, padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 800, color: dColor, letterSpacing: "-0.5px" }}>{ctrl.id}</span>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: `${dColor}20`, color: dColor, fontWeight: 700 }}>{ctrl.domain}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.25 }}>{ctrl.name}</h2>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>ISO 27001:2022 Annex A Control</div>
                  </div>
                  <button onClick={() => setSelectedControl(null)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕ Close</button>
                </div>
                {/* Status selector */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Implementation Status:</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(Object.keys(CTRL_STATUS_CFG) as ControlImplStatus[]).map(s => {
                      const c = CTRL_STATUS_CFG[s];
                      const active = controlStatus === s;
                      return (
                        <button key={s} onClick={() => {
                          const updated: JourneyState = { ...state, controlStatuses: { ...state.controlStatuses, [ctrl.id]: s } };
                          setState(updated); saveState(tenantId, fwName, updated);
                        }}
                          style={{ padding: "5px 11px", borderRadius: 6, border: `1px solid ${active ? c.border : "var(--border)"}`, background: active ? c.bg : "transparent", color: active ? c.color : "var(--muted-foreground)", fontSize: 10, fontWeight: active ? 800 : 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                          {active && <span style={{ marginRight: 4 }}>●</span>}{c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
                {/* Description */}
                <section>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Control Requirement</div>
                  <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.7, padding: "12px 16px", background: "var(--secondary)", borderRadius: 8, borderLeft: `3px solid ${dColor}` }}>
                    {ctrl.description}
                  </div>
                </section>

                {/* Purpose */}
                <section>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Why This Control Matters</div>
                  <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.7 }}>{ctrl.purpose}</div>
                </section>

                {/* Implementation */}
                <section>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Implementation Steps</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ctrl.implementation.map((step, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${dColor}20`, border: `1px solid ${dColor}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: dColor, flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</div>
                        <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.6, paddingTop: 3 }}>{step}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Testing guidance */}
                <section>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Auditor Testing Guidance</div>
                  <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.7, padding: "12px 16px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.15)" }}>
                    🔍 {ctrl.testingGuidance}
                  </div>
                </section>

                {/* Common gaps */}
                <section>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Common Gaps & Findings</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {ctrl.commonGaps.map((gap, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7 }}>
                        <span style={{ color: "#EF4444", fontSize: 12, flexShrink: 0 }}>⚠</span>
                        <span style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.5 }}>{gap}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sample Doc Template Modal ─────────────────────────────────────────── */}
      {selectedDoc && (() => {
        const doc = selectedDoc;
        const name = doc.name.toLowerCase();
        type TemplateSection = { heading: string; content: string };
        const sections: TemplateSection[] = name.includes("policy") ? [
          { heading: "1. Purpose", content: "This policy establishes the organisation's requirements for [topic]. It defines the principles, standards, and controls that all personnel and systems must adhere to." },
          { heading: "2. Scope", content: "This policy applies to all employees, contractors, third-party personnel, and systems that access, process, store, or transmit the organisation's information assets." },
          { heading: "3. Policy Statements", content: "3.1 All [activities] shall be conducted in accordance with this policy and applicable legal requirements.\n3.2 Exceptions must be formally approved and documented.\n3.3 Non-compliance may result in disciplinary action." },
          { heading: "4. Roles & Responsibilities", content: "• CISO — Owns and maintains this policy\n• ISMS Manager — Monitors compliance and manages exceptions\n• All Staff — Must read, understand, and comply with this policy" },
          { heading: "5. Compliance & Monitoring", content: "Compliance with this policy shall be reviewed at least annually and after any significant change. Non-compliances must be reported to the ISMS Manager within [N] business days." },
          { heading: "6. Review & Maintenance", content: "This policy shall be reviewed annually by the policy owner, or sooner if triggered by a regulatory change, security incident, or significant organisational change. Version history must be maintained." },
          { heading: "7. Related Documents", content: "• Information Security Policy (parent)\n• [Topic-specific supporting procedures]\n• Legal and Regulatory Requirements Register" },
        ] : name.includes("agenda") || name.includes("workshop") ? [
          { heading: "Workshop Details", content: "Date: [DATE]    Time: [START] – [END]    Venue: [LOCATION]\nFacilitator: [NAME / ROLE]    Scribe: [NAME / ROLE]" },
          { heading: "Objectives", content: "1. [Primary objective of the workshop]\n2. [Secondary objective]\n3. Agree on next steps and document owner assignments" },
          { heading: "Attendees", content: "• [Name, Role, Department]\n• [Name, Role, Department]\n(minimum: CISO, ISMS Manager, Legal, IT Lead, HR representative)" },
          { heading: "Agenda", content: "09:00 — Welcome and introductions (10 min)\n09:10 — Scope of the session (5 min)\n09:15 — Presentation of current state / context (20 min)\n09:35 — Group discussion: [key topic 1] (25 min)\n10:00 — Group discussion: [key topic 2] (25 min)\n10:25 — Break (15 min)\n10:40 — Agreement on outputs and owners (20 min)\n11:00 — Review of actions and close (15 min)" },
          { heading: "Pre-Reading & Materials", content: "• [Document 1 — circulate at least 3 business days in advance]\n• [Document 2]\n• [Template / worksheet to be completed during session]" },
          { heading: "Outputs & Actions", content: "| Action | Owner | Due Date | Status |\n|--------|-------|----------|--------|\n| [Action] | [Owner] | [Date] | Open |" },
        ] : name.includes("register") || name.includes("log") ? [
          { heading: "Document Control", content: "Version: 1.0    Date: [DATE]    Owner: [ROLE]    Approved by: [NAME]" },
          { heading: "Purpose", content: "This register documents all [items] identified, assessed, and managed as part of the ISMS. It is a mandatory ISMS evidence document." },
          { heading: "Register Fields", content: "ID | Name / Description | Category | Owner | Date Identified | Status | Review Date | Notes\n[Use one row per item; colour-code by status if using a spreadsheet]" },
          { heading: "Scoring / Classification Guidance", content: "• High — [criteria]\n• Medium — [criteria]\n• Low — [criteria]\nAll High items must have an assigned owner and an action plan." },
          { heading: "Review Cycle", content: "This register must be reviewed at minimum quarterly and updated after any ISMS event, audit finding, or significant change." },
        ] : name.includes("assessment") || name.includes("analysis") ? [
          { heading: "Document Control", content: "Version: 1.0    Date: [DATE]    Conducted by: [NAME / ROLE]    Approved by: [NAME]" },
          { heading: "1. Objective", content: "This assessment analyses [subject area] to identify [key outputs: risks / gaps / opportunities / requirements] that will inform the ISMS design and implementation." },
          { heading: "2. Methodology", content: "The assessment uses [SWOT / PESTLE / gap analysis / maturity model] methodology. Inputs were gathered via [interviews / workshops / data analysis]. Findings are graded [High / Medium / Low]." },
          { heading: "3. Findings Summary", content: "| Ref | Finding | Category | Rating | Implication | Recommended Action |\n|-----|---------|----------|--------|-------------|--------------------|\n| F-001 | [Finding] | [Category] | High | [Implication] | [Action] |" },
          { heading: "4. Conclusions", content: "Key themes emerging from this assessment:\n1. [Theme / conclusion 1]\n2. [Theme / conclusion 2]\n3. [Theme / conclusion 3]" },
          { heading: "5. Recommended Actions", content: "Priority actions arising from this assessment are listed in the ISMS project plan. Each has a named owner, target completion date, and status tracked in ComplianceOps." },
          { heading: "6. Appendices", content: "A. Raw data / interview notes\nB. Reference framework / standard\nC. Comparison with previous assessment (if applicable)" },
        ] : [
          { heading: "1. Document Overview", content: `This template provides a structured starting point for creating your ${doc.name}. Customise all sections to reflect your organisation's specific context, requirements, and terminology.` },
          { heading: "2. Purpose & Scope", content: "Describe what this document covers and who it applies to. Be specific about scope boundaries — what is included and what is explicitly excluded." },
          { heading: "3. Key Content Sections", content: "[Section 1 — main content area]\n[Section 2 — supporting detail]\n[Section 3 — roles and responsibilities]\n[Section 4 — procedures or processes]" },
          { heading: "4. Definitions & Abbreviations", content: "Define any technical terms, acronyms, or role titles used in this document to ensure consistent interpretation by all readers." },
          { heading: "5. References", content: "• ISO 27001:2022 — relevant clauses\n• Applicable policies and procedures\n• Regulatory or legal requirements that informed this document" },
          { heading: "6. Approval & Version History", content: "| Version | Date | Author | Change Summary | Approved By |\n|---------|------|--------|----------------|-------------|\n| 1.0 | [DATE] | [Author] | Initial draft | [Approver] |" },
        ];
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setSelectedDoc(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: "min(860px, 96vw)", maxHeight: "92vh", overflowY: "auto", background: "var(--background)", borderRadius: 12, border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}
            >
              {/* Header */}
              <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", background: "var(--card)", borderRadius: "12px 12px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>📄</span>
                  <div>
                    <h2 style={{ margin: "0 0 3px", fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>{doc.name}</h2>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{doc.description}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "rgba(167,139,250,0.1)", color: "#A78BFA", fontWeight: 700, border: "1px solid rgba(167,139,250,0.2)" }}>ISMS TEMPLATE</span>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "rgba(16,185,129,0.1)", color: "#10B981", fontWeight: 700, border: "1px solid rgba(16,185,129,0.2)" }}>ISO 27001:2022</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedDoc(null)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕ Close</button>
              </div>

              {/* Document preview */}
              <div style={{ padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
                {/* Document header block */}
                <div style={{ padding: "14px 18px", background: "var(--secondary)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", gap: 24, flexWrap: "wrap" as const }}>
                  {[["Document Title:", doc.name], ["Document Type:", "ISMS Template"], ["Version:", "1.0"], ["Last Updated:", new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })], ["Classification:", "Internal — Confidential"]].map(([label, val]) => (
                    <div key={label} style={{ minWidth: 150 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Sections */}
                {sections.map((sec, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid var(--border)" }}>{sec.heading}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.75, whiteSpace: "pre-wrap" as const }}>{sec.content}</div>
                  </div>
                ))}

                <div style={{ marginTop: 4, padding: "10px 14px", borderRadius: 7, background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)", fontSize: 11, color: "var(--muted-foreground)" }}>
                  💡 <strong>This is a template outline.</strong> Populate each section with your organisation's specific details. Save the completed document in GovOps and link it to the relevant ISMS evidence item.
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
