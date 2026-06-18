import { Router } from "express";
import { requireAuth } from "../lib/auth";

const router = Router();

const dataSources = [
  { id:"DS-001", name:"AWS S3 — Production Data Lake",   type:"Cloud Storage",    platform:"AWS",      region:"us-east-1",   assets:184, pii:true,  phi:false, pci:true,  classified:true,  lastScan:"2026-06-14", risk:"High",     status:"connected" },
  { id:"DS-002", name:"PostgreSQL — Production Primary", type:"RDBMS",            platform:"AWS RDS",  region:"eu-west-1",   assets:312, pii:true,  phi:false, pci:true,  classified:true,  lastScan:"2026-06-15", risk:"Critical", status:"connected" },
  { id:"DS-003", name:"Snowflake — Analytics Warehouse", type:"Data Warehouse",   platform:"Snowflake",region:"eu-central-1",assets:820, pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-13", risk:"Medium",   status:"connected" },
  { id:"DS-004", name:"Azure Blob — EU Backup Storage",  type:"Cloud Storage",    platform:"Azure",    region:"westeurope",  assets:96,  pii:false, phi:false, pci:false, classified:false, lastScan:"2026-06-10", risk:"Low",      status:"connected" },
  { id:"DS-005", name:"MongoDB — Customer Profiles",     type:"NoSQL",            platform:"AWS",      region:"us-east-1",   assets:48,  pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-15", risk:"High",     status:"connected" },
  { id:"DS-006", name:"Redis — Session Cache",           type:"In-Memory Cache",  platform:"AWS",      region:"us-east-1",   assets:12,  pii:true,  phi:false, pci:false, classified:false, lastScan:"2026-06-15", risk:"Medium",   status:"connected" },
  { id:"DS-007", name:"Elasticsearch — Search Index",   type:"Search Engine",    platform:"AWS",      region:"eu-west-1",   assets:28,  pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-12", risk:"Medium",   status:"connected" },
  { id:"DS-008", name:"GCS — GCP Data Pipeline",        type:"Cloud Storage",    platform:"GCP",      region:"europe-west1",assets:64,  pii:false, phi:false, pci:false, classified:false, lastScan:"2026-06-11", risk:"Low",      status:"connected" },
  { id:"DS-009", name:"MySQL — Legacy CRM DB",           type:"RDBMS",            platform:"OnPrem",   region:"London-DC1",  assets:142, pii:true,  phi:false, pci:true,  classified:true,  lastScan:"2026-06-08", risk:"Critical", status:"degraded"  },
  { id:"DS-010", name:"SharePoint — Document Mgmt",      type:"SaaS Storage",     platform:"Microsoft",region:"eu-west-1",   assets:2400,pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-14", risk:"Medium",   status:"connected" },
  { id:"DS-011", name:"Dropbox Business — File Sharing", type:"SaaS Storage",     platform:"Dropbox",  region:"USA",         assets:890, pii:true,  phi:false, pci:false, classified:false, lastScan:"2026-06-09", risk:"High",     status:"connected" },
  { id:"DS-012", name:"Salesforce — CRM Data",           type:"SaaS CRM",         platform:"Salesforce",region:"USA",        assets:560, pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-14", risk:"Medium",   status:"connected" },
  { id:"DS-013", name:"Workday — HR Platform",           type:"SaaS HR",          platform:"Workday",  region:"USA",         assets:240, pii:true,  phi:false, pci:false, classified:true,  lastScan:"2026-06-13", risk:"High",     status:"connected" },
];

const attackSurface = [
  { id:"EXP-001", type:"Domain",    asset:"acme.com",            open:["443","80"],       dns:"A + MX",   cert:"Valid (120d)",  status:"ok",       finding:"" },
  { id:"EXP-002", type:"Subdomain", asset:"api.acme.com",        open:["443","8080"],     dns:"A",        cert:"Valid (90d)",   status:"warning",  finding:"Port 8080 exposed externally" },
  { id:"EXP-003", type:"Subdomain", asset:"dev.acme.com",        open:["22","80"],        dns:"A",        cert:"None",         status:"critical", finding:"SSH (22) open + no TLS" },
  { id:"EXP-004", type:"Subdomain", asset:"mail.acme.com",       open:["25","465","993"], dns:"A + MX",   cert:"Valid (200d)", status:"ok",       finding:"" },
  { id:"EXP-005", type:"Subdomain", asset:"old-portal.acme.com", open:["80","443"],       dns:"A",        cert:"Expired",      status:"critical", finding:"SSL cert expired" },
  { id:"EXP-006", type:"IP",        asset:"185.201.xx.xx",       open:["3389"],           dns:"PTR only", cert:"None",         status:"critical", finding:"RDP exposed to internet" },
  { id:"EXP-007", type:"IP",        asset:"185.201.xx.yy",       open:["443"],            dns:"A",        cert:"Valid (60d)",  status:"warning",  finding:"Cert expires in < 60 days" },
  { id:"EXP-008", type:"Subdomain", asset:"staging.acme.com",    open:["443","5432"],     dns:"A",        cert:"Valid (45d)",  status:"warning",  finding:"DB port 5432 reachable externally" },
];

router.get("/assetops/data-sources",   requireAuth, (_req, res) => { res.json(dataSources); });
router.get("/assetops/attack-surface", requireAuth, (_req, res) => { res.json(attackSurface); });

export default router;
