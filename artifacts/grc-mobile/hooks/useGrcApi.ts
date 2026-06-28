import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DOMAIN = process.env["EXPO_PUBLIC_DOMAIN"] ?? "";
const API_BASE = `https://${DOMAIN}`;

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem("grc_token");
  return SecureStore.getItemAsync("grc_token");
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface KpiItem {
  id: string;
  label: string;
  value: number;
  unit: string;
  delta: string;
  up: boolean;
}

export interface DashboardKPIsResponse {
  kpis: KpiItem[];
  meta: {
    grcScore: number;
    openRisks: number;
    criticalRisks: number;
    coverage: number;
    activeAudits: number;
    privacyScore: number;
    openTickets: number;
    totalUsers: number;
  };
}

export interface ActivityItem {
  id: string;
  type: string;
  icon: string;
  title: string;
  detail: string;
  badge: string;
  badgeColor: string;
  actor: string;
  ts: string;
}

export interface FrameworkItem {
  id: string;
  name: string;
  pct: number;
  color: string;
  controlsCount: number;
  implemented: number;
}

const FEATHER_ICON_MAP: Record<string, string> = {
  "shield-alert": "shield",
  "shield": "shield",
  "ticket": "tag",
  "user-check": "user-check",
  "cloud-alert": "cloud",
  "cloud": "cloud",
  "clipboard-list": "clipboard",
  "clipboard": "clipboard",
  "file-text": "file-text",
  "alert-triangle": "alert-triangle",
  "check-circle": "check-circle",
  "users": "users",
  "bar-chart-2": "bar-chart-2",
  "activity": "activity",
  "lock": "lock",
};

export function toFeatherIcon(icon: string): string {
  return FEATHER_ICON_MAP[icon] ?? "circle";
}

const BADGE_TO_STATUS = (badge: string): "pending" | "in_progress" | "done" | "overdue" | "open" => {
  const b = badge.toLowerCase();
  if (b === "overdue") return "overdue";
  if (b === "in progress") return "in_progress";
  if (b === "completed" || b === "implemented" || b === "active") return "done";
  if (b === "planned" || b === "draft") return "pending";
  return "open";
};

export { BADGE_TO_STATUS };

export function useDashboardKPIs() {
  return useQuery<DashboardKPIsResponse>({
    queryKey: ["dashboard-kpis"],
    queryFn: () => apiFetch<DashboardKPIsResponse>("/api/dashboard/kpis"),
    staleTime: 60_000,
  });
}

export function useDashboardActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ["dashboard-activity"],
    queryFn: () => apiFetch<ActivityItem[]>("/api/dashboard/activity"),
    staleTime: 60_000,
  });
}

export function useComplianceFrameworks() {
  return useQuery<FrameworkItem[]>({
    queryKey: ["compliance-frameworks"],
    queryFn: () => apiFetch<FrameworkItem[]>("/api/compliance/frameworks"),
    staleTime: 120_000,
  });
}
