import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

const NAV = "#1E3A5F";
const EME = "#065F46";

function Field({ label, type = "text", value, onChange, placeholder }: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", letterSpacing: "0.3px", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={type === "password" ? "new-password" : type === "email" ? "email" : "name"}
        style={{
          width: "100%", border: `1px solid ${focused ? "#93C5FD" : "rgba(255,255,255,0.1)"}`, borderRadius: 8,
          padding: "10px 14px", fontSize: 13, color: "var(--foreground)", background: "var(--card)",
          outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const { setToken } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email.toLowerCase().trim(), password }),
      });

      const data = (await res.json()) as { token?: string; user?: { name?: string }; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }

      if (data.token) {
        setToken(data.token, data.user?.name ?? name);
        navigate("/");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #F9F8F6 0%, #EFF6FF 50%, #F0FDF4 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 20,
    }}>
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 600, height: 600, background: "radial-gradient(circle, rgba(30,58,95,0.06) 0%, transparent 70%)", top: -200, right: -200, borderRadius: "50%" }} />
        <div style={{ position: "absolute", width: 500, height: 500, background: "radial-gradient(circle, rgba(6,95,70,0.05) 0%, transparent 70%)", bottom: -100, left: -100, borderRadius: "50%" }} />
      </div>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, background: `linear-gradient(135deg, ${NAV}, ${EME})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", boxShadow: "0 4px 16px rgba(30,58,95,0.3)" }}>D</div>
            <span style={{ fontSize: 22, fontWeight: 800, color: NAV, letterSpacing: "-0.5px" }}>AIGO-X</span>
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500, letterSpacing: "0.3px" }}>Enterprise GRC Platform · Platinum Edition</div>
        </div>

        <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid #E5E7EB", boxShadow: "0 20px 60px rgba(30,58,95,0.1), 0 4px 16px rgba(0,0,0,0.06)", padding: "32px 36px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAV, margin: "0 0 6px", letterSpacing: "-0.5px" }}>Create account</h2>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 24px", fontWeight: 500 }}>Join your organisation's security platform</p>

          <form onSubmit={e => { void handleSubmit(e); }}>
            <Field label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
            <Field label="Work Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />
            <Field label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" />

            {error && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991B1B", fontWeight: 600, marginBottom: 16 }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: "100%", background: loading ? "#9CA3AF" : `linear-gradient(135deg, ${NAV}, ${EME})`, border: "none", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, color: "white", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(30,58,95,0.3)" }}>
              {loading ? "Creating account…" : "Create Account →"}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: "center", fontSize: 12 }}>
            <span style={{ color: "#9CA3AF" }}>Already have an account? </span>
            <button onClick={() => navigate("/login")} style={{ background: "none", border: "none", color: NAV, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Sign in
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#9CA3AF" }}>
          New accounts are provisioned as Analyst role · Contact your admin to change
        </div>
      </div>
    </div>
  );
}
