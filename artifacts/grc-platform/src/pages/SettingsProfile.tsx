import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ObjectProfilePage } from "@/components/ObjectProfilePage";
import { allAgents, extendedUsers, userRoles, assetGroups, allAssets } from "@/lib/grc-data";

const NAV = "#1E3A5F", EME = "#065F46", AMB = "#D97706", RED = "#DC2626", BLU = "#1D4ED8", PRP = "#7C3AED";

const card: React.CSSProperties = { background: "white", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };

function KV({ k, v, mono = false }: { k: string; v: string | number; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F9F8F6", fontSize: 11 }}>
      <span style={{ color: "#9CA3AF" }}>{k}</span>
      <span style={{ color: NAV, fontWeight: 600, fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit" }}>{v}</span>
    </div>
  );
}

function Chips({ items, color = BLU, bg = "#EFF6FF", border = "#BFDBFE" }: { items: string[]; color?: string; bg?: string; border?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
      {items.map(t => (
        <span key={t} style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "3px 8px" }}>{t}</span>
      ))}
    </div>
  );
}

function Bar({ pct, danger = false }: { pct: number; danger?: boolean }) {
  const c = danger ? RED : pct > 70 ? AMB : EME;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono',monospace", width: 36, textAlign: "right" as const }}>{pct}%</span>
    </div>
  );
}

function SettingsNotFound({ label, id, backHref }: { label: string; id: string; backHref: string }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding:"60px 32px", textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:16, opacity:0.5 }}>🔍</div>
      <div style={{ fontSize:20, fontWeight:800, color:"var(--foreground)", marginBottom:10 }}>{label} not found</div>
      <code style={{ fontSize:12, color:"#9CA3AF", background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 12px", display:"inline-block", marginBottom:16 }}>{id}</code>
      <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:28, maxWidth:380, lineHeight:1.7 }}>
        This record could not be located. It may have been removed, or you may not have permission to view it.
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button
          onClick={() => navigate(backHref)}
          style={{ padding:"10px 24px", borderRadius:8, border:"1px solid rgba(147,197,253,0.35)", background:"rgba(147,197,253,0.08)", color:"rgb(147,197,253)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
        >← Go back</button>
        <button
          onClick={() => window.history.back()}
          style={{ padding:"10px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Browser back</button>
      </div>
    </div>
  );
}

export default function SettingsProfile() {
  const [location] = useLocation();
  const [caasmAsset, setCaasmAsset] = useState<any>(null);

  const assetMatch  = location.match(/^\/settings\/assets\/(.+)$/);
  const assetId     = assetMatch ? assetMatch[1]! : null;

  useEffect(() => {
    if (!assetId) { setCaasmAsset(null); return; }
    if (allAssets.find(a => a.id === assetId)) return;
    const token = localStorage.getItem("grc_token");
    const base  = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
    const api   = base.replace(/grc-platform\/?$/, "api");
    fetch(`${api}caasm/assets/${assetId}`, { headers: { Authorization: `Bearer ${token ?? ""}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCaasmAsset(d))
      .catch(() => {});
  }, [assetId]);

  const groupMatch  = location.match(/^\/settings\/asset-groups\/(.+)$/);
  const agentMatch  = location.match(/^\/settings\/agents\/(.+)$/);
  const userMatch   = location.match(/^\/settings\/users\/(.+)$/);
  const roleMatch   = location.match(/^\/settings\/user-roles\/(.+)$/);

  // ── ASSET PROFILE ────────────────────────────────────────────────────────────
  if (assetMatch) {
    const id = assetId!;
    const staticAsset = allAssets.find(a => a.id === id);
    const asset = staticAsset ?? (caasmAsset?.id ? {
      id:              String(caasmAsset.id),
      name:            String(caasmAsset.hostname),
      type:            String(caasmAsset.category),
      subType:         String(caasmAsset.os),
      criticality:     String(caasmAsset.risk) as "Critical"|"High"|"Medium"|"Low",
      environment:     String(caasmAsset.environment ?? "Corporate"),
      owner:           String(caasmAsset.dept),
      location:        String(caasmAsset.location ?? "—"),
      ipAddress:       String(caasmAsset.ip),
      platform:        String(caasmAsset.os),
      version:         String(caasmAsset.agentVersion ?? "—"),
      dataSensitivity: String(caasmAsset.dataSensitivity ?? "Internal"),
      riskScore:       Number(caasmAsset.exposureScore) || 0,
      residualRisk:    Math.max(10, (Number(caasmAsset.exposureScore) || 0) - 15),
      openFindings:    Number(caasmAsset.vulnCount) || 0,
      status:          caasmAsset.managed ? "active" : "inactive",
      tags:            Array.isArray(caasmAsset.tags) ? caasmAsset.tags : [],
      linkedRisks:     [] as string[],
      discoveredAt:    String(caasmAsset.createdAt ?? "—"),
      lastScan:        String(caasmAsset.lastSeen ?? "—"),
      description:     `${caasmAsset.category} asset managed by ${caasmAsset.dept}. OS: ${caasmAsset.os}.`,
      keyFindings:     Number(caasmAsset.vulnCount) > 0
                         ? `${caasmAsset.vulnCount} open findings (${caasmAsset.critVulns} critical).`
                         : "No open findings.",
      patchStatus:     `Exposure score: ${caasmAsset.exposureScore}. Agent: ${caasmAsset.agentVersion}.`,
      aiInsights:      `${caasmAsset.category} — ${caasmAsset.risk} risk, exposure score ${caasmAsset.exposureScore}. Department: ${caasmAsset.dept}.`,
      aiRecommendation:"Review open findings and ensure all security policies are enforced.",
    } : null);
    if (!asset) return <SettingsNotFound label={assetId && !caasmAsset ? "Loading asset…" : "Asset"} id={id} backHref="/settings" />;
    const critColor = asset.criticality === "Critical" ? RED : asset.criticality === "High" ? AMB : asset.criticality === "Medium" ? BLU : EME;
    const critBg    = asset.criticality === "Critical" ? "#FEF2F2" : asset.criticality === "High" ? "#FFFBEB" : asset.criticality === "Medium" ? "#EFF6FF" : "#ECFDF5";
    const critBd    = asset.criticality === "Critical" ? "#FECACA" : asset.criticality === "High" ? "#FDE68A" : asset.criticality === "Medium" ? "#BFDBFE" : "#A7F3D0";

    return (
      <ObjectProfilePage
        hero={{ id: asset.id, name: asset.name, type: asset.type, owner: asset.owner, status: asset.status, statusOk: asset.status === "active", extra: [{ label: "Env", value: asset.environment }, { label: "Criticality", value: asset.criticality }] }}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Assets", href: "/settings" }, { label: asset.id }]}
        onBack="/settings"
        aiObjectType="asset" aiObjectId={asset.id}
        aiFallback={Array.isArray(asset.aiInsights) ? asset.aiInsights as string[] : [asset.aiInsights as string]}
        riskSection={{ inherent: asset.riskScore, residual: Math.max(10, asset.riskScore - 15), impact: asset.criticality === "Critical" ? 90 : asset.criticality === "High" ? 70 : 50 }}
        description={asset.description}
        related={asset.linkedRisks.map(r => ({ id: r, label: r, type: "Risk", route: `/riskops/risks/${r}` }))}
        timeline={[
          { actor: asset.owner, action: `Asset registered in inventory`, ts: asset.discoveredAt },
          { actor: "System", action: `Last security scan completed`, ts: asset.lastScan },
        ]}
      >
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Asset Details</div>
          <KV k="Type" v={asset.type} />
          <KV k="Sub-type" v={asset.subType} />
          <KV k="Environment" v={asset.environment} />
          <KV k="Location" v={asset.location} />
          <KV k="IP Address" v={asset.ipAddress || "—"} mono />
          <KV k="OS / Platform" v={asset.platform} />
          <KV k="Version" v={asset.version} />
          <KV k="Criticality" v={asset.criticality} />
          <KV k="Data Sensitivity" v={asset.dataSensitivity} />
          <KV k="Last Scan" v={asset.lastScan} />
          <KV k="Discovered" v={asset.discoveredAt} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Criticality", value: asset.criticality, color: critColor, bg: critBg, bd: critBd },
            { label: "Data Sensitivity", value: asset.dataSensitivity, color: asset.dataSensitivity === "Restricted" ? RED : asset.dataSensitivity === "Confidential" ? AMB : BLU, bg: "#EFF6FF", bd: "#BFDBFE" },
            { label: "Open Findings", value: String(asset.openFindings), color: asset.openFindings > 5 ? RED : asset.openFindings > 0 ? AMB : EME, bg: asset.openFindings > 0 ? "#FFFBEB" : "#ECFDF5", bd: asset.openFindings > 0 ? "#FDE68A" : "#A7F3D0" },
            { label: "Exposure Score", value: String((asset as any).exposureScore ?? 0), color: ((asset as any).exposureScore ?? 0) >= 70 ? RED : AMB, bg: "#FFFBEB", bd: "#FDE68A" },
          ].map(k => (
            <div key={k.label} style={{ ...card, padding: "12px 14px", textAlign: "center" as const }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
        {asset.tags.length > 0 && (
          <div style={{ ...card, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 10 }}>Tags</div>
            <Chips items={asset.tags} />
          </div>
        )}
      </ObjectProfilePage>
    );
  }

  // ── ASSET GROUP PROFILE ────────────────────────────────────────────────────
  if (groupMatch) {
    const id = groupMatch[1]!;
    const group = assetGroups.find(g => g.id === id);
    if (!group) return <SettingsNotFound label="Asset Group" id={id} backHref="/settings" />;
    return (
      <ObjectProfilePage
        hero={{ id: group.id, name: group.name, type: group.category, owner: group.owner, status: "active", statusOk: true, modified: group.lastReviewed }}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Asset Groups", href: "/settings" }, { label: group.id }]}
        onBack="/settings"
        aiObjectType="asset-group" aiObjectId={group.id}
        aiFallback={group.aiInsights}
        riskSection={{ inherent: group.riskScore, residual: Math.max(10, group.riskScore - 12), impact: group.impact === "Critical" ? 90 : group.impact === "High" ? 70 : 50 }}
        description={group.description}
      >
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Group Details</div>
          <KV k="Asset Count" v={group.assetCount} />
          <KV k="Category" v={group.category} />
          <KV k="Owner" v={group.owner} />
          <KV k="Impact" v={group.impact} />
          <KV k="Last Reviewed" v={group.lastReviewed} />
        </div>
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 10 }}>Tags</div>
          <Chips items={group.tags} />
        </div>
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 10 }}>Mapped Frameworks</div>
          <Chips items={group.frameworks} color={NAV} bg="#EFF6FF" border="#BFDBFE" />
        </div>
      </ObjectProfilePage>
    );
  }

  // ── AGENT PROFILE ──────────────────────────────────────────────────────────
  if (agentMatch) {
    const id = agentMatch[1]!;
    const agent = allAgents.find(a => a.id === id);
    if (!agent) return <SettingsNotFound label="Agent" id={id} backHref="/settings" />;
    const stOk = agent.status === "online";
    return (
      <ObjectProfilePage
        hero={{ id: agent.id, name: agent.name, type: agent.type, owner: agent.platform, status: agent.status, statusOk: stOk, modified: agent.lastSeen, extra: [{ label: "Version", value: `v${agent.version}` }, { label: "IP", value: agent.ip }] }}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Agents", href: "/settings" }, { label: agent.id }]}
        onBack="/settings"
        aiObjectType="agent" aiObjectId={agent.id}
        aiFallback={agent.aiInsights}
        riskSection={{ inherent: agent.riskScore, residual: Math.max(10, agent.riskScore - 15) }}
      >
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 14 }}>Metrics</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Managed Assets",  value: String(agent.assets),                       color: NAV },
              { label: "Collected Today", value: agent.collectedToday.toLocaleString(),       color: EME },
              { label: "Events (24h)",    value: agent.events24h.toLocaleString(),            color: BLU },
              { label: "Errors (24h)",    value: String(agent.errors24h),                     color: agent.errors24h > 0 ? RED : EME },
            ].map(k => (
              <div key={k.label} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 14 }}>Resource Usage</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
              <span style={{ color: "#374151" }}>CPU</span>
            </div>
            <Bar pct={agent.cpu} danger={agent.cpu > 70} />
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
              <span style={{ color: "#374151" }}>Memory</span>
            </div>
            <Bar pct={agent.mem} danger={agent.mem > 80} />
          </div>
        </div>
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Configuration</div>
          <KV k="IP Address" v={agent.ip} mono />
          <KV k="Install Date" v={agent.installDate} />
          <KV k="Last Seen" v={agent.lastSeen} />
          <KV k="Platform" v={agent.platform} />
          <KV k="Version" v={agent.version} />
        </div>
      </ObjectProfilePage>
    );
  }

  // ── USER PROFILE ──────────────────────────────────────────────────────────
  if (userMatch) {
    const id = userMatch[1]!;
    const user = extendedUsers.find(u => u.id === id);
    if (!user) return <SettingsNotFound label="User" id={id} backHref="/settings" />;
    return (
      <ObjectProfilePage
        hero={{ id: user.id, name: user.name, type: user.role, owner: user.manager, status: user.status, statusOk: user.status === "active", modified: user.lastLogin, extra: [{ label: "Dept", value: user.dept }, { label: "MFA", value: user.mfa ? "✓ Enabled" : "✗ Disabled" }] }}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users", href: "/settings" }, { label: user.id }]}
        onBack="/settings"
        aiObjectType="user" aiObjectId={user.id}
        aiFallback={user.aiInsights}
        riskSection={{ inherent: user.riskScore, residual: Math.max(5, user.riskScore - 10) }}
        description={`${user.name} joined ${user.joinDate}. Based in ${user.location}.`}
        timeline={user.recentActivity.map(a => ({ actor: user.name, action: a, ts: "Recently" }))}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Policy Acknowledgement", value: `${user.policyAck}/${user.totalPolicies}`, color: user.policyAck === user.totalPolicies ? EME : AMB },
            { label: "Open Findings",          value: String(user.openFindings), color: user.openFindings > 5 ? RED : user.openFindings > 0 ? AMB : EME },
            { label: "Managed Assets",         value: String(user.assets), color: NAV },
            { label: "Last Login",             value: user.lastLogin, color: EME },
          ].map(k => (
            <div key={k.label} style={{ ...card, padding: "12px 14px" }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Details</div>
          <KV k="Email" v={user.email} />
          <KV k="Manager" v={user.manager} />
          <KV k="Join Date" v={user.joinDate} />
          <KV k="MFA" v={user.mfa ? "✓ Enabled" : "✗ Disabled"} />
          <KV k="Location" v={user.location} />
        </div>
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 10 }}>Permissions</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
            {user.permissions.map(p => (
              <div key={p} style={{ fontSize: 11, fontWeight: 600, color: NAV, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "5px 10px" }}>{p}</div>
            ))}
          </div>
        </div>
      </ObjectProfilePage>
    );
  }

  // ── USER ROLE PROFILE ──────────────────────────────────────────────────────
  if (roleMatch) {
    const id = roleMatch[1]!;
    const role = userRoles.find(r => r.id === id);
    if (!role) return <SettingsNotFound label="User Role" id={id} backHref="/settings" />;
    return (
      <ObjectProfilePage
        hero={{ id: role.id, name: role.name, type: "User Role", owner: role.createdBy, status: role.riskLevel + " Risk", statusOk: role.riskLevel === "Low" || role.riskLevel === "Medium", modified: role.lastReviewed }}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "User Roles", href: "/settings" }, { label: role.id }]}
        onBack="/settings"
        aiObjectType="user-role" aiObjectId={role.id}
        aiFallback={role.aiInsights}
        riskSection={{ inherent: role.riskLevel === "Critical" ? 85 : role.riskLevel === "High" ? 65 : role.riskLevel === "Medium" ? 45 : 25 }}
        description={role.description}
      >
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 14 }}>Permission Matrix</div>
          {role.permissions.map(p => {
            const lvlC = p.level === "Admin" ? RED : p.level === "Write" ? AMB : p.level === "Read" ? EME : "#9CA3AF";
            const lvlB = p.level === "Admin" ? "#FEF2F2" : p.level === "Write" ? "#FFFBEB" : p.level === "Read" ? "#ECFDF5" : "#F9FAFB";
            return (
              <div key={p.module} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F9F8F6" }}>
                <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{p.module}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: lvlC, background: lvlB, borderRadius: 4, padding: "2px 8px" }}>{p.level}</span>
              </div>
            );
          })}
        </div>
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 12 }}>Role Metadata</div>
          <KV k="Users Assigned" v={role.users} />
          <KV k="Risk Level" v={role.riskLevel} />
          <KV k="Created By" v={role.createdBy} />
          <KV k="Last Reviewed" v={role.lastReviewed} />
        </div>
      </ObjectProfilePage>
    );
  }

  return <div style={{ padding: 32, color: "#9CA3AF" }}>Not found.</div>;
}
