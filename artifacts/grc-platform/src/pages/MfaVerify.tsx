import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useVerifyMfa } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export default function MfaVerify() {
  const [, navigate] = useLocation();
  const { setToken } = useAuth();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));
  const verifyMfa = useVerifyMfa();

  const tempToken = sessionStorage.getItem("grc_mfa_challenge");

  useEffect(() => {
    if (!tempToken) navigate("/login");
    else refs[0].current?.focus();
  }, []);

  function handleDigit(i: number, val: string) {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    if (ch && i < 5) refs[i + 1].current?.focus();
    if (next.every(d => d !== "")) submit(next.join(""));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      submit(pasted);
    }
  }

  function submit(code: string) {
    if (!tempToken) return;
    setError("");
    verifyMfa.mutate(
      { data: { token: code, tempToken } },
      {
        onSuccess(data) {
          sessionStorage.removeItem("grc_mfa_challenge");
          setToken(data.token, data.user?.name ?? undefined);
          navigate("/");
        },
        onError() {
          setError("Invalid or expired code. Check your authenticator app and try again.");
          setDigits(["", "", "", "", "", ""]);
          setTimeout(() => refs[0].current?.focus(), 50);
        },
      },
    );
  }

  const NAV = "#1E3A5F";
  const EME = "#065F46";

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
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: "#EFF6FF", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>🔐</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: NAV, margin: "0 0 6px", letterSpacing: "-0.5px" }}>Two-Factor Authentication</h2>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0, fontWeight: 500 }}>Enter the 6-digit code from your authenticator app</p>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }} onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={refs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                style={{
                  width: 46, height: 54, textAlign: "center", fontSize: 22, fontWeight: 700,
                  border: `2px solid ${d ? NAV : "rgba(255,255,255,0.1)"}`, borderRadius: 10, outline: "none",
                  color: NAV, background: d ? "#EFF6FF" : "var(--card)",
                  fontFamily: "'Plus Jakarta Sans', monospace", transition: "all 0.15s",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "#93C5FD")}
                onBlur={e => (e.currentTarget.style.borderColor = digits[i] ? NAV : "rgba(255,255,255,0.1)")}
              />
            ))}
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991B1B", fontWeight: 600, marginBottom: 16, textAlign: "center" }}>
              ⚠ {error}
            </div>
          )}

          {verifyMfa.isPending && (
            <div style={{ textAlign: "center", fontSize: 13, color: "#9CA3AF", marginBottom: 12 }}>
              Verifying…
            </div>
          )}

          <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button
              onClick={() => navigate("/login")}
              style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "block", margin: "0 auto" }}
            >
              ← Back to sign in
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#9CA3AF" }}>
          Your session challenge expires in 10 minutes
        </div>
      </div>
    </div>
  );
}
