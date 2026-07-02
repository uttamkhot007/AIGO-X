import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/api";

// ── SSO error code → friendly messages ───────────────────────────────────────

interface SsoErrorInfo {
  title: string;
  detail: string;
  canRetry: boolean;
}

const SSO_ERROR_INFO: Record<string, SsoErrorInfo> = {
  discovery_timeout: {
    title: "Identity Provider Unreachable",
    detail: "Your identity provider did not respond in time. It may be temporarily unavailable. Please wait a few minutes and try again.",
    canRetry: true,
  },
  token_exchange_timeout: {
    title: "Token Exchange Timeout",
    detail: "The identity provider took too long during the token exchange step. This is usually transient — please try again.",
    canRetry: true,
  },
  token_exchange_rejected: {
    title: "Sign-In Rejected by Identity Provider",
    detail: "The identity provider rejected the token request. This usually means the SSO client ID or secret is incorrect. Contact your administrator to verify the SSO configuration.",
    canRetry: false,
  },
  idp_unreachable: {
    title: "Identity Provider Unreachable",
    detail: "The identity provider could not be reached. Please try again or contact your administrator if the problem persists.",
    canRetry: true,
  },
  sso_callback_failed: {
    title: "Sign-In Failed",
    detail: "An unexpected error occurred while completing SSO sign-in. Please try again.",
    canRetry: true,
  },
  sso_error: {
    title: "SSO Unavailable",
    detail: "An unexpected SSO error occurred. Please try again or contact your administrator.",
    canRetry: true,
  },
  sso_not_configured: {
    title: "SSO Not Configured",
    detail: "Single sign-on is not fully configured for your organisation. Contact your administrator.",
    canRetry: false,
  },
  sso_misconfigured: {
    title: "SSO Misconfigured",
    detail: "The SSO configuration is incomplete. Contact your administrator.",
    canRetry: false,
  },
  missing_code: {
    title: "Incomplete Response",
    detail: "The identity provider did not return the expected authorisation code. Please try signing in again.",
    canRetry: true,
  },
  invalid_state: {
    title: "Session Expired",
    detail: "Your SSO session expired or the request appears to be a replay. Please start the sign-in flow again.",
    canRetry: true,
  },
  no_email_claim: {
    title: "Missing Email Claim",
    detail: "Your identity provider did not return an email address. Ensure your IdP is configured to include the email claim and try again.",
    canRetry: false,
  },
  provisioning_conflict: {
    title: "Account Conflict",
    detail: "This email address is already registered under a different organisation. Contact your administrator to resolve this.",
    canRetry: false,
  },
  unsupported_provider: {
    title: "Unsupported Provider",
    detail: "This SSO provider type is not supported. Contact your administrator.",
    canRetry: false,
  },
  no_saml_response: {
    title: "No SAML Response",
    detail: "No SAML assertion was received from the identity provider. Please try again.",
    canRetry: true,
  },
  invalid_saml_assertion: {
    title: "Invalid SAML Assertion",
    detail: "The SAML assertion from the identity provider is missing required fields. Contact your administrator.",
    canRetry: false,
  },
  saml_validation_failed: {
    title: "SAML Validation Failed",
    detail: "The identity provider's SAML response could not be validated. Please try again or contact your administrator.",
    canRetry: true,
  },
  access_denied: {
    title: "Access Denied",
    detail: "Access was denied by the identity provider. Check your account permissions.",
    canRetry: false,
  },
  login_required: {
    title: "Session Expired",
    detail: "Your session has expired. Please sign in again.",
    canRetry: true,
  },
};

function resolveSsoError(raw: string): SsoErrorInfo {
  const key = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return (
    SSO_ERROR_INFO[key] ??
    SSO_ERROR_INFO[raw] ?? {
      title: "SSO Sign-In Failed",
      detail: raw,
      canRetry: true,
    }
  );
}

export default function SsoCallback() {
  const [, navigate] = useLocation();
  const { setToken } = useAuth();
  const [errorInfo, setErrorInfo] = useState<SsoErrorInfo | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      // URLSearchParams.get() already percent-decodes; no extra decodeURIComponent needed
      setErrorInfo(resolveSsoError(err));
      return;
    }

    if (token) {
      // URLSearchParams.get() already percent-decodes; no extra decodeURIComponent needed
      setToken(token);
      navigate("/");
      return;
    }

    setErrorInfo({
      title: "No Token Received",
      detail: "The identity provider completed the flow but no token was returned. Please try again.",
      canRetry: true,
    });
  }, [navigate, setToken]);

  function handleRetry() {
    const storedTenantId = sessionStorage.getItem("sso_tenant_id") ?? "1";
    window.location.href = getApiUrl(`/auth/sso/initiate/${storedTenantId}`);
  }

  function handleBackToLogin() {
    navigate("/login");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#050B1A",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        textAlign: "center",
        padding: "40px",
        background: "rgba(8,18,48,0.96)",
        border: "1px solid rgba(60,100,180,0.2)",
        borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        maxWidth: 400,
        width: "90%",
      }}>
        {errorInfo ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#FCA5A5", marginBottom: 8, letterSpacing: "-0.3px" }}>
              {errorInfo.title}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 24, lineHeight: 1.6 }}>
              {errorInfo.detail}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {errorInfo.canRetry && (
                <button
                  onClick={handleRetry}
                  style={{
                    width: "100%",
                    padding: "11px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "-0.1px",
                  }}
                >
                  🔄 Try Again
                </button>
              )}
              <button
                onClick={handleBackToLogin}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: 10,
                  border: "1px solid rgba(147,197,253,0.2)",
                  background: "rgba(15,30,60,0.8)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ← Back to Login
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(255,255,255,0.2)",
              borderTopColor: "#93C5FD",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 20px",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8 }}>Completing Sign-In</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Verifying your identity…</div>
          </>
        )}
      </div>
    </div>
  );
}
