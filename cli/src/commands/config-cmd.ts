import type { Command } from "commander";
import { getConfig, setConfig, configPath, requireConfig } from "../config.js";
import { success, error, info, label, header, printJson, isJsonMode } from "../output.js";
import { apiRequest } from "../api.js";

export function registerConfig(program: Command): void {
  const config = program
    .command("config")
    .description("Manage CLI configuration");

  config
    .command("show")
    .description("Print current configuration")
    .action(() => {
      const cfg = getConfig();
      if (isJsonMode()) {
        printJson({ ...cfg, token: cfg.token ? cfg.token.slice(0, 8) + "…" : undefined, configPath: configPath() });
        return;
      }
      header("aigo-x configuration");
      label("Config file", configPath());
      label("Gateway URL", cfg.url ?? chalk_dim("(not set)"));
      label("Token", cfg.token ? cfg.token.slice(0, 8) + "…" + cfg.token.slice(-4) : chalk_dim("(not set)"));
    });

  config
    .command("set <key> <value>")
    .description("Set a config key (url | token)")
    .action((key: string, value: string) => {
      if (key !== "url" && key !== "token") {
        error(`Unknown config key: ${key}. Valid keys: url, token`);
        process.exit(1);
      }
      setConfig({ [key]: value });
      success(`Set ${key}`);
    });

  config
    .command("verify")
    .description("Verify the gateway is reachable with the current token")
    .action(async () => {
      requireConfig();
      try {
        const result = await apiRequest<{ status: string }>("/api/healthz");
        success(`Gateway reachable — platform status: ${result.status}`);
      } catch (err) {
        error(`Gateway unreachable: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

function chalk_dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}
