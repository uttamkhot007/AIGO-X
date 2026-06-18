import type { Command } from "commander";
import { setConfig, configPath } from "../config.js";
import { success, error } from "../output.js";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Save gateway URL and operator token to local config")
    .requiredOption("--url <url>", "Gateway base URL (e.g. https://grc.acme.com)")
    .requiredOption("--token <token>", "Operator JWT token")
    .action((opts: { url: string; token: string }) => {
      try {
        const url = opts.url.replace(/\/$/, "");
        setConfig({ url, token: opts.token });
        success(`Logged in. Config saved to ${configPath()}`);
        success(`Gateway: ${url}`);
      } catch (err) {
        error(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
