import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { getCurrentUser, getInitials, getRoleLabel, type DecodedToken } from "@/lib/auth-utils";

interface AuthUser {
  userId: number;
  email: string;
  role: string;
  roleLabel: string;
  tenantId: number;
  initials: string;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setToken: (token: string, name?: string) => void;
  clearAuth: () => void;
  refresh: () => void;
  setDemoRole: (role: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  setToken: () => {},
  clearAuth: () => {},
  refresh: () => {},
  setDemoRole: () => {},
});

function buildUser(decoded: DecodedToken, name?: string): AuthUser {
  const demoRole = localStorage.getItem("grc_demo_role");
  const effectiveRole = demoRole ?? decoded.role;
  return {
    userId: decoded.userId,
    email: decoded.email,
    role: effectiveRole,
    roleLabel: getRoleLabel(effectiveRole),
    tenantId: decoded.tenantId,
    initials: getInitials(decoded.email),
    name,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const decoded = getCurrentUser();
    if (!decoded) return null;
    const name = localStorage.getItem("grc_user_name") ?? undefined;
    return buildUser(decoded, name);
  });

  const refresh = useCallback(() => {
    const decoded = getCurrentUser();
    if (!decoded) { setUser(null); return; }
    const name = localStorage.getItem("grc_user_name") ?? undefined;
    setUser(buildUser(decoded, name));
  }, []);

  const setToken = useCallback((token: string, name?: string) => {
    localStorage.setItem("grc_token", token);
    if (name) localStorage.setItem("grc_user_name", name);
    const decoded = getCurrentUser();
    if (decoded) setUser(buildUser(decoded, name));
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem("grc_token");
    localStorage.removeItem("grc_user_name");
    localStorage.removeItem("grc_demo_role");
    localStorage.removeItem("grc_view_tenant");
    setUser(null);
  }, []);

  const setDemoRole = useCallback((role: string) => {
    localStorage.setItem("grc_demo_role", role);
    const decoded = getCurrentUser();
    if (decoded) {
      const name = localStorage.getItem("grc_user_name") ?? undefined;
      setUser(buildUser(decoded, name));
    }
  }, []);

  useEffect(() => {
    const handle = () => refresh();
    window.addEventListener("storage", handle);
    return () => window.removeEventListener("storage", handle);
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, setToken, clearAuth, refresh, setDemoRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
