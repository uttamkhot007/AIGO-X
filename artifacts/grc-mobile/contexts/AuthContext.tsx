import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

export type UserRole =
  | "admin"
  | "super_admin"
  | "ciso"
  | "cro"
  | "chro"
  | "employee"
  | "vendor"
  | "auditor"
  | "analyst";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  tenantId: number;
  avatar?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  activeRole: UserRole;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DOMAIN = process.env["EXPO_PUBLIC_DOMAIN"];
if (!DOMAIN || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(DOMAIN)) {
  throw new Error(
    "EXPO_PUBLIC_DOMAIN is not set or is invalid. Configure a real API domain " +
      "(e.g. api.example.com) before building the app.",
  );
}
const API_BASE = `https://${DOMAIN}`;

const TOKEN_KEY = "grc_token";
const USER_KEY = "grc_user";

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function secureDel(key: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

function jwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          secureGet(TOKEN_KEY),
          secureGet(USER_KEY),
        ]);
        if (t && u) {
          const exp = jwtExp(t);
          const nowSec = Math.floor(Date.now() / 1000);
          if (exp !== null && exp <= nowSec) {
            await Promise.all([secureDel(TOKEN_KEY), secureDel(USER_KEY)]);
          } else {
            setToken(t);
            setUser(JSON.parse(u) as AuthUser);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Invalid credentials");
    }
    const data = (await res.json()) as { user: AuthUser; token: string };
    setUser(data.user);
    setToken(data.token);
    await Promise.all([
      secureSet(TOKEN_KEY, data.token),
      secureSet(USER_KEY, JSON.stringify(data.user)),
    ]);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    await Promise.all([secureDel(TOKEN_KEY), secureDel(USER_KEY)]);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
      const data = (await res.json()) as { token: string; role?: string };
      setToken(data.token);
      await secureSet(TOKEN_KEY, data.token);
      if (data.role && user && data.role !== user.role) {
        const refreshed = { ...user, role: data.role as UserRole };
        setUser(refreshed);
        await secureSet(USER_KEY, JSON.stringify(refreshed));
      }
    } catch {
      await logout();
    }
  }, [token, user, logout]);

  useEffect(() => {
    if (!token) return;
    const exp = jwtExp(token);
    if (!exp) return;
    const msUntilExpiry = exp * 1000 - Date.now();
    const msUntilRefresh = Math.max(msUntilExpiry - 5 * 60 * 1000, 60_000);
    const handle = setTimeout(() => { void refresh(); }, msUntilRefresh);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeRole: UserRole = user?.role ?? "employee";

  return (
    <AuthContext.Provider value={{ user, token, activeRole, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
