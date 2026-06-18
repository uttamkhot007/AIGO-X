#!/usr/bin/env node
import { Command } from "commander";
import { setJsonMode } from "./output.js";
import { registerLogin } from "./commands/login.js";
import { registerConfig } from "./commands/config-cmd.js";
import { registerTenant } from "./commands/tenant.js";
import { registerMigrate } from "./commands/migrate.js";
import { registerHealth } from "./commands/health.js";
import { registerSecrets } from "./commands/secrets.js";
import { registerBackup } from "./commands/backup.js";
import { registerLogs } from "./commands/logs.js";
import { registerDeploy } from "./commands/deploy.js";

const program = new Command();

program
  .name("aigo-x")
  .description("DuFense AIGO-X GRC Platform — Operator CLI")
  .version("1.0.0")
  .option("--json", "Output results as JSON")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean };
    if (opts.json) setJsonMode(true);
  });

registerLogin(program);
registerConfig(program);
registerTenant(program);
registerMigrate(program);
registerHealth(program);
registerSecrets(program);
registerBackup(program);
registerLogs(program);
registerDeploy(program);

program.parse(process.argv);
