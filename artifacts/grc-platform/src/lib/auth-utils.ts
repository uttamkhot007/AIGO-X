export interface DecodedToken {
  userId: number;
  email: string;
  role: string;
  tenantId: number;
  iat?: number;
  exp?: number;
}

export function decodeJwt(token: string): DecodedToken | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded as DecodedToken;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem("grc_token");
}

export function getCurrentUser(): DecodedToken | null {
  const token = getStoredToken();
  if (!token) return null;
  const decoded = decodeJwt(token);
  if (!decoded) return null;
  if (decoded.exp && decoded.exp * 1000 < Date.now()) {
    localStorage.removeItem("grc_token");
    return null;
  }
  return decoded;
}

export function getInitials(email: string): string {
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin:         "Super Admin",
    tenant_admin:        "Tenant Admin",
    board_management:    "Board & Sr Mgmt",
    ethics_officer:      "Ethics Officer",
    ciso:                "CISO",
    cro:                 "CRO",
    cdpo:                "CDPO",
    chro:                "CHRO",
    internal_auditor:    "Internal Auditor",
    external_auditor:    "External Auditor",
    management:          "Management",
    security_analyst:    "Security Analyst",
    risk_analyst:        "Risk Analyst",
    compliance_analyst:  "Compliance Analyst",
    privacy_analyst:     "Privacy Analyst",
    it_admin:            "IT Admin",
    vendor:              "Vendor",
    employee:            "Employee",
    service_desk_tech:   "Service Desk Tech",
    cab_member:          "CAB Member",
    admin:               "Admin",
  };
  return labels[role] ?? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getRoleBadgeStyle(role: string): { bg: string; color: string; border: string } {
  const executiveRoles  = ["ciso", "cro", "cdpo", "chro", "management", "tenant_admin", "super_admin", "admin", "board_management"];
  const analystRoles    = ["security_analyst", "risk_analyst", "compliance_analyst", "privacy_analyst", "it_admin", "internal_auditor"];
  const auditRoles      = ["external_auditor"];
  const specialRoles    = ["ethics_officer", "service_desk_tech", "cab_member"];
  const portalRoles     = ["vendor", "employee"];

  if (role === "super_admin") return { bg: "#F5F3FF", color: "#7C3AED", border: "#C4B5FD" };
  if (executiveRoles.includes(role))  return { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };
  if (analystRoles.includes(role))    return { bg: "#F0FDF4", color: "#065F46", border: "#A7F3D0" };
  if (auditRoles.includes(role))      return { bg: "#F9FAFB", color: "#374151", border: "#D1D5DB" };
  if (specialRoles.includes(role))    return { bg: "#ECFEFF", color: "#0891B2", border: "#A5F3FC" };
  if (portalRoles.includes(role))     return { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" };
  return { bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" };
}
