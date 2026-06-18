#!/usr/bin/env node
/**
 * DuFense GRC MCP Stdio Transport
 *
 * Implements the MCP 2024-11-05 stdio transport specification:
 *   https://spec.modelcontextprotocol.io/specification/basic/transports/
 *
 * Per the MCP spec, the stdio transport uses newline-delimited JSON (NDJSON):
 *   - Each JSON-RPC 2.0 message is a single line terminated by '\n'
 *   - Messages MUST NOT contain embedded newlines
 *   - This is distinct from LSP's Content-Length framing; MCP deliberately
 *     uses the simpler NDJSON approach for stdio compatibility
 *
 * This is the same protocol used by the official @modelcontextprotocol/sdk
 * StdioServerTransport and StdioClientTransport.
 *
 * Usage:
 *   node index.js --token mcp_1_<hex> --url https://your-platform/api/mcp
 *
 * Or set environment variables:
 *   DUFENSE_MCP_TOKEN=mcp_1_<hex>
 *   DUFENSE_MCP_URL=https://your-platform/api/mcp
 */

"use strict";

const readline = require("readline");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// ── Configuration ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

const MCP_TOKEN = getArg("token") || process.env["DUFENSE_MCP_TOKEN"];
const MCP_URL   = getArg("url")   || process.env["DUFENSE_MCP_URL"] || "https://localhost/api/mcp";

if (!MCP_TOKEN) {
  process.stderr.write(
    "[DuFense MCP] ERROR: MCP token required.\n" +
    "  Set DUFENSE_MCP_TOKEN env var or pass --token <token>\n" +
    "  Generate a token in: Settings → General → API & MCP Access\n"
  );
  process.exit(1);
}

// Validate URL early to give a clear error message
let parsedUrl;
try {
  parsedUrl = new URL(MCP_URL);
} catch {
  process.stderr.write(`[DuFense MCP] ERROR: Invalid MCP_URL: ${MCP_URL}\n`);
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

function sendRequest(body) {
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const payload = JSON.stringify(body);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${MCP_TOKEN}`,
        "User-Agent": "dufense-mcp-stdio/2.0 (MCP 2024-11-05)",
      },
    };

    let timer;
    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Non-JSON response (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
        }
      });
    });

    timer = setTimeout(() => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// ── NDJSON stdio bridge ───────────────────────────────────────────────────────
//
// Reads one JSON-RPC 2.0 object per line from stdin, forwards to the
// DuFense GRC HTTP MCP endpoint, and writes the response as a single
// newline-terminated JSON line to stdout.
//
// This exactly matches the MCP 2024-11-05 stdio transport contract.

const rl = readline.createInterface({
  input:    process.stdin,
  output:   undefined,         // do NOT write to stdout from readline
  terminal: false,
  crlfDelay: Infinity,
});

process.stderr.write(`[DuFense MCP] stdio transport ready\n`);
process.stderr.write(`[DuFense MCP] Endpoint: ${MCP_URL}\n`);

// Serialize all in-flight requests to maintain JSON-RPC ID ordering
let inflight = Promise.resolve();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return; // skip blank lines

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    // Invalid JSON — return parse error per JSON-RPC 2.0 spec
    const errResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error — line is not valid JSON" },
    };
    process.stdout.write(JSON.stringify(errResponse) + "\n");
    return;
  }

  // Chain requests to preserve response ordering (important for batch-like clients)
  inflight = inflight.then(async () => {
    try {
      const response = await sendRequest(request);
      // MCP spec: each response is a complete JSON object on one line
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errResponse = {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Transport error",
        },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
      process.stderr.write(`[DuFense MCP] Transport error: ${err instanceof Error ? err.message : err}\n`);
    }
  });
});

rl.on("close", () => {
  process.stderr.write("[DuFense MCP] stdin closed — exiting\n");
  // Wait for any in-flight request to complete before exiting
  inflight.finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  process.stderr.write("[DuFense MCP] SIGTERM — exiting\n");
  inflight.finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  process.stderr.write("[DuFense MCP] SIGINT — exiting\n");
  inflight.finally(() => process.exit(0));
});
