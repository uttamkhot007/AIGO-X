import type { Command } from "commander";
import { error, info, success, warn } from "../output.js";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const CLOUDS = ["aws", "azure", "gcp"] as const;
type Cloud = (typeof CLOUDS)[number];

const DEPLOY_SCRIPTS: Record<Cloud, string[]> = {
  aws:   ["aws/deploy.sh",   "terraform/aws/deploy.sh",   "scripts/deploy-aws.sh"],
  azure: ["azure/deploy.sh", "terraform/azure/deploy.sh", "scripts/deploy-azure.sh"],
  gcp:   ["gcp/deploy.sh",   "terraform/gcp/deploy.sh",   "scripts/deploy-gcp.sh"],
};

export function registerDeploy(program: Command): void {
  program
    .command("deploy")
    .description("Deploy the platform to a cloud environment")
    .requiredOption("--cloud <cloud>", `Cloud provider (${CLOUDS.join(" | ")})`)
    .option("--env <env>", "Environment (prod | staging | dev)", "prod")
    .option("--version <tag>", "Docker image tag to deploy (default: latest)")
    .option("--plan", "Terraform plan only — no changes applied (maps to --plan flag on deploy scripts)")
    .option("--working-dir <dir>", "Override working directory to search for deploy script")
    .action(async (opts: {
      cloud: string;
      env: string;
      version?: string;
      plan?: boolean;
      workingDir?: string;
    }) => {
      if (!CLOUDS.includes(opts.cloud as Cloud)) {
        error(`Unknown cloud: ${opts.cloud}. Valid: ${CLOUDS.join(", ")}`);
        process.exit(1);
      }

      const cloud = opts.cloud as Cloud;
      const candidates = DEPLOY_SCRIPTS[cloud].map(p =>
        opts.workingDir
          ? join(opts.workingDir, p)
          : resolve(process.cwd(), p)
      );

      const script = candidates.find(p => existsSync(p));

      if (!script) {
        error(`No deploy script found for ${cloud}. Looked for:`);
        for (const p of candidates) console.log(`  ${p}`);
        info("Run terraform commands directly:");
        info(`  cd terraform/${cloud} && terraform init && terraform ${opts.plan ? "plan" : "apply"}`);
        process.exit(1);
      }

      // Build args that match the actual deploy script flags:
      // --env <env>         (all three scripts)
      // --version <tag>     (all three scripts)
      // --plan              (all three scripts — plan only, no apply)
      const args: string[] = ["--env", opts.env];
      if (opts.version) args.push("--version", opts.version);
      if (opts.plan) args.push("--plan");

      info(`Cloud:   ${cloud.toUpperCase()}`);
      info(`Env:     ${opts.env}`);
      info(`Version: ${opts.version ?? "latest"}`);
      info(`Script:  ${script}`);
      if (opts.plan) warn("PLAN MODE — no changes will be applied");
      info("");

      await new Promise<void>((res_ok, rej) => {
        const child = spawn("bash", [script, ...args], {
          stdio: "inherit",
          env: {
            ...process.env,
            DEPLOY_ENV: opts.env,
            CLOUD: cloud,
            ...(opts.version ? { IMAGE_TAG: opts.version } : {}),
          },
        });

        child.on("close", code => {
          if (code === 0) {
            success(`Deploy to ${cloud.toUpperCase()} (${opts.env}) complete`);
            res_ok();
          } else {
            rej(new Error(`Deploy script exited with code ${code}`));
          }
        });

        child.on("error", rej);
      }).catch(err => {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      });
    });
}
