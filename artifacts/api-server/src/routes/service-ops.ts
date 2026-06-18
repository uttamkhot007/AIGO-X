import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import {
  serviceChangesTable,
  serviceProblemsTable,
  cmdbItemsTable,
  slaRecordsTable,
  kbArticlesTable,
  iotDevicesTable,
  otDiscoveryTable,
  otProtocolsTable,
  ciDependenciesTable,
  ciChangeLinksTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

router.get("/service/changes", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(serviceChangesTable).where(eq(serviceChangesTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      id:        r.changeId,
      changeId:  r.changeId,
      title:     r.title,
      type:      r.type,
      impact:    r.impact,
      risk:      r.risk,
      approver:  r.approver,
      scheduled: r.scheduled,
      status:    r.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/problems", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(serviceProblemsTable).where(eq(serviceProblemsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/cmdb", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(cmdbItemsTable).where(eq(cmdbItemsTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      id:              r.ciId,
      name:            r.name,
      type:            r.type,
      os:              r.version,
      owner:           r.owner,
      env:             r.env,
      criticality:     r.criticality,
      vulnerabilities: r.vulnerabilities,
      patch:           r.patch,
      status:          r.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/cmdb/deps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(ciDependenciesTable).where(eq(ciDependenciesTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      id:     r.edgeId,
      source: r.sourceCi,
      target: r.targetCi,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/cmdb/change-links", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(ciChangeLinksTable).where(eq(ciChangeLinksTable.tenantId, tenantId));
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.ciId]) map[r.ciId] = [];
      map[r.ciId].push(r.changeId);
    }
    res.json(map);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/sla", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(slaRecordsTable).where(eq(slaRecordsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/service/kb", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(kbArticlesTable).where(eq(kbArticlesTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      id:          r.articleId,
      category:    r.category,
      title:       r.title,
      excerpt:     r.content,
      tags:        r.tags ?? "",
      module:      r.module ?? "",
      framework:   r.framework ?? "",
      views:       r.views,
      helpful:     r.helpful,
      lastUpdated: r.updatedAt.toISOString().slice(0, 10),
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/asset/iot-devices", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(iotDevicesTable).where(eq(iotDevicesTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      id:              r.deviceId,
      name:            r.name,
      type:            r.type,
      icon:            r.icon,
      manufacturer:    r.manufacturer,
      model:           r.model,
      firmware:        r.firmware,
      fwDate:          r.fwDate,
      ip:              r.ip,
      segment:         r.segment,
      risk:            r.risk,
      status:          r.status,
      lastSeen:        r.lastSeen,
      openPorts:       JSON.parse(r.openPorts || "[]"),
      protocols:       JSON.parse(r.protocols || "[]"),
      cves:            JSON.parse(r.cves || "[]"),
      commPeers:       JSON.parse(r.commPeers || "[]"),
      isolationAction: r.isolationAction,
      location:        r.location,
      confidence:      r.confidence,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/asset/ot-discovery", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(otDiscoveryTable).where(eq(otDiscoveryTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      ip:         r.ip,
      hostname:   r.hostname,
      type:       r.type,
      confidence: r.confidence,
      firstSeen:  r.firstSeen,
      openPorts:  JSON.parse(r.openPorts || "[]"),
      action:     r.action,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/asset/ot-protocols", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(otProtocolsTable).where(eq(otProtocolsTable.tenantId, tenantId));
    res.json(rows.map(r => ({
      name:      r.name,
      port:      r.port,
      devices:   r.devices,
      exposure:  r.exposure,
      encrypted: r.encrypted,
      desc:      r.description,
      action:    r.action,
      color:     r.color,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
