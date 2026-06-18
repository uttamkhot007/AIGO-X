-- Deduplicate any existing rows before adding unique constraints,
-- keeping the lowest id (first inserted) for each pair.

DELETE FROM "compliance_controls" a
USING "compliance_controls" b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.control_id = b.control_id;
--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_tenant_control_uniq" UNIQUE("tenant_id","control_id");
--> statement-breakpoint
DELETE FROM "audit_evidence" a
USING "audit_evidence" b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.evidence_id = b.evidence_id;
--> statement-breakpoint
ALTER TABLE "audit_evidence" ADD CONSTRAINT "audit_evidence_tenant_evidence_uniq" UNIQUE("tenant_id","evidence_id");
