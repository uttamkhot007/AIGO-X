import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiRisk, type ApiControl, type ApiTicket, type ApiDsar } from "@/lib/api";

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function useDashboardKpis() {
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => api.dashboard.kpis(),
    staleTime: 30_000,
  });
}

export function useDashboardActivity() {
  return useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: () => api.dashboard.activity(),
    staleTime: 30_000,
  });
}

// ── Risks ─────────────────────────────────────────────────────────────────────

export function useRisks() {
  return useQuery({
    queryKey: ["risks"],
    queryFn: () => api.risks.list(),
    staleTime: 30_000,
  });
}

export function useRisk(id: string | number | null) {
  return useQuery({
    queryKey: ["risks", id],
    queryFn: () => api.risks.get(id!),
    enabled: id != null,
    staleTime: 30_000,
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiRisk>) => api.risks.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["risks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Partial<ApiRisk> }) => api.risks.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["risks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => api.risks.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["risks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useRiskVendors() {
  return useQuery({
    queryKey: ["risks", "vendors"],
    queryFn: () => api.risks.vendors(),
    staleTime: 60_000,
  });
}

export function useRiskAppetite() {
  return useQuery({
    queryKey: ["risks", "appetite"],
    queryFn: () => api.risks.appetite(),
    staleTime: 60_000,
  });
}

export function useRiskTreatments() {
  return useQuery({
    queryKey: ["risks", "treatments"],
    queryFn: () => api.risks.treatments(),
    staleTime: 60_000,
  });
}

// ── Compliance ────────────────────────────────────────────────────────────────

export function useComplianceFrameworks() {
  return useQuery({
    queryKey: ["compliance", "frameworks"],
    queryFn: () => api.compliance.frameworks(),
    staleTime: 60_000,
  });
}

export function useComplianceControls(frameworks?: string[]) {
  // frameworks === undefined  → fetch all (super-admin own-tenant bypass)
  // frameworks === []         → no licensed frameworks; return empty immediately (deny-by-default)
  // frameworks === [...]      → fetch filtered by those names
  const isEmpty = Array.isArray(frameworks) && frameworks.length === 0;
  return useQuery({
    queryKey: ["compliance", "controls", frameworks ?? "all"],
    queryFn: () => isEmpty ? [] : api.compliance.controls(frameworks),
    enabled: !isEmpty,
    staleTime: 30_000,
  });
}

export function useCreateControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiControl>) => api.compliance.createControl(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance"] }); },
  });
}

export function useUpdateControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Partial<ApiControl> }) =>
      api.compliance.updateControl(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance"] }); },
  });
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export function useTickets() {
  return useQuery({
    queryKey: ["tickets"],
    queryFn: () => api.tickets.list(),
    staleTime: 30_000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiTicket>) => api.tickets.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ApiTicket> }) => api.tickets.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tickets.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
}

// ── Privacy / DSARs ───────────────────────────────────────────────────────────

export function useDsars() {
  return useQuery({
    queryKey: ["privacy", "dsars"],
    queryFn: () => api.privacy.dsars(),
    staleTime: 30_000,
  });
}

export function usePrivacyRopa() {
  return useQuery({ queryKey: ["privacy","ropa"], queryFn: () => api.privacy.ropa(), staleTime: 60_000, retry: 1 });
}
export function usePrivacyDpias() {
  return useQuery({ queryKey: ["privacy","dpias"], queryFn: () => api.privacy.dpias(), staleTime: 60_000, retry: 1 });
}
export function usePrivacyNotices() {
  return useQuery({ queryKey: ["privacy","notices"], queryFn: () => api.privacy.notices(), staleTime: 60_000, retry: 1 });
}
export function usePrivacyConsent() {
  return useQuery({ queryKey: ["privacy","consent"], queryFn: () => api.privacy.consent(), staleTime: 60_000, retry: 1 });
}
export function usePrivacyDpas() {
  return useQuery({ queryKey: ["privacy","dpas"], queryFn: () => api.privacy.dpas(), staleTime: 60_000, retry: 1 });
}
export function usePrivacyRegs() {
  return useQuery({ queryKey: ["privacy","regs"], queryFn: () => api.privacy.regs(), staleTime: 120_000, retry: 1 });
}

export function usePrivacyScore() {
  return useQuery({
    queryKey: ["privacy", "score"],
    queryFn: () => api.privacy.score(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCreateDsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiDsar>) => api.privacy.createDsar(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["privacy"] }); },
  });
}

export function useUpdateDsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ApiDsar> }) => api.privacy.updateDsar(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["privacy"] }); },
  });
}

// ── CSPM (Cloud Security) ──────────────────────────────────────────────────────

export function useCspmStats() {
  return useQuery({ queryKey: ["cspm", "stats"], queryFn: () => api.cspm.stats(), staleTime: 30_000 });
}

export function useCspmResources(provider?: string) {
  return useQuery({ queryKey: ["cspm", "resources", provider], queryFn: () => api.cspm.resources(provider), staleTime: 30_000 });
}

export function useCspmFindings(params?: { severity?: string; status?: string; provider?: string }) {
  return useQuery({ queryKey: ["cspm", "findings", params], queryFn: () => api.cspm.findings(params), staleTime: 30_000 });
}

export function useCspmDrift() {
  return useQuery({ queryKey: ["cspm", "drift"], queryFn: () => api.cspm.drift(), staleTime: 60_000 });
}

export function useUpdateCspmFindingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.cspm.updateFindingStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cspm"] }); },
  });
}

// ── CAASM (Asset Management) ───────────────────────────────────────────────────

export function useCaasmStats() {
  return useQuery({ queryKey: ["caasm", "stats"], queryFn: () => api.caasm.stats(), staleTime: 30_000 });
}

export function useCaasmAssets(params?: { page?: number; pageSize?: number; search?: string; category?: string }) {
  return useQuery({
    queryKey: ["caasm", "assets", params],
    queryFn: () => api.caasm.assets(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
