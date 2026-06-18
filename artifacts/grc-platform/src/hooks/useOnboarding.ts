import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
function api(path: string) {
  return `${base.replace("/grc-platform", "")}/api${path}`;
}

export interface OnboardingSession {
  id: number;
  tenantId: number;
  currentStage: number;
  completed: boolean;
  stagesData: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export function useOnboarding() {
  const { user, clearAuth } = useAuth();
  const qc = useQueryClient();
  const token = () => localStorage.getItem("grc_token") ?? "";

  const query = useQuery<OnboardingSession>({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const res = await fetch(api("/onboarding"), {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.status === 401) {
        clearAuth();
        throw new Error("Session expired — please sign in again");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!user,
    staleTime: 60_000,
    retry: (count, err) => {
      if (err instanceof Error && err.message.startsWith("Session expired")) return false;
      return count < 1;
    },
    retryDelay: 2000,
  });

  const saveStage = useMutation({
    mutationFn: async ({ stage, data }: { stage: number; data: Record<string, unknown> }) => {
      const res = await fetch(api(`/onboarding/stage/${stage}`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(data),
      });
      if (res.status === 401) {
        clearAuth();
        throw new Error("Session expired — please sign in again");
      }
      if (!res.ok) throw new Error("Save failed");
      return res.json() as Promise<OnboardingSession>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["onboarding"], data);
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const res = await fetch(api("/onboarding/complete"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.status === 401) {
        clearAuth();
        throw new Error("Session expired — please sign in again");
      }
      if (!res.ok) throw new Error("Complete failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });

  const completionPct = query.data
    ? query.data.completed
      ? 100
      : Math.round((Math.max(0, (query.data.currentStage - 1)) / 13) * 100)
    : 0;

  return { ...query, saveStage, complete, completionPct };
}
