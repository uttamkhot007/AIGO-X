/**
 * BrowserVerificationService
 *
 * Runs headless Chromium via Playwright, navigates to a URL,
 * evaluates a natural-language instruction, captures a screenshot,
 * and uploads it to object storage.
 *
 * FALLBACK SEMANTICS
 * ──────────────────
 * Simulated mode is used ONLY when the browser binary cannot launch (i.e. the
 * Playwright executable is missing or the sandbox has no display server).
 *
 * Navigation errors, assertion failures, and runtime faults inside the browser
 * are returned as verdict "error" with a clear message — they are NOT masked by
 * the simulated fallback, preserving audit integrity.
 *
 * SSRF PROTECTION
 * ───────────────
 * • Only http:// and https:// schemes are permitted.
 * • Literal hostname/IP strings are checked against private/reserved ranges.
 * • DNS resolution is performed; resolved IP is re-checked (prevents public-DNS
 *   CNAME pointing to internal service).
 * • Playwright route interception rejects mid-navigation redirects to private IPs.
 * • Simulated fetch validates each redirect hop before following it.
 */

import { randomUUID } from "crypto";
import { lookup as dnsLookup } from "dns/promises";
import { uploadBufferToStorage } from "../../lib/objectStorage";

export interface VerificationResult {
  verdict: "pass" | "fail" | "error";
  screenshotPath: string | null;
  summary: string;
  durationMs: number;
}

// ── SSRF protection ───────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                          // loopback IPv4
  /^10\./,                           // RFC-1918 class A
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC-1918 class B
  /^192\.168\./,                     // RFC-1918 class C
  /^169\.254\./,                     // link-local / AWS+Azure metadata
  /^0\./,                            // "this" network
  /^::1$/,                           // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,               // IPv6 ULA fc/7
  /^fd[0-9a-f]{2}:/i,               // IPv6 ULA fd prefix
  /^fe80:/i,                         // IPv6 link-local
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "fd00:ec2::254",
  "instance-data",
]);

function isPrivateIp(str: string): boolean {
  return PRIVATE_IP_PATTERNS.some(re => re.test(str));
}

/**
 * Validate a URL for SSRF safety.
 * Performs a DNS lookup and re-validates the resolved IP.
 * Throws with a descriptive message if unsafe.
 */
export async function validateUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error(`Invalid URL: "${rawUrl}"`); }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked scheme "${parsed.protocol}" — only http and https are permitted`);
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`Blocked hostname: "${host}" is a reserved/metadata address`);
  }
  if (isPrivateIp(host)) {
    throw new Error(`Blocked: "${host}" is in a private or reserved IP range`);
  }

  // DNS-resolution check — blocks attacker-controlled public hostnames that
  // point to internal IPs via custom DNS records.
  try {
    const { address } = await dnsLookup(host, { verbatim: false });
    if (isPrivateIp(address)) {
      throw new Error(`Blocked: hostname "${host}" resolves to private IP ${address}`);
    }
    if (BLOCKED_HOSTNAMES.has(address)) {
      throw new Error(`Blocked: hostname "${host}" resolves to reserved address ${address}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith("Blocked:")) throw err;
    throw new Error(`Cannot resolve hostname "${host}": ${msg}`);
  }

  return parsed;
}

// ── Error classification ──────────────────────────────────────────────────────
// Returns true only if the error means the browser binary is unavailable.
// Navigation/assertion/runtime errors must NOT be caught here.
function isBrowserLaunchFailure(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("executable doesn't exist") ||
    msg.includes("browsertype.launch") ||
    msg.includes("enoent") ||
    msg.includes("spawn") ||
    msg.includes("cannot find module") ||
    msg.includes("no such file or directory") ||
    // Playwright is not installed at all
    (msg.includes("playwright") && msg.includes("install"))
  );
}

// ── Keyword-based heuristic verdict ───────────────────────────────────────────
function evaluateInstruction(instruction: string, pageContent: string): "pass" | "fail" {
  const lc = instruction.toLowerCase();
  const text = pageContent.toLowerCase();

  const positiveKeywords = [
    "enabled", "on", "active", "protected", "enforced", "valid", "blocked",
    "required", "configured", "true", "yes", "pass", "passed", "success",
    "mfa", "2fa", "verified", "secured", "certificate", "ssl", "tls",
  ];
  const negativeKeywords = [
    "disabled", "off", "inactive", "not enabled", "not configured",
    "not required", "false", "fail", "failed", "error", "missing",
    "expired", "public", "unrestricted",
  ];

  const posHits = positiveKeywords.filter(k => text.includes(k)).length;
  const negHits = negativeKeywords.filter(k => text.includes(k)).length;

  if (lc.includes("confirm") || lc.includes("verify") || lc.includes("check")) {
    return posHits > negHits ? "pass" : "fail";
  }
  return posHits > 0 ? "pass" : "fail";
}

// ── Minimal PNG buffer (1×1 transparent PNG placeholder) ─────────────────────
function makePlaceholderPng(): Buffer {
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478016360000000020001e221bc330000000049454e44ae426082",
    "hex"
  );
}

// ── SSRF-safe redirect-aware fetch ────────────────────────────────────────────
async function safeFetch(url: string): Promise<string> {
  const MAX_REDIRECTS = 5;
  let current = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await validateUrl(current); // throws for unsafe targets
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "AIGO-GRC-Bot/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      continue;
    }
    return await res.text();
  }
  throw new Error("Too many redirects");
}

// ── Real browser execution ────────────────────────────────────────────────────
async function runWithPlaywright(url: string, instruction: string): Promise<VerificationResult> {
  const { chromium } = await import("playwright");
  const start = Date.now();
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      timeout: 20_000,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (compatible; AIGO-GRC-Bot/1.0; +https://aigo-x.com/bot)",
    });

    // Intercept every navigation to block mid-request SSRF redirects
    await context.route("**/*", async (route) => {
      const reqUrl = route.request().url();
      try {
        await validateUrl(reqUrl);
        await route.continue();
      } catch (e) {
        console.warn(`[BrowserCheck] SSRF intercept blocked: ${reqUrl} — ${(e as Error).message}`);
        await route.abort("blockedbyclient");
      }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    // Navigation failure is an error — not a simulated fallback
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // @ts-ignore - document is available in Playwright browser evaluation context
    const pageText = await page.evaluate(() => document.body?.innerText ?? "");
    const verdict = evaluateInstruction(instruction, pageText);

    const screenshotBuf = await page.screenshot({ type: "png", fullPage: false });
    let screenshotPath: string | null = null;
    try {
      screenshotPath = await uploadBufferToStorage(
        Buffer.from(screenshotBuf),
        "image/png",
        `browser-checks/${randomUUID()}.png`
      );
    } catch {
      // Screenshot upload failure is non-fatal; run result is still valid
    }

    const summary =
      verdict === "pass"
        ? `Verification passed: page content satisfies "${instruction.slice(0, 80)}"`
        : `Verification failed: page content did not satisfy "${instruction.slice(0, 80)}"`;

    return { verdict, screenshotPath, summary, durationMs: Date.now() - start };
  } finally {
    await browser?.close();
  }
}

// ── Simulated fallback ────────────────────────────────────────────────────────
// Used ONLY when the browser binary cannot be launched (environment constraint).
// Returns "error" if the target URL cannot be fetched — never a false "pass".
async function runSimulated(url: string, instruction: string): Promise<VerificationResult> {
  const start = Date.now();

  let pageText: string;
  try {
    const rawHtml = await safeFetch(url);
    pageText = rawHtml.replace(/<[^>]+>/g, " ");
  } catch (fetchErr) {
    // Fetch failure is a genuine error — return "error" verdict, not a heuristic pass
    const msg = (fetchErr as Error).message;
    let screenshotPath: string | null = null;
    try {
      screenshotPath = await uploadBufferToStorage(
        makePlaceholderPng(), "image/png", `browser-checks/err-${randomUUID()}.png`
      );
    } catch { /* storage unavailable */ }
    return {
      verdict: "error",
      screenshotPath,
      summary: `[Simulated] Could not fetch target URL: ${msg}`,
      durationMs: Date.now() - start,
    };
  }

  const verdict = evaluateInstruction(instruction, pageText);
  let screenshotPath: string | null = null;
  try {
    screenshotPath = await uploadBufferToStorage(
      makePlaceholderPng(), "image/png", `browser-checks/sim-${randomUUID()}.png`
    );
  } catch { /* storage unavailable */ }

  const summary =
    verdict === "pass"
      ? `[Simulated] Verification passed — page content satisfies the instruction`
      : `[Simulated] Verification failed — expected condition not found in page content`;

  return { verdict, screenshotPath, summary, durationMs: Date.now() - start };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a browser check against the given URL.
 *
 * Execution semantics:
 * - Validates the URL for SSRF safety (DNS-resolved) before any network call.
 * - Tries real Playwright headless browser.
 * - Falls back to simulated mode ONLY if the browser binary cannot launch.
 * - Navigation/runtime/assertion errors inside the browser are returned as
 *   verdict "error" — they are NOT masked by the simulated fallback.
 */
export async function runBrowserCheck(
  url: string,
  instruction: string
): Promise<VerificationResult> {
  // SSRF guard — throws for unsafe URLs before any network activity
  await validateUrl(url);

  let playwrightResult: VerificationResult | null = null;
  try {
    playwrightResult = await runWithPlaywright(url, instruction);
    return playwrightResult;
  } catch (err) {
    if (isBrowserLaunchFailure(err)) {
      // Browser binary unavailable — use simulated mode
      console.warn("[BrowserCheck] Playwright unavailable, using simulated mode");
      return runSimulated(url, instruction);
    }
    // Navigation/runtime failure inside the browser — propagate as "error" verdict
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    let screenshotPath: string | null = null;
    try {
      screenshotPath = await uploadBufferToStorage(
        makePlaceholderPng(), "image/png", `browser-checks/err-${randomUUID()}.png`
      );
    } catch { /* storage unavailable */ }
    return {
      verdict: "error",
      screenshotPath,
      summary: `Browser execution failed: ${msg}`,
      durationMs: 0,
    };
  }
}
