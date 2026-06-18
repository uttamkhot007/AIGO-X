import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { networkAuditService } from "../services/network-audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

router.get("/network-audit/stats",     requireAuth, (req, res) => { res.json(networkAuditService.getStats(user(req).tenantId)); });
router.get("/network-audit/rule-sets", requireAuth, (req, res) => { res.json(networkAuditService.getRuleSets(user(req).tenantId)); });
router.get("/network-audit/rule-sets/:id", requireAuth, (req, res) => {
  const rs = networkAuditService.getRuleSet(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!rs) { res.status(404).json({ error: "Rule set not found" }); return; }
  res.json(rs);
});

router.get("/network-audit/rules", requireAuth, (req, res) => {
  const { ruleSetId, anomaly } = req.query as Record<string, string | undefined>;
  res.json(networkAuditService.getRules(user(req).tenantId, ruleSetId, anomaly as "any-any" | "overly-permissive" | "unused" | "redundant" | "shadowed" | "conflict" | undefined));
});
router.get("/network-audit/rules/:id", requireAuth, (req, res) => {
  const r = networkAuditService.getRule(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!r) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json(r);
});
router.patch("/network-audit/rules/:id", requireAuth, (req, res) => {
  const r = networkAuditService.updateRule(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!r) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json(r);
});

router.get("/network-audit/anomalies", requireAuth, (req, res) => { res.json(networkAuditService.detectAnomalies(user(req).tenantId)); });

router.get("/network-audit/changes",  requireAuth, (req, res) => {
  const { ruleSetId } = req.query as Record<string, string | undefined>;
  res.json(networkAuditService.getChanges(user(req).tenantId, ruleSetId ?? ""));
});
router.post("/network-audit/changes", requireAuth, (req, res) => { res.status(201).json(networkAuditService.addChange(user(req).tenantId, req.body)); });

router.get("/network-audit/audits",     requireAuth, (req, res) => { res.json(networkAuditService.getAudits(user(req).tenantId)); });
router.get("/network-audit/audits/:id", requireAuth, (req, res) => {
  const a = networkAuditService.getAuditById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!a) { res.status(404).json({ error: "Audit not found" }); return; }
  res.json(a);
});

const _networkDevices = [
  { id:"ND-001", name:"core-sw-london-01",    type:"Core Switch",     vendor:"Cisco",        model:"Catalyst 9500",       ip:"10.0.1.1",   zone:"Core",        status:"up",    vulns:0, lastScan:"2026-06-15", firmware:"17.9.4a",  patchStatus:"current"  },
  { id:"ND-002", name:"core-sw-london-02",    type:"Core Switch",     vendor:"Cisco",        model:"Catalyst 9500",       ip:"10.0.1.2",   zone:"Core",        status:"up",    vulns:0, lastScan:"2026-06-15", firmware:"17.9.4a",  patchStatus:"current"  },
  { id:"ND-003", name:"fw-perimeter-01",      type:"Firewall",        vendor:"Palo Alto",    model:"PA-7080",             ip:"10.0.0.1",   zone:"Perimeter",   status:"up",    vulns:0, lastScan:"2026-06-14", firmware:"11.1.2",   patchStatus:"pending"  },
  { id:"ND-004", name:"fw-perimeter-02",      type:"Firewall",        vendor:"Palo Alto",    model:"PA-7080",             ip:"10.0.0.2",   zone:"Perimeter",   status:"up",    vulns:0, lastScan:"2026-06-14", firmware:"11.1.2",   patchStatus:"pending"  },
  { id:"ND-005", name:"lb-prod-01",           type:"Load Balancer",   vendor:"F5",           model:"BIG-IP 2000s",        ip:"10.0.2.10",  zone:"DMZ",         status:"up",    vulns:1, lastScan:"2026-06-13", firmware:"16.1.4",   patchStatus:"current"  },
  { id:"ND-006", name:"sw-dmz-01",            type:"Access Switch",   vendor:"Cisco",        model:"Catalyst 9300",       ip:"10.0.2.1",   zone:"DMZ",         status:"up",    vulns:0, lastScan:"2026-06-15", firmware:"17.9.3",   patchStatus:"current"  },
  { id:"ND-007", name:"sw-office-flr3",       type:"Access Switch",   vendor:"Cisco",        model:"Catalyst 2960-X",     ip:"10.1.3.1",   zone:"Office LAN",  status:"up",    vulns:2, lastScan:"2026-06-10", firmware:"15.2.7",   patchStatus:"overdue"  },
  { id:"ND-008", name:"router-isp-01",        type:"Edge Router",     vendor:"Juniper",      model:"MX480",               ip:"203.0.113.1", zone:"Perimeter",  status:"up",    vulns:0, lastScan:"2026-06-14", firmware:"22.4R3",   patchStatus:"current"  },
  { id:"ND-009", name:"vpn-concentrator-01",  type:"VPN Gateway",     vendor:"Cisco",        model:"ASA 5585-X",          ip:"10.0.0.50",  zone:"Perimeter",   status:"up",    vulns:3, lastScan:"2026-06-12", firmware:"9.18.3",   patchStatus:"overdue"  },
  { id:"ND-010", name:"wlan-ctrl-01",         type:"Wireless Controller",vendor:"Aruba",     model:"7240XM",              ip:"10.1.0.5",   zone:"Office LAN",  status:"up",    vulns:1, lastScan:"2026-06-11", firmware:"8.11.2",   patchStatus:"pending"  },
  { id:"ND-011", name:"ids-sensor-core",      type:"IDS/IPS",         vendor:"Cisco",        model:"Firepower 4140",      ip:"10.0.1.100", zone:"Core",        status:"up",    vulns:0, lastScan:"2026-06-15", firmware:"7.4.1",    patchStatus:"current"  },
  { id:"ND-012", name:"sw-legacy-dc2",        type:"Access Switch",   vendor:"HP",           model:"ProCurve 2920",       ip:"10.2.1.1",   zone:"Legacy DC",   status:"degraded",vulns:8,lastScan:"2026-05-20",firmware:"W.15.18", patchStatus:"overdue"  },
  { id:"ND-013", name:"proxy-squid-01",       type:"Proxy Server",    vendor:"Acme",         model:"Squid 6.x",           ip:"10.0.3.20",  zone:"DMZ",         status:"up",    vulns:0, lastScan:"2026-06-13", firmware:"6.10",     patchStatus:"current"  },
  { id:"ND-014", name:"nat-gw-prod",          type:"NAT Gateway",     vendor:"AWS",          model:"AWS NAT Gateway",     ip:"10.0.4.1",   zone:"Cloud",       status:"up",    vulns:0, lastScan:"2026-06-15", firmware:"Managed",  patchStatus:"current"  },
];

const _zoneMatrix: Record<string, Record<string, string>> = {
  "Perimeter": { "Core":"ALLOW-ACL", "DMZ":"ALLOW-ACL", "Office LAN":"DENY", "Legacy DC":"DENY", "Cloud":"ALLOW-ACL", "Perimeter":"DENY" },
  "DMZ":       { "Core":"ALLOW-ACL", "DMZ":"ALLOW",     "Office LAN":"DENY", "Legacy DC":"DENY", "Cloud":"ALLOW-ACL", "Perimeter":"DENY" },
  "Core":      { "Core":"ALLOW",     "DMZ":"ALLOW-ACL", "Office LAN":"ALLOW-ACL","Legacy DC":"ALLOW-ACL","Cloud":"ALLOW-ACL","Perimeter":"DENY" },
  "Office LAN":{ "Core":"ALLOW-ACL", "DMZ":"DENY",      "Office LAN":"ALLOW","Legacy DC":"DENY", "Cloud":"ALLOW-ACL", "Perimeter":"DENY" },
  "Legacy DC": { "Core":"ALLOW-ACL", "DMZ":"DENY",      "Office LAN":"DENY", "Legacy DC":"ALLOW","Cloud":"DENY",      "Perimeter":"DENY" },
  "Cloud":     { "Core":"ALLOW-ACL", "DMZ":"ALLOW-ACL", "Office LAN":"DENY", "Legacy DC":"DENY", "Cloud":"ALLOW",     "Perimeter":"DENY" },
};

router.get("/network-audit/devices",     requireAuth, (_req, res) => { res.json(_networkDevices); });
router.get("/network-audit/zone-matrix", requireAuth, (_req, res) => { res.json(_zoneMatrix); });

router.get("/network-audit/zones", requireAuth, (req, res) => { res.json(networkAuditService.getZoneMatrix(user(req).tenantId)); });
router.get("/network-audit/zones/policy", requireAuth, (req, res) => {
  const { src, dst } = req.query as Record<string, string | undefined>;
  const z = networkAuditService.getZonePolicies(user(req).tenantId, src ?? "", dst ?? "");
  if (!z) { res.status(404).json({ error: "Zone pair not found" }); return; }
  res.json(z);
});

export default router;
