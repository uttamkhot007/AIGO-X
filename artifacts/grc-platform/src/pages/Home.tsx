import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import Dashboard from "@/pages/Dashboard";

const NAV = "rgb(147,197,253)";
const EME = "#34D399";
const BG  = "rgb(9,12,18)";

const ADMIN_ROLES = new Set(["super_admin", "ciso", "tenant_admin"]);

// ── Onboarding setup-wizard banner (dismissable) ──────────────────────────────
function SetupBanner({ pct, onOpen }: { pct: number; onOpen: () => void }) {
  if (pct >= 100) return null;
  return (
    <div className="setup-banner" style={{
      border: "1px solid rgba(147,197,253,0.2)",
      borderRadius: 10, padding: "14px 20px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{ fontSize: 28, lineHeight: 1 }}>🏗</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 3 }}>
          ISMS Setup — {pct}% complete
        </div>
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.8)" }}>
          {pct === 0
            ? "Walk through 13 stages to configure your GRC environment, risk methodology, frameworks, and policies."
            : `You've completed ${Math.round(pct / (100 / 13))} of 13 stages. Continue when ready — your data is auto-saved.`}
        </div>
        <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", maxWidth: 280 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: EME, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>
      <button onClick={onOpen} style={{
        padding: "8px 18px", borderRadius: 8,
        background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)",
        color: EME, fontSize: 12, fontWeight: 700, cursor: "pointer",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {pct === 0 ? "Start Setup →" : "Continue →"}
      </button>
    </div>
  );
}

// ── Admin Home wraps Dashboard + optional setup banner ────────────────────────
function AdminHome() {
  const { data: session, isLoading, isError, completionPct } = useOnboarding();
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const pct = completionPct;
  const isComplete = session?.completed ?? false;

  const handleOpenWizard = () => navigate(`${base}/onboarding`);

  return (
    <div className="admin-home-wrap" style={{ background: BG, minHeight: "100%", fontFamily: "'Inter',sans-serif" }}>
      {/* Thin setup banner — only visible while setup is incomplete; never blocks */}
      {!isLoading && !isError && !isComplete && (
        <div style={{ padding: "16px 24px 0" }}>
          <SetupBanner pct={pct} onOpen={handleOpenWizard} />
        </div>
      )}

      {/* Dashboard is ALWAYS shown — never gated on onboarding loading */}
      <Dashboard />
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  if (!user) return null;
  if (ADMIN_ROLES.has(user.role)) return <AdminHome />;
  return <Dashboard />;
}
