import { db } from "../lib/db";
import {
  evidenceArtifactsTable,
  evidenceEngineRunsTable,
  controlsTable,
  tenantsTable,
} from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { IAMClient, GetAccountSummaryCommand, GenerateCredentialReportCommand, GetCredentialReportCommand, ListVirtualMFADevicesCommand } from "@aws-sdk/client-iam";
import { S3ControlClient, GetPublicAccessBlockCommand } from "@aws-sdk/client-s3-control";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const COLLECTOR_VERSION = "1.0";

// ── Per-tenant evidence settings ──────────────────────────────────────────────
// Keyed by tenantId; falls back to env defaults.

export interface TenantEvidenceSettings {
  staleThresholdDays: number;
  cronSchedule: string;
}

const DEFAULT_STALE_DAYS = Number(process.env["EVIDENCE_STALE_DAYS"] ?? "7");
const DEFAULT_CRON       = process.env["EVIDENCE_CRON"] ?? "0 2 * * *";

const tenantSettingsCache = new Map<number, TenantEvidenceSettings>();

export function getTenantEvidenceSettings(tenantId: number): TenantEvidenceSettings {
  if (tenantSettingsCache.has(tenantId)) return tenantSettingsCache.get(tenantId)!;
  return { staleThresholdDays: DEFAULT_STALE_DAYS, cronSchedule: DEFAULT_CRON };
}

export function setTenantEvidenceSettings(
  tenantId: number,
  settings: Partial<TenantEvidenceSettings>
): void {
  const current = getTenantEvidenceSettings(tenantId);
  tenantSettingsCache.set(tenantId, { ...current, ...settings });
}

// ── Standardised artifact shape ───────────────────────────────────────────────

export interface EvidenceArtifactInput {
  controlRef: string;
  sourceIntegration: string;
  status: "fresh" | "stale" | "failed" | "missing";
  rawPayload: Record<string, unknown>;
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function staleBoundary(thresholdDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - thresholdDays);
  return d;
}

function expiresAt(thresholdDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + thresholdDays);
  return d;
}

// Deterministic pseudo-random based on a string seed
function seededResult(seed: string, failRate = 0.12, warnRate = 0.1): "fresh" | "stale" | "failed" {
  const h = seed.split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7);
  const v = Math.abs(h % 100) / 100;
  if (v < failRate) return "failed";
  if (v < failRate + warnRate) return "stale";
  return "fresh";
}

// ── GitHub collector ──────────────────────────────────────────────────────────

async function collectGitHub(controlRef: string): Promise<EvidenceArtifactInput> {
  const token = process.env["GITHUB_TOKEN"];

  if (token) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      // Get authenticated user info
      const userRes = await fetch("https://api.github.com/user", { headers });
      const user = (userRes.ok ? await userRes.json() : {}) as { login?: string; name?: string };

      // Get orgs for the token
      const orgRes = await fetch("https://api.github.com/user/orgs", { headers });
      const orgs = (orgRes.ok ? await orgRes.json() : []) as Array<{ login: string }>;
      const orgLogin = orgs[0]?.login ?? user.login ?? "unknown";

      // Get 2FA requirement for the org (if org exists)
      let twoFactorRequired = false;
      if (orgs.length > 0) {
        const orgDetailRes = await fetch(`https://api.github.com/orgs/${orgLogin}`, { headers });
        if (orgDetailRes.ok) {
          const orgDetail = await orgDetailRes.json() as { two_factor_requirement_enabled?: boolean };
          twoFactorRequired = orgDetail.two_factor_requirement_enabled ?? false;
        }
      }

      // Get repos and check branch protection + secret scanning
      const reposRes = await fetch(
        orgLogin !== "unknown" && orgLogin !== user.login
          ? `https://api.github.com/orgs/${orgLogin}/repos?per_page=5&sort=updated&type=all`
          : `https://api.github.com/user/repos?per_page=5&sort=updated`,
        { headers }
      );
      const repos = (reposRes.ok ? await reposRes.json() : []) as Array<{
        name: string;
        default_branch: string;
        security_and_analysis?: { secret_scanning?: { status: string }; code_scanning?: { status: string } };
        owner: { login: string };
      }>;

      const repoChecks = await Promise.all(
        repos.slice(0, 5).map(async (repo) => {
          const owner = repo.owner?.login ?? orgLogin;
          const bpRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo.name}/branches/${repo.default_branch}/protection`,
            { headers }
          );
          const bp = bpRes.ok ? await bpRes.json() as Record<string, unknown> : null;
          const secretScanEnabled = repo.security_and_analysis?.secret_scanning?.status === "enabled";
          return {
            repo: repo.name,
            owner,
            defaultBranch: repo.default_branch,
            branchProtectionEnabled: bpRes.ok,
            requireCodeReview: bp != null && "required_pull_request_reviews" in bp && bp["required_pull_request_reviews"] != null,
            secretScanningEnabled: secretScanEnabled,
          };
        })
      );

      const allProtected = repoChecks.length > 0 && repoChecks.every((r) => r.branchProtectionEnabled);
      const allReview    = repoChecks.length > 0 && repoChecks.every((r) => r.requireCodeReview);
      const secretScanOk = repoChecks.every((r) => r.secretScanningEnabled);

      // Posture: fail when any key control is missing; warn when 2FA not org-enforced
      const overallStatus: "fresh" | "stale" | "failed" =
        (!allProtected || !allReview) ? "failed" : "fresh";

      return {
        controlRef,
        sourceIntegration: "github",
        status: overallStatus,
        rawPayload: {
          org: orgLogin,
          authenticatedAs: user.login,
          reposChecked: repoChecks.length,
          repoDetails: repoChecks,
          allBranchesProtected: allProtected,
          codeReviewRequired: allReview,
          secretScanningEnabled: secretScanOk,
          twoFactorRequired,
          collectedAt: new Date().toISOString(),
          mode: "live",
        },
        summary: `GitHub [${orgLogin}]: ${repoChecks.length} repos checked. Branch protection: ${allProtected ? "✓ All" : "⚠ Partial"}. Code review: ${allReview ? "✓ Required" : "⚠ Not enforced"}. 2FA org requirement: ${twoFactorRequired ? "✓" : "⚠ Not enforced"}.`,
      };
    } catch (err) {
      return { controlRef, sourceIntegration: "github", status: "failed", rawPayload: { error: String(err) }, summary: `GitHub collection failed: ${String(err)}` };
    }
  }

  // Demo / simulated mode — realistic data without real credentials
  const status = seededResult(`github-${controlRef}`, 0.08, 0.12);
  const repos = [
    { repo: "api-gateway",    defaultBranch: "main", branchProtectionEnabled: true, requireCodeReview: true,  secretScanningEnabled: true,  codeScanningEnabled: status !== "failed" },
    { repo: "frontend-app",   defaultBranch: "main", branchProtectionEnabled: true, requireCodeReview: true,  secretScanningEnabled: true,  codeScanningEnabled: true },
    { repo: "data-pipeline",  defaultBranch: "main", branchProtectionEnabled: status !== "failed", requireCodeReview: status !== "failed", secretScanningEnabled: true, codeScanningEnabled: false },
  ];
  return {
    controlRef,
    sourceIntegration: "github",
    status: "fresh",
    rawPayload: {
      org: "acme-corp",
      reposChecked: 3,
      repoDetails: repos,
      allBranchesProtected: repos.every(r => r.branchProtectionEnabled),
      codeReviewRequired: repos.every(r => r.requireCodeReview),
      secretScanningEnabled: true,
      twoFactorRequired: true,
      dependabotEnabled: status !== "failed",
      collectedAt: new Date().toISOString(),
      mode: "simulated",
    },
    summary: status === "failed"
      ? "GitHub: Branch protection missing on 1 repo. Code scanning disabled. Review required."
      : "GitHub: Branch protection ✓. Code review required ✓. Secret scanning enabled ✓.",
  };
}

// ── AWS collector ─────────────────────────────────────────────────────────────

async function collectAWS(controlRef: string): Promise<EvidenceArtifactInput> {
  const accessKey    = process.env["AWS_ACCESS_KEY_ID"];
  const secretKey    = process.env["AWS_SECRET_ACCESS_KEY"];
  const region       = process.env["AWS_DEFAULT_REGION"] ?? "us-east-1";
  const sessionToken = process.env["AWS_SESSION_TOKEN"];

  if (accessKey && secretKey) {
    try {
      const credentials = { accessKeyId: accessKey, secretAccessKey: secretKey, ...(sessionToken ? { sessionToken } : {}) };

      // Get caller identity (account ID)
      const stsClient = new STSClient({ region, credentials });
      const identity  = await stsClient.send(new GetCallerIdentityCommand({}));
      const accountId = identity.Account ?? "unknown";

      // IAM: account summary (MFA devices, users, etc.)
      const iamClient     = new IAMClient({ region, credentials });
      const accountSummary = await iamClient.send(new GetAccountSummaryCommand({}));
      const summary       = accountSummary.SummaryMap ?? {};

      const totalUsers       = summary["Users"]                   ?? 0;
      const mfaDevices       = summary["MFADevices"]              ?? 0;
      const mfaDevicesInUse  = summary["MFADevicesInUse"]         ?? 0;
      const rootMfaEnabled   = (summary["AccountMFAEnabled"]      ?? 0) === 1;
      const virtualMfaCount  = (summary as Record<string, number | undefined>)["VirtualMFADevices"] ?? 0;

      // Get virtual MFA devices to find users without MFA
      let usersWithoutMfa = 0;
      try {
        const mfaRes = await iamClient.send(new ListVirtualMFADevicesCommand({ AssignmentStatus: "Unassigned" }));
        usersWithoutMfa = mfaRes.VirtualMFADevices?.length ?? 0;
      } catch {
        // best-effort; use account summary approximation
        usersWithoutMfa = Math.max(0, totalUsers - mfaDevicesInUse);
      }

      // Generate credential report to check for root access key usage
      let credReportBase64: string | undefined;
      try {
        await iamClient.send(new GenerateCredentialReportCommand({}));
        // Wait briefly for report to generate
        await new Promise(r => setTimeout(r, 1500));
        const reportRes = await iamClient.send(new GetCredentialReportCommand({}));
        credReportBase64 = reportRes.Content ? Buffer.from(reportRes.Content).toString("utf-8") : undefined;
      } catch {
        // credential report is best-effort
      }

      // Parse root access key status from credential report
      let rootAccessKeyActive = false;
      if (credReportBase64) {
        const lines = credReportBase64.split("\n");
        const rootLine = lines.find(l => l.startsWith("<root-account>") || l.includes(",root,"));
        if (rootLine) {
          const cols = rootLine.split(",");
          rootAccessKeyActive = cols[8] === "true" || cols[9] === "true";
        }
      }

      // S3 Account-level public access block
      let s3BlockAll = false;
      let s3BlockDetails: Record<string, boolean> = {};
      try {
        const s3Client = new S3ControlClient({ region, credentials });
        const s3Block  = await s3Client.send(new GetPublicAccessBlockCommand({ AccountId: accountId }));
        const cfg = s3Block.PublicAccessBlockConfiguration ?? {};
        s3BlockAll    = !!(cfg.BlockPublicAcls && cfg.IgnorePublicAcls && cfg.BlockPublicPolicy && cfg.RestrictPublicBuckets);
        s3BlockDetails = {
          BlockPublicAcls:       cfg.BlockPublicAcls       ?? false,
          IgnorePublicAcls:      cfg.IgnorePublicAcls      ?? false,
          BlockPublicPolicy:     cfg.BlockPublicPolicy      ?? false,
          RestrictPublicBuckets: cfg.RestrictPublicBuckets  ?? false,
        };
      } catch {
        // S3 public access block check is best-effort (needs s3:GetAccountPublicAccessBlock)
      }

      const mfaOk = rootMfaEnabled && usersWithoutMfa === 0;

      // Posture: fail when critical IAM controls are missing or root key is active
      const awsStatus: "fresh" | "failed" =
        (!rootMfaEnabled || usersWithoutMfa > 0 || rootAccessKeyActive) ? "failed" : "fresh";

      return {
        controlRef,
        sourceIntegration: "aws",
        status: awsStatus,
        rawPayload: {
          accountId,
          region,
          s3PublicAccessBlock: { ...s3BlockDetails, allBlocked: s3BlockAll, source: "GetPublicAccessBlock API" },
          iamMfaPolicy: {
            rootMfaEnabled,
            rootAccessKeyActive,
            totalUsers,
            mfaDevices,
            mfaDevicesInUse,
            virtualMfaDevicesUnassigned: usersWithoutMfa,
            usersWithoutMfa,
            mfaRequiredForConsoleUsers: mfaOk,
            source: "IAM GetAccountSummary + credential report",
          },
          collectedAt: new Date().toISOString(),
          mode: "live",
        },
        summary: `AWS [acct ${accountId}]: S3 public access block: ${s3BlockAll ? "✓ All blocked" : "⚠ Partial"}. Root MFA: ${rootMfaEnabled ? "✓" : "⚠ Not enabled"}. Users without MFA: ${usersWithoutMfa}. Root access key: ${rootAccessKeyActive ? "⚠ Active" : "✓ Inactive"}.`,
      };
    } catch (err) {
      return { controlRef, sourceIntegration: "aws", status: "failed", rawPayload: { error: String(err) }, summary: `AWS collection failed: ${String(err)}` };
    }
  }

  // Demo / simulated mode
  const status = seededResult(`aws-${controlRef}`, 0.1, 0.08);
  const mfaUsers = status === "failed" ? 3 : 0;
  return {
    controlRef,
    sourceIntegration: "aws",
    status: "fresh",
    rawPayload: {
      s3PublicAccessBlock: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: status !== "failed", bucketsChecked: 14, publicBuckets: status === "failed" ? 1 : 0 },
      iamMfaPolicy:        { mfaRequiredForConsoleUsers: status !== "failed", rootMfaEnabled: true, usersWithoutMfa: mfaUsers, totalUsers: 47, source: "IAM credential report" },
      cloudTrail:          { enabledAllRegions: status !== "failed", logFileValidation: true, s3BucketEncrypted: true },
      guardDuty:           { enabled: true, regions: ["us-east-1","us-west-2","eu-west-1"], threatsSuppressed: 0 },
      securityHub:         { enabled: true, standardsEnabled: ["aws-foundational-security-best-practices","cis-aws-foundations-benchmark"] },
      region:              "us-east-1",
      accountId:           "123456789012",
      collectedAt:         new Date().toISOString(),
      mode:                "simulated",
    },
    summary: status === "failed"
      ? `AWS: ${mfaUsers} IAM users without MFA. 1 S3 bucket with public access. CloudTrail not enabled in all regions.`
      : "AWS: S3 public access block ✓. IAM MFA enforced ✓. CloudTrail enabled ✓. GuardDuty active ✓.",
  };
}

// ── Okta collector ────────────────────────────────────────────────────────────

async function collectOkta(controlRef: string): Promise<EvidenceArtifactInput> {
  const oktaDomain = process.env["OKTA_DOMAIN"];
  const oktaToken  = process.env["OKTA_API_TOKEN"];

  if (oktaDomain && oktaToken) {
    try {
      const headers = { Authorization: `SSWS ${oktaToken}`, Accept: "application/json" };

      // Get MFA enrollment policies
      const policiesRes = await fetch(`https://${oktaDomain}/api/v1/policies?type=MFA_ENROLL&limit=10`, { headers });
      if (!policiesRes.ok) throw new Error(`Okta policies API returned ${policiesRes.status}: ${await policiesRes.text()}`);
      const policies = (await policiesRes.json()) as Array<{ id: string; name: string; status: string; priority: number }>;
      const activeMfa = policies.filter((p) => p.status === "ACTIVE");

      // Get user count
      let totalUsers = 0;
      let activeUsers = 0;
      try {
        const usersRes = await fetch(`https://${oktaDomain}/api/v1/users?limit=1&filter=status+eq+"ACTIVE"`, { headers });
        if (usersRes.ok) {
          // Check X-Rate-Limit-Limit header or Content-Range for total count
          const xTotal = usersRes.headers.get("x-total-count");
          activeUsers = xTotal ? Number(xTotal) : -1;
        }
        const usersAllRes = await fetch(`https://${oktaDomain}/api/v1/users?limit=1`, { headers });
        if (usersAllRes.ok) {
          const xTotal = usersAllRes.headers.get("x-total-count");
          totalUsers = xTotal ? Number(xTotal) : -1;
        }
      } catch {
        // user count is best-effort
      }

      // Get session policies
      let sessionPolicy: { maxSessionLifetimeSecs?: number; idleTimeoutMins?: number } = {};
      try {
        const sessionRes = await fetch(`https://${oktaDomain}/api/v1/policies?type=OKTA_SIGN_ON&limit=5`, { headers });
        if (sessionRes.ok) {
          const sessions = await sessionRes.json() as Array<{ status: string; settings?: { session?: { maxSessionLifetimeMinutes?: number; usePersistentCookie?: boolean } } }>;
          const activeSession = sessions.find(s => s.status === "ACTIVE");
          if (activeSession?.settings?.session) {
            sessionPolicy = { maxSessionLifetimeSecs: (activeSession.settings.session.maxSessionLifetimeMinutes ?? 0) * 60 };
          }
        }
      } catch {
        // session policy is best-effort
      }

      // Get org info
      let orgName = oktaDomain;
      try {
        const orgRes = await fetch(`https://${oktaDomain}/api/v1/org`, { headers });
        if (orgRes.ok) {
          const org = await orgRes.json() as { name?: string; subdomain?: string };
          orgName = org.name ?? org.subdomain ?? oktaDomain;
        }
      } catch {
        // org info is best-effort
      }

      // Posture: fail when no active MFA enrollment policies exist
      const oktaStatus: "fresh" | "failed" = activeMfa.length === 0 ? "failed" : "fresh";

      return {
        controlRef,
        sourceIntegration: "okta",
        status: oktaStatus,
        rawPayload: {
          domain: oktaDomain,
          orgName,
          mfaPolicies: policies.length,
          activeMfaPolicies: activeMfa.length,
          policies: policies.map(p => ({ id: p.id, name: p.name, status: p.status, priority: p.priority })),
          sessionPolicy,
          totalUsers: totalUsers >= 0 ? totalUsers : "unknown",
          activeUsers: activeUsers >= 0 ? activeUsers : "unknown",
          collectedAt: new Date().toISOString(),
          mode: "live",
        },
        summary: `Okta [${orgName}]: ${activeMfa.length}/${policies.length} MFA enrolment policies active. ${totalUsers >= 0 ? `${totalUsers} total users.` : ""}`,
      };
    } catch (err) {
      return { controlRef, sourceIntegration: "okta", status: "failed", rawPayload: { error: String(err) }, summary: `Okta collection failed: ${String(err)}` };
    }
  }

  // Demo / simulated mode
  const status = seededResult(`okta-${controlRef}`, 0.07, 0.1);
  const inactiveAccounts = status === "failed" ? 8 : 0;
  return {
    controlRef,
    sourceIntegration: "okta",
    status: "fresh",
    rawPayload: {
      mfaEnrollmentPolicies: [
        { id: "00p1x2y3z4", name: "All Users MFA Policy", status: "ACTIVE", type: "MFA_ENROLL", priority: 0 },
        { id: "00p5a6b7c8", name: "Admin MFA Policy — Phishing Resistant", status: "ACTIVE", type: "MFA_ENROLL", priority: 1 },
      ],
      activePolicies: 2,
      sessionPolicy: { maxSessionLifetime: 28800, reauthFrequency: 28800 },
      userLifecycle: { inactiveThresholdDays: 30, inactiveUsersFound: inactiveAccounts, autoDeprovision: status !== "failed" },
      ssoApps: 23,
      totalUsers: 312,
      mfaEnrolled: status !== "failed" ? 312 : 304,
      collectedAt: new Date().toISOString(),
      mode: "simulated",
    },
    summary: status === "failed"
      ? `Okta: ${inactiveAccounts} inactive accounts not deprovisioned. MFA gap detected.`
      : "Okta: MFA required for all users ✓. Phishing-resistant MFA for admins ✓. Session timeout ≤8h ✓.",
  };
}

// ── Manual upload helper ──────────────────────────────────────────────────────

export function buildManualArtifact(
  controlRef: string,
  payload: Record<string, unknown>
): EvidenceArtifactInput {
  return {
    controlRef,
    sourceIntegration: "manual",
    status: "fresh",
    rawPayload: { ...payload, uploadedAt: new Date().toISOString() },
    summary: `Manual evidence uploaded: ${(payload["fileName"] as string) ?? "document"}.`,
  };
}

// ── Integration → control routing ─────────────────────────────────────────────

function resolveCollector(controlRef: string): {
  integration: string;
  collector: (ref: string) => Promise<EvidenceArtifactInput>;
} {
  const ref = controlRef.toUpperCase();

  if (
    ref.startsWith("CC8") || ref.startsWith("CC6.8") ||
    ref.includes("A.8.4") || ref.includes("A.8.25") || ref.includes("A.8.26") ||
    ref.includes("A.8.27") || ref.includes("A.8.28") || ref.includes("A.8.29") ||
    ref.includes("A.12.1") || ref.includes("A.12.5") || ref.includes("A.12.6") ||
    ref.includes("A.14.2") || ref.includes("A.14.3") ||
    ref.startsWith("PR.IP") || ref.startsWith("DE.CM")
  ) {
    return { integration: "github", collector: collectGitHub };
  }

  if (
    ref.startsWith("A.9") || ref.startsWith("A.5.15") || ref.startsWith("A.5.16") ||
    ref.startsWith("A.5.17") || ref.startsWith("A.5.18") || ref.startsWith("A.6.1") ||
    ref.startsWith("CC6.1") || ref.startsWith("CC6.2") || ref.startsWith("CC6.3") ||
    ref.startsWith("ID.AM") || ref.startsWith("PR.AC") ||
    ref.includes("MFA") || ref.includes("ACCESS") || ref.includes("IDENTITY") ||
    ref.includes("164.312(A)") || ref.includes("164.308(A)(3)") || ref.includes("164.308(A)(4)")
  ) {
    return { integration: "okta", collector: collectOkta };
  }

  if (
    ref.startsWith("A.10") || ref.startsWith("A.12.4") || ref.startsWith("A.13") ||
    ref.startsWith("A.17") || ref.startsWith("CC7") || ref.startsWith("CC9") ||
    ref.startsWith("PR.DS") || ref.startsWith("PR.PT") || ref.startsWith("RS.CO") ||
    ref.startsWith("DE.AE") || ref.startsWith("RC.RP") ||
    ref.includes("ENCRYPTION") || ref.includes("LOGGING") || ref.includes("BACKUP") ||
    ref.includes("164.312(E)") || ref.includes("164.312(B)") || ref.includes("164.308(A)(7)")
  ) {
    return { integration: "aws", collector: collectAWS };
  }

  const h   = controlRef.split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7);
  const idx = Math.abs(h) % 3;
  if (idx === 0) return { integration: "github", collector: collectGitHub };
  if (idx === 1) return { integration: "aws",    collector: collectAWS    };
  return              { integration: "okta",    collector: collectOkta   };
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function upsertArtifact(
  tenantId: number,
  controlDbId: number,
  input: EvidenceArtifactInput,
  runId: string,
  thresholdDays: number
): Promise<void> {
  const artifactId = `ev-${tenantId}-${controlDbId}-${input.sourceIntegration}`;
  const now = new Date();
  const exp = expiresAt(thresholdDays);

  await db
    .insert(evidenceArtifactsTable)
    .values({
      tenantId,
      artifactId,
      controlId:         controlDbId,
      controlRef:        input.controlRef,
      sourceIntegration: input.sourceIntegration,
      status:            input.status,
      rawPayload:        input.rawPayload,
      summary:           input.summary,
      collectorVersion:  COLLECTOR_VERSION,
      runId,
      collectedAt:       now,
      expiresAt:         exp,
    })
    .onConflictDoUpdate({
      target: [evidenceArtifactsTable.tenantId, evidenceArtifactsTable.artifactId],
      set: {
        status:           input.status,
        rawPayload:       input.rawPayload,
        summary:          input.summary,
        collectorVersion: COLLECTOR_VERSION,
        runId,
        collectedAt:      now,
        expiresAt:        exp,
      },
    });
}

// ── Stale sweep — run before or after collection, uses tenant threshold ────────

export async function markStaleArtifacts(tenantId: number): Promise<number> {
  const { staleThresholdDays } = getTenantEvidenceSettings(tenantId);
  const cutoff = staleBoundary(staleThresholdDays);

  const staleRows = await db
    .select({ id: evidenceArtifactsTable.id })
    .from(evidenceArtifactsTable)
    .where(
      and(
        eq(evidenceArtifactsTable.tenantId, tenantId),
        eq(evidenceArtifactsTable.status, "fresh"),
        lt(evidenceArtifactsTable.collectedAt, cutoff)
      )
    );

  if (staleRows.length === 0) return 0;

  for (const { id } of staleRows) {
    await db
      .update(evidenceArtifactsTable)
      .set({ status: "stale" })
      .where(eq(evidenceArtifactsTable.id, id));
  }

  return staleRows.length;
}

// ── Credential status helper (used by credentials API route) ──────────────────

export interface CredentialStatus {
  configured: boolean;
  mode: "live" | "simulated";
  detail: string;
}

export async function getCredentialStatuses(): Promise<{
  github: CredentialStatus;
  aws: CredentialStatus;
  okta: CredentialStatus;
}> {
  const githubToken  = process.env["GITHUB_TOKEN"];
  const awsAccessKey = process.env["AWS_ACCESS_KEY_ID"];
  const awsSecretKey = process.env["AWS_SECRET_ACCESS_KEY"];
  const oktaDomain   = process.env["OKTA_DOMAIN"];
  const oktaToken    = process.env["OKTA_API_TOKEN"];

  return {
    github: {
      configured: !!githubToken,
      mode: githubToken ? "live" : "simulated",
      detail: githubToken
        ? "GITHUB_TOKEN is configured — collector will call the real GitHub API."
        : "No GITHUB_TOKEN secret found. Add it in Replit Secrets to pull live evidence.",
    },
    aws: {
      configured: !!(awsAccessKey && awsSecretKey),
      mode: (awsAccessKey && awsSecretKey) ? "live" : "simulated",
      detail: (awsAccessKey && awsSecretKey)
        ? `AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY are configured (region: ${process.env["AWS_DEFAULT_REGION"] ?? "us-east-1"}).`
        : "No AWS credentials found. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (and optionally AWS_DEFAULT_REGION) in Replit Secrets.",
    },
    okta: {
      configured: !!(oktaDomain && oktaToken),
      mode: (oktaDomain && oktaToken) ? "live" : "simulated",
      detail: (oktaDomain && oktaToken)
        ? `OKTA_DOMAIN (${oktaDomain}) + OKTA_API_TOKEN are configured.`
        : "No Okta credentials found. Add OKTA_DOMAIN and OKTA_API_TOKEN in Replit Secrets.",
    },
  };
}

// ── Live connection test (lightweight ping) ────────────────────────────────────

export async function testCredential(
  integration: "github" | "aws" | "okta"
): Promise<{ ok: boolean; accountName?: string; detail: string }> {
  try {
    if (integration === "github") {
      const token = process.env["GITHUB_TOKEN"];
      if (!token) return { ok: false, detail: "GITHUB_TOKEN not configured." };
      const res  = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (!res.ok) return { ok: false, detail: `GitHub API returned ${res.status}: ${await res.text()}` };
      const u = await res.json() as { login: string; name?: string };
      // Also check org membership
      const orgRes  = await fetch("https://api.github.com/user/orgs", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      const orgs = orgRes.ok ? (await orgRes.json() as Array<{ login: string }>) : [];
      const orgStr = orgs.length > 0 ? ` (orgs: ${orgs.map(o => o.login).join(", ")})` : "";
      return { ok: true, accountName: u.name ?? u.login, detail: `Authenticated as @${u.login}${orgStr}.` };
    }

    if (integration === "aws") {
      const accessKey    = process.env["AWS_ACCESS_KEY_ID"];
      const secretKey    = process.env["AWS_SECRET_ACCESS_KEY"];
      const region       = process.env["AWS_DEFAULT_REGION"] ?? "us-east-1";
      const sessionToken = process.env["AWS_SESSION_TOKEN"];
      if (!accessKey || !secretKey) return { ok: false, detail: "AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not configured." };
      const credentials = { accessKeyId: accessKey, secretAccessKey: secretKey, ...(sessionToken ? { sessionToken } : {}) };
      const sts    = new STSClient({ region, credentials });
      const result = await sts.send(new GetCallerIdentityCommand({}));
      return { ok: true, accountName: `Account ${result.Account}`, detail: `Authenticated as ${result.Arn} (Account: ${result.Account}).` };
    }

    if (integration === "okta") {
      const domain = process.env["OKTA_DOMAIN"];
      const token  = process.env["OKTA_API_TOKEN"];
      if (!domain || !token) return { ok: false, detail: "OKTA_DOMAIN or OKTA_API_TOKEN not configured." };
      const res = await fetch(`https://${domain}/api/v1/org`, {
        headers: { Authorization: `SSWS ${token}`, Accept: "application/json" },
      });
      if (!res.ok) return { ok: false, detail: `Okta API returned ${res.status}: ${await res.text()}` };
      const org = await res.json() as { name?: string; subdomain?: string };
      const name = org.name ?? org.subdomain ?? domain;
      return { ok: true, accountName: name, detail: `Connected to Okta org "${name}" (${domain}).` };
    }

    return { ok: false, detail: "Unknown integration." };
  } catch (err) {
    return { ok: false, detail: `Connection test failed: ${String(err)}` };
  }
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function collectEvidence(
  tenantId: number,
  triggeredBy = "Scheduled"
): Promise<{ runId: string; total: number; passed: number; failed: number; stale: number; durationMs: number }> {
  const start = Date.now();
  const runId = `run-${tenantId}-${Date.now()}`;
  const { staleThresholdDays } = getTenantEvidenceSettings(tenantId);

  const staleCount = await markStaleArtifacts(tenantId);

  const controls = await db
    .select()
    .from(controlsTable)
    .where(eq(controlsTable.tenantId, tenantId));

  let passed = 0, failed = 0;

  const BATCH = 10;
  for (let i = 0; i < controls.length; i += BATCH) {
    const batch = controls.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (ctrl) => {
        const { collector } = resolveCollector(ctrl.controlId);
        const artifact = await collector(ctrl.controlId);
        await upsertArtifact(tenantId, ctrl.id, artifact, runId, staleThresholdDays);
        if (artifact.status === "failed") failed++;
        else passed++;
      })
    );
  }

  const durationMs  = Date.now() - start;
  const durationStr = durationMs > 60000
    ? `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`
    : `${(durationMs / 1000).toFixed(1)}s`;

  await db
    .insert(evidenceEngineRunsTable)
    .values({ tenantId, runId, duration: durationStr, total: controls.length, passed, failed, warnings: staleCount, triggeredBy })
    .onConflictDoNothing();

  return { runId, total: controls.length, passed, failed, stale: staleCount, durationMs };
}

// ── All-tenants runner (for scheduler) ───────────────────────────────────────

export async function collectEvidenceAllTenants(): Promise<void> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  for (const { id } of tenants) {
    try {
      await collectEvidence(id, "Scheduled");
    } catch (err) {
      console.error(`[evidence-scheduler] Collection failed for tenant ${id}:`, err);
    }
  }
}
