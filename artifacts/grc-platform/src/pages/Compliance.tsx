import { useState, useMemo, useRef } from "react";
import { type ComplianceControl } from "@/lib/data";
import { useComplianceFrameworks, useComplianceControls, useUpdateControl } from "@/hooks/useGrcApi";
import { useLicense } from "@/context/LicenseContext";
import { UpgradeModal } from "@/components/UpgradeModal";

const statusStyle: Record<string, { bg: string; color: string; border: string; label: string }> = {
  "implemented":  { bg: "rgba(34,197,94,0.08)",  color: "#065F46", border: "#A7F3D0", label: "Implemented" },
  "partial":      { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A", label: "Partial" },
  "planned":      { bg: "#EEF2FF",               color: "#3730A3", border: "#C7D2FE", label: "Planned" },
  "not-started":  { bg: "rgb(23,30,42)",          color: "#6B7280", border: "rgba(255,255,255,0.1)", label: "Not Started" },
};

const NAV = "#1E3A5F";
const EME = "#065F46";

function GapChart({ fw, allControls }: { fw: any; allControls: ComplianceControl[] }) {
  const fwControls = allControls.filter(c => c.framework === fw.name);
  const domains = [...new Set(fwControls.map(c => c.domain))];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {domains.map(domain => {
        const dc = fwControls.filter(c => c.domain === domain);
        const impl = dc.filter(c => c.status === "implemented").length;
        const partial = dc.filter(c => c.status === "partial").length;
        const planned = dc.filter(c => c.status === "planned").length;
        const notStarted = dc.filter(c => c.status === "not-started").length;
        const total = dc.length;
        return (
          <div key={domain}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{domain}</span>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>{impl}/{total}</span>
            </div>
            <div style={{ height: 10, background: "var(--input)", borderRadius: 5, overflow: "hidden", display: "flex" }}>
              {impl > 0      && <div style={{ width: `${(impl / total) * 100}%`,       background: "#10B981", height: "100%" }} title={`${impl} implemented`} />}
              {partial > 0   && <div style={{ width: `${(partial / total) * 100}%`,    background: "#F59E0B", height: "100%" }} title={`${partial} partial`} />}
              {planned > 0   && <div style={{ width: `${(planned / total) * 100}%`,    background: "#6366F1", height: "100%" }} title={`${planned} planned`} />}
              {notStarted > 0 && <div style={{ width: `${(notStarted / total) * 100}%`,background: "#E5E7EB", height: "100%" }} title={`${notStarted} not started`} />}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        {[["#10B981", "Implemented"], ["#F59E0B", "Partial"], ["#6366F1", "Planned"], ["#E5E7EB", "Not Started"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
            <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Compliance() {
  const { isFrameworkLicensed, isViewingOwnTenant, rawFrameworkIds, plan } = useLicense();
  const [upgradeFramework, setUpgradeFramework] = useState<string | null>(null);
  const [activeFramework, setActiveFramework] = useState<string>("all");
  const [selectedControl, setSelectedControl] = useState<ComplianceControl | null>(null);
  const [showGap, setShowGap] = useState(false);
  const [showEvidenceUpload, setShowEvidenceUpload] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<ComplianceControl | null>(null);
  const [evidenceType, setEvidenceType] = useState("Policy Document");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<"status" | "framework" | "domain" | "none">("none");

  const { data: apiFrameworks, isLoading: fwLoading, isError: fwError } = useComplianceFrameworks();

  const frameworks = useMemo(() => (apiFrameworks && apiFrameworks.length > 0) ? apiFrameworks : [], [apiFrameworks]);

  // Only frameworks licensed for this tenant — used for both the card grid and controls query.
  // Super-admin on own tenant sees all frameworks via isFrameworkLicensed bypass.
  const visibleFrameworks = useMemo(
    () => frameworks.filter((fw: any) => isFrameworkLicensed(fw.libraryId ?? 0)),
    [frameworks, isFrameworkLicensed]
  );

  const licensedFwNames = useMemo(
    () => visibleFrameworks.map((fw: any) => fw.name as string),
    [visibleFrameworks]
  );

  // isViewingOwnTenant → undefined (fetch all); otherwise pass names ([] → deny-by-default when unlicensed)
  const controlsParam = isViewingOwnTenant
    ? (licensedFwNames.length > 0 ? licensedFwNames : undefined)
    : licensedFwNames;
  const { data: apiControls, isLoading: ctrlLoading, isError: ctrlError } = useComplianceControls(controlsParam);
  const updateControl = useUpdateControl();

  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<ComplianceControl>>>({});

  const baseControls: ComplianceControl[] = (apiControls && apiControls.length > 0)
    ? apiControls.map(c => ({ ...c, _dbId: c.id, id: c.controlId ?? String(c.id), crossReferences: [], description: "", status: (c.status as ComplianceControl["status"]) ?? "not-started" })) as ComplianceControl[]
    : [];
  const localControls = baseControls.map(c => ({ ...c, ...(localOverrides[c.id] ?? {}) }));

  function setLocalControls(updater: (prev: ComplianceControl[]) => ComplianceControl[]) {
    const updated = updater(localControls);
    const overrides: Record<string, Partial<ComplianceControl>> = { ...localOverrides };
    updated.forEach(c => {
      const orig = baseControls.find(b => b.id === c.id);
      if (orig) {
        const diff: Partial<ComplianceControl> = {};
        if (c.evidence !== orig.evidence) diff.evidence = c.evidence;
        if (c.status !== orig.status) diff.status = c.status;
        if (Object.keys(diff).length > 0) overrides[c.id] = { ...(overrides[c.id] ?? {}), ...diff };
      }
    });
    setLocalOverrides(overrides);
  }

  const activeFw = visibleFrameworks.find((f: any) => f.id === activeFramework);
  const filtered = (activeFramework === "all"
    ? localControls.filter(c => licensedFwNames.includes(c.framework))
    : localControls.filter(c => c.framework === (activeFw as any)?.name)
  ).sort((a, b) => {
    if (sortBy === "status") {
      const order: Record<string, number> = { "not-started": 0, "planned": 1, "partial": 2, "implemented": 3 };
      return (order[a.status] ?? 0) - (order[b.status] ?? 0);
    }
    if (sortBy === "framework") return a.framework.localeCompare(b.framework);
    if (sortBy === "domain") return a.domain.localeCompare(b.domain);
    return 0;
  });

  const implCount = filtered.filter(c => c.status === "implemented").length;
  const isLoading = fwLoading || ctrlLoading;
  const isError = fwError || ctrlError;

  function openEvidenceUpload(c: ComplianceControl) {
    setEvidenceTarget(c);
    setEvidenceFile(null);
    setEvidenceDesc("");
    setEvidenceType("Policy Document");
    setUploadError(null);
    setShowEvidenceUpload(true);
  }

  async function addEvidence(ctrl: ComplianceControl) {
    if (!evidenceFile) { setUploadError("Please select a file to upload."); return; }
    setUploadingEvidence(true);
    setUploadError(null);
    try {
      const token = localStorage.getItem("grc_token");
      const form = new FormData();
      form.append("file", evidenceFile);
      form.append("controlRef",   ctrl.id);
      form.append("controlDbId",  String((ctrl as any)._dbId ?? ""));
      form.append("evidenceType", evidenceType);
      form.append("description",  evidenceDesc);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Upload failed (${res.status})`);
      }
      setLocalControls(prev => prev.map(c => c.id === ctrl.id ? { ...c, evidence: c.evidence + 1 } : c));
      setShowEvidenceUpload(false);
      setEvidenceTarget(null);
      setEvidenceFile(null);
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed");
    } finally {
      setUploadingEvidence(false);
    }
  }

  const allGapFrameworks = visibleFrameworks.filter((fw: any) =>
    activeFramework === "all" ? true : fw.id === activeFramework
  );

  if (isLoading) return (
    <div style={{ padding: 32, color: "#9CA3AF", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #1E3A5F", borderTopColor: "#93C5FD", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      Loading compliance data…
    </div>
  );

  if (isError) return (
    <div style={{ padding: 32, color: "#DC2626", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>⚠</span>
      Failed to load compliance data. Please check your connection and try again.
    </div>
  );

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "rgb(147,197,253)", letterSpacing: "-0.5px", margin: 0 }}>Compliance</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0", fontWeight: 500 }}>Framework coverage, controls and evidence management</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowGap(!showGap)} style={{ background: showGap ? "rgba(59,130,246,0.15)" : "var(--input)", border: showGap ? "1px solid #BFDBFE" : "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: showGap ? NAV : "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
            ◫ Gap Analysis
          </button>
          <button style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(30,58,95,0.3)" }}>+ Add Framework</button>
        </div>
      </div>

      {/* Framework cards — isViewingOwnTenant sees all (with lock overlay); others see only licensed */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {(isViewingOwnTenant ? frameworks : visibleFrameworks).map((fw) => {
          // For lock UI: use raw DB frameworkIds — isViewingOwnTenant bypass only affects access, not visualization
          const isLic = isViewingOwnTenant
            ? rawFrameworkIds.includes((fw as any).libraryId ?? 0)
            : isFrameworkLicensed((fw as any).libraryId ?? 0);
          return (
            <div key={fw.id}
              onClick={() => {
                if (!isLic) { setUpgradeFramework(fw.name); return; }
                setActiveFramework(activeFramework === fw.id ? "all" : fw.id);
              }}
              style={{ background: "var(--card)", border: activeFramework === fw.id ? `2px solid ${fw.color}` : "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", cursor: isLic ? "pointer" : "not-allowed", boxShadow: activeFramework === fw.id ? `0 4px 16px ${fw.color}22` : "0 1px 4px rgba(0,0,0,0.05)", transition: "all 0.15s", position: "relative", opacity: isLic ? 1 : 0.5, filter: isLic ? "none" : "grayscale(0.35)" }}>
              {!isLic && (
                <div style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,0.75)", borderRadius: 5, padding: "2px 6px", fontSize: 9, fontWeight: 700, color: "#FBBF24", display: "flex", alignItems: "center", gap: 3, letterSpacing: "0.3px" }}>🔒 Upgrade</div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>{fw.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: fw.color, marginBottom: 6 }}>{isLic ? `${fw.pct}%` : "—"}</div>
              <div style={{ height: 5, background: "var(--input)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: isLic ? `${fw.pct}%` : "0%", background: fw.color, borderRadius: 3, transition: "width 1s ease" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: (fw as any).trend === "up" ? "#065F46" : "#9CA3AF" }}>
                  {isLic ? ((fw as any).trend === "up" ? "▲ Improving" : "— Stable") : "Locked"}
                </span>
                <span style={{ fontSize: 9, color: "#9CA3AF" }}>{`${(fw as any).controls ?? ""} ctrls`}</span>
              </div>
            </div>
          );
        })}
      </div>
      {upgradeFramework && (
        <UpgradeModal feature={`${upgradeFramework} Framework`} plan={plan} onClose={() => setUpgradeFramework(null)} />
      )}

      {/* Gap Analysis Chart */}
      {showGap && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 16 }}>Gap Analysis — Controls by Domain</div>
          <div style={{ display: "grid", gridTemplateColumns: activeFramework === "all" ? "repeat(3, 1fr)" : "1fr", gap: 20 }}>
            {allGapFrameworks.map(fw => (
              <div key={fw.id}>
                <div style={{ fontSize: 11, fontWeight: 700, color: fw.color, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: fw.color }} />
                  {fw.name}
                </div>
                <GapChart fw={fw as any} allControls={localControls} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls table */}
      <div style={{ display: "grid", gridTemplateColumns: selectedControl ? "1fr 380px" : "1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>
                  {activeFramework === "all" ? "All Controls" : `${activeFw?.name} Controls`}
                </span>
                <span style={{ marginLeft: 10, fontSize: 11, color: "#9CA3AF" }}>{implCount}/{filtered.length} implemented</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, color: "var(--foreground)", background: "var(--input)", fontFamily: "inherit", cursor: "pointer" }}>
                <option value="none">Sort: Default</option>
                <option value="status">Sort: Status</option>
                <option value="framework">Sort: Framework</option>
                <option value="domain">Sort: Domain</option>
              </select>
              {activeFramework !== "all" && (
                <button onClick={() => setActiveFramework("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, fontFamily: "inherit" }}>Clear ×</button>
              )}
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                {["Control ID", "Framework", "Domain", "Control Name", "Status", "Owner", "Evidence", "Due Date"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#9CA3AF", fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setSelectedControl(selectedControl?.id === c.id ? null : c)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selectedControl?.id === c.id ? "rgba(59,130,246,0.06)" : "transparent", transition: "background 0.1s" }}
                  onMouseEnter={e => { if (selectedControl?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = "var(--secondary)"; }}
                  onMouseLeave={e => { if (selectedControl?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{c.id}</td>
                  <td style={{ padding: "11px 14px", color: "var(--foreground)", fontWeight: 600 }}>{c.framework}</td>
                  <td style={{ padding: "11px 14px", color: "#6B7280" }}>{c.domain}</td>
                  <td style={{ padding: "11px 14px", color: "var(--foreground)", maxWidth: 240 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: statusStyle[c.status].bg, border: `1px solid ${statusStyle[c.status].border}`, color: statusStyle[c.status].color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{statusStyle[c.status].label}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span className="owner-capsule">{c.owner}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <button onClick={e => { e.stopPropagation(); openEvidenceUpload(c); }}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: c.evidence > 0 ? "#065F46" : "#9CA3AF" }}>{c.evidence}</span>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>files</span>
                      <span style={{ fontSize: 10, color: "rgb(147,197,253)", fontWeight: 700 }}>+</span>
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: "#9CA3AF" }}>{c.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Control Detail Drawer */}
        {selectedControl && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#9CA3AF", fontWeight: 600, marginBottom: 6 }}>{selectedControl.id}</div>
                <span style={{ background: statusStyle[selectedControl.status].bg, border: `1px solid ${statusStyle[selectedControl.status].border}`, color: statusStyle[selectedControl.status].color, borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{statusStyle[selectedControl.status].label}</span>
              </div>
              <button onClick={() => setSelectedControl(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
            </div>

            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)", margin: "0 0 8px", lineHeight: 1.4 }}>{selectedControl.name}</h3>
              <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
                {selectedControl.description ?? `This control requires organizations to ${selectedControl.name.toLowerCase()}. Implementation must be documented and tested periodically per framework requirements.`}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "var(--input)", borderRadius: 8 }}>
              {[
                ["Framework", selectedControl.framework],
                ["Domain", selectedControl.domain],
                ["Owner", selectedControl.owner],
                ["Due Date", selectedControl.dueDate],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Evidence section */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>Evidence ({selectedControl.evidence} files)</span>
                <button onClick={() => openEvidenceUpload(selectedControl)} style={{ background: `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>+ Upload</button>
              </div>
              {selectedControl.evidence > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Array.from({ length: Math.min(selectedControl.evidence, 4) }, (_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--input)", borderRadius: 6, border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {["Policy_Document_v2.pdf", "Audit_Report_Q2.xlsx", "Screenshot_Evidence.png", "Test_Results.pdf"][i]}
                        </div>
                        <div style={{ fontSize: 9, color: "#9CA3AF" }}>Uploaded {["2 days ago", "1 week ago", "2 weeks ago", "1 month ago"][i]}</div>
                      </div>
                      <span style={{ fontSize: 10, color: "#065F46", fontWeight: 700 }}>✓</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "16px", color: "#9CA3AF", fontSize: 11, border: "1px dashed var(--border)", borderRadius: 8 }}>
                  No evidence uploaded yet
                </div>
              )}
            </div>

            {/* Status change */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Update Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {(["implemented", "partial", "planned", "not-started"] as const).map(s => (
                  <button key={s} onClick={() => {
                    setLocalControls(prev => prev.map(c => c.id === selectedControl.id ? { ...c, status: s } : c));
                    setSelectedControl(prev => prev ? { ...prev, status: s } : prev);
                    updateControl.mutate({ id: (selectedControl as any)._dbId ?? selectedControl.id, body: { status: s } as any });
                  }}
                    style={{ background: selectedControl.status === s ? statusStyle[s].bg : "var(--input)", border: `1px solid ${selectedControl.status === s ? statusStyle[s].border : "var(--border)"}`, borderRadius: 6, padding: "6px 8px", fontSize: 10, fontWeight: 700, color: selectedControl.status === s ? statusStyle[s].color : "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>
                    {statusStyle[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1, background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Edit Control</button>
              <button style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>Link Risk</button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.docx,.doc,.txt,.csv,.zip"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          setEvidenceFile(f);
          setUploadError(null);
          if (e.target) e.target.value = "";
        }}
      />

      {/* Evidence Upload Modal */}
      {showEvidenceUpload && evidenceTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) { setShowEvidenceUpload(false); } }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "rgb(147,197,253)" }}>Upload Evidence</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Control: {evidenceTarget.id} — {evidenceTarget.name}</div>
              </div>
              <button onClick={() => setShowEvidenceUpload(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Drop zone / file picker */}
              <div
                style={{ border: `2px dashed ${evidenceFile ? "#22C55E" : "var(--border)"}`, borderRadius: 12, padding: "28px 24px", textAlign: "center", cursor: "pointer", transition: "border-color 0.15s", background: evidenceFile ? "rgba(34,197,94,0.04)" : "transparent" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = "rgb(147,197,253)"; }}
                onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = evidenceFile ? "#22C55E" : "var(--border)"; }}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0] ?? null;
                  setEvidenceFile(f);
                  setUploadError(null);
                  (e.currentTarget as HTMLDivElement).style.borderColor = f ? "#22C55E" : "var(--border)";
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = evidenceFile ? "#22C55E" : "rgb(147,197,253)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = evidenceFile ? "#22C55E" : "var(--border)"}
              >
                {evidenceFile ? (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#22C55E", marginBottom: 2 }}>{evidenceFile.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{(evidenceFile.size / 1024).toFixed(1)} KB · Click to change</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>Drop files here or click to browse</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>PDF, XLSX, PNG, DOCX up to 25MB</div>
                  </>
                )}
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Evidence Type</label>
                <select value={evidenceType} onChange={e => setEvidenceType(e.target.value)} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", cursor: "pointer" }}>
                  <option>Policy Document</option>
                  <option>Audit Report</option>
                  <option>Screenshot</option>
                  <option>Test Result</option>
                  <option>Configuration Export</option>
                  <option>Training Completion</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Description (optional)</label>
                <input value={evidenceDesc} onChange={e => setEvidenceDesc(e.target.value)} placeholder="Describe the evidence..." style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
              </div>
              {uploadError && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#F87171" }}>{uploadError}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => addEvidence(evidenceTarget)}
                  disabled={uploadingEvidence}
                  style={{ flex: 1, background: uploadingEvidence ? "var(--border)" : "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700, color: "white", cursor: uploadingEvidence ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: uploadingEvidence ? 0.7 : 1 }}>
                  {uploadingEvidence ? "⟳ Uploading…" : "⬆ Upload Evidence"}
                </button>
                <button onClick={() => setShowEvidenceUpload(false)} style={{ padding: "10px 20px", border: "1px solid var(--border)", background: "var(--input)", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
