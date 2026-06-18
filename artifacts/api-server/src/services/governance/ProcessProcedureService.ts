import { db } from "../../lib/db";
import { eq, and } from "drizzle-orm";
import { governanceProcessesTable, governanceProceduresTable } from "@workspace/db";

export type ProcessStatus = "active" | "in-review" | "draft";
export type MaturityLevel = "Initial" | "Repeatable" | "Defined" | "Managed" | "Optimising" | "Optimized";
export type ImpactLevel   = "Critical" | "High" | "Medium" | "Low";

export interface ProcessEntry {
  id: string; name: string; owner: string; category: string;
  steps: number; linked: string; status: ProcessStatus; maturity: MaturityLevel;
  riskScore: number; description: string; kpis: (string | Record<string, string>)[];
  aiInsights: string[]; impact: ImpactLevel; createdAt: string; updatedAt: string;
}

export interface ProcedureEntry {
  id: string; name: string; process: string; owner: string;
  version: string; status: ProcessStatus; pages: number; riskScore: number;
  lastTested: string; description: string; steps: string[];
  aiInsights: string[]; impact: ImpactLevel; createdAt: string; updatedAt: string;
}

function mapProcess(row: typeof governanceProcessesTable.$inferSelect): ProcessEntry {
  return {
    id:          row.processId,
    name:        row.name,
    owner:       row.owner,
    category:    row.category,
    steps:       row.steps,
    linked:      row.linked,
    status:      row.status as ProcessStatus,
    maturity:    row.maturity as MaturityLevel,
    riskScore:   row.riskScore,
    description: row.description,
    kpis:        Array.isArray(row.kpis)       ? (row.kpis as ProcessEntry["kpis"])       : [],
    aiInsights:  Array.isArray(row.aiInsights) ? (row.aiInsights as string[])             : [],
    impact:      row.impact as ImpactLevel,
    createdAt:   row.createdAt.toISOString().slice(0, 10),
    updatedAt:   row.updatedAt.toISOString().slice(0, 10),
  };
}

function mapProcedure(row: typeof governanceProceduresTable.$inferSelect): ProcedureEntry {
  return {
    id:          row.procedureId,
    name:        row.name,
    process:     row.process,
    owner:       row.owner,
    version:     row.version,
    status:      row.status as ProcessStatus,
    pages:       row.pages,
    riskScore:   row.riskScore,
    lastTested:  row.lastTested,
    description: row.description,
    steps:       Array.isArray(row.steps)      ? (row.steps as string[])      : [],
    aiInsights:  Array.isArray(row.aiInsights) ? (row.aiInsights as string[]) : [],
    impact:      row.impact as ImpactLevel,
    createdAt:   row.createdAt.toISOString().slice(0, 10),
    updatedAt:   row.updatedAt.toISOString().slice(0, 10),
  };
}

export const processService = {
  async getProcesses(tenantId: number, filters?: { category?: string; status?: string }): Promise<ProcessEntry[]> {
    let rows = await db.select()
      .from(governanceProcessesTable)
      .where(eq(governanceProcessesTable.tenantId, tenantId));
    if (filters?.category && filters.category !== "All")
      rows = rows.filter(r => r.category === filters.category);
    if (filters?.status)
      rows = rows.filter(r => r.status === filters.status);
    return rows.map(mapProcess);
  },

  async getProcess(tenantId: number, id: string): Promise<ProcessEntry | undefined> {
    const [row] = await db.select()
      .from(governanceProcessesTable)
      .where(and(
        eq(governanceProcessesTable.tenantId,  tenantId),
        eq(governanceProcessesTable.processId, id),
      ))
      .limit(1);
    return row ? mapProcess(row) : undefined;
  },

  async createProcess(tenantId: number, data: {
    name: string; owner: string; category: string;
    description?: string; steps?: number; linked?: string;
    maturity?: MaturityLevel; impact?: ImpactLevel;
  }): Promise<ProcessEntry> {
    const existing = await db.select({ id: governanceProcessesTable.id })
      .from(governanceProcessesTable)
      .where(eq(governanceProcessesTable.tenantId, tenantId));
    const processId = `PRC-${String(existing.length + 1).padStart(3, "0")}`;
    const [row] = await db.insert(governanceProcessesTable).values({
      tenantId,
      processId,
      name:        data.name,
      owner:       data.owner,
      category:    data.category,
      steps:       data.steps       ?? 1,
      linked:      data.linked      ?? "",
      status:      "draft",
      maturity:    data.maturity    ?? "Initial",
      riskScore:   50,
      description: data.description ?? "",
      kpis:        [],
      aiInsights:  [],
      impact:      data.impact      ?? "Medium",
    }).returning();
    return mapProcess(row!);
  },

  async updateProcess(
    tenantId: number,
    id:       string,
    data:     Partial<Pick<ProcessEntry, "name"|"owner"|"category"|"description"|"steps"|"linked"|"maturity"|"impact"|"status">>,
  ): Promise<ProcessEntry | undefined> {
    const [row] = await db.update(governanceProcessesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(governanceProcessesTable.tenantId,  tenantId),
        eq(governanceProcessesTable.processId, id),
      ))
      .returning();
    return row ? mapProcess(row) : undefined;
  },

  async deleteProcess(tenantId: number, id: string): Promise<boolean> {
    const result = await db.delete(governanceProcessesTable)
      .where(and(
        eq(governanceProcessesTable.tenantId,  tenantId),
        eq(governanceProcessesTable.processId, id),
      ));
    return (result.rowCount ?? 0) > 0;
  },
};

export const procedureService = {
  async getProcedures(tenantId: number, filters?: { processId?: string; status?: string }): Promise<ProcedureEntry[]> {
    let rows = await db.select()
      .from(governanceProceduresTable)
      .where(eq(governanceProceduresTable.tenantId, tenantId));
    if (filters?.processId)
      rows = rows.filter(r => r.process === filters.processId);
    if (filters?.status)
      rows = rows.filter(r => r.status === filters.status);
    return rows.map(mapProcedure);
  },

  async getProcedure(tenantId: number, id: string): Promise<ProcedureEntry | undefined> {
    const [row] = await db.select()
      .from(governanceProceduresTable)
      .where(and(
        eq(governanceProceduresTable.tenantId,    tenantId),
        eq(governanceProceduresTable.procedureId, id),
      ))
      .limit(1);
    return row ? mapProcedure(row) : undefined;
  },

  async createProcedure(tenantId: number, data: {
    name: string; owner: string; process?: string;
    description?: string; pages?: number; impact?: ImpactLevel;
  }): Promise<ProcedureEntry> {
    const existing = await db.select({ id: governanceProceduresTable.id })
      .from(governanceProceduresTable)
      .where(eq(governanceProceduresTable.tenantId, tenantId));
    const procedureId = `SOP-${String(existing.length + 1).padStart(3, "0")}`;
    const [row] = await db.insert(governanceProceduresTable).values({
      tenantId,
      procedureId,
      name:        data.name,
      process:     data.process     ?? "",
      owner:       data.owner,
      version:     "1.0",
      status:      "draft",
      pages:       data.pages       ?? 1,
      riskScore:   50,
      lastTested:  "—",
      description: data.description ?? "",
      steps:       [],
      aiInsights:  [],
      impact:      data.impact      ?? "Medium",
    }).returning();
    return mapProcedure(row!);
  },

  async updateProcedure(
    tenantId: number,
    id:       string,
    data:     Partial<Pick<ProcedureEntry, "name"|"process"|"owner"|"description"|"pages"|"impact"|"status">>,
  ): Promise<ProcedureEntry | undefined> {
    const [row] = await db.update(governanceProceduresTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(governanceProceduresTable.tenantId,    tenantId),
        eq(governanceProceduresTable.procedureId, id),
      ))
      .returning();
    return row ? mapProcedure(row) : undefined;
  },

  async deleteProcedure(tenantId: number, id: string): Promise<boolean> {
    const result = await db.delete(governanceProceduresTable)
      .where(and(
        eq(governanceProceduresTable.tenantId,    tenantId),
        eq(governanceProceduresTable.procedureId, id),
      ));
    return (result.rowCount ?? 0) > 0;
  },
};
