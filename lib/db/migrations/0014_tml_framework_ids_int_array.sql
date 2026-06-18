ALTER TABLE "tenant_module_licenses" ALTER COLUMN "framework_ids" DROP DEFAULT;
ALTER TABLE "tenant_module_licenses" ALTER COLUMN "framework_ids" TYPE integer[] USING ARRAY[]::integer[];
ALTER TABLE "tenant_module_licenses" ALTER COLUMN "framework_ids" SET DEFAULT '{}';
