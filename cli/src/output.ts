import chalk from "chalk";
import ora, { type Ora } from "ora";

let _jsonMode = false;

export function setJsonMode(v: boolean): void {
  _jsonMode = v;
}
export function isJsonMode(): boolean {
  return _jsonMode;
}

export function success(msg: string): void {
  if (!_jsonMode) console.log(chalk.green("✔") + "  " + msg);
}

export function info(msg: string): void {
  if (!_jsonMode) console.log(chalk.cyan("ℹ") + "  " + msg);
}

export function warn(msg: string): void {
  if (!_jsonMode) console.warn(chalk.yellow("⚠") + "  " + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("✖") + "  " + msg);
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function output(data: unknown): void {
  if (_jsonMode) {
    printJson(data);
  }
}

export function label(key: string, value: string | number | boolean | null | undefined): void {
  if (_jsonMode) return;
  console.log("  " + chalk.bold(String(key).padEnd(20)) + chalk.white(String(value ?? "")));
}

export function header(title: string): void {
  if (_jsonMode) return;
  console.log("\n" + chalk.bold.cyan(title));
  console.log(chalk.dim("─".repeat(Math.min(title.length + 2, 60))));
}

export function printTable(headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  if (_jsonMode) return;
  const cols = headers.length;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? "").length))
  );

  const divider = (left: string, mid: string, right: string, fill: string) =>
    left + widths.map(w => fill.repeat(w + 2)).join(mid) + right;

  const rowLine = (cells: (string | number | boolean | null | undefined)[], bold = false) =>
    "│" + Array.from({ length: cols }, (_, i) => {
      const val = String(cells[i] ?? "");
      const padded = ` ${val.padEnd(widths[i]!)} `;
      return bold ? chalk.bold(padded) : padded;
    }).join("│") + "│";

  console.log(divider("┌", "┬", "┐", "─"));
  console.log(rowLine(headers, true));
  console.log(divider("├", "┼", "┤", "─"));
  for (const row of rows) {
    console.log(rowLine(row));
  }
  console.log(divider("└", "┴", "┘", "─"));
}

export function spinner(msg: string): Ora {
  if (_jsonMode) {
    return {
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      start: () => ({}) as Ora,
      text: msg,
    } as unknown as Ora;
  }
  return ora(msg).start();
}
