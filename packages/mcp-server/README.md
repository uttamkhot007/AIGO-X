# DuFense GRC MCP Server — Stdio Transport

A lightweight stdio bridge that lets any MCP-compatible AI client (Claude Desktop, Cursor, VS Code) talk to the DuFense GRC Platform over the Model Context Protocol.

## Quick Start

### 1. Generate an MCP Token

In the DuFense GRC Platform:
1. Go to **Settings → General → API & MCP Access**
2. Click **Generate Token**, give it a name (e.g. "Claude Desktop")
3. Copy the token — it starts with `mcp_` and is shown **only once**

### 2. Configure Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and add:

```json
{
  "mcpServers": {
    "dufense-grc": {
      "command": "node",
      "args": [
        "/path/to/packages/mcp-server/index.js",
        "--token", "mcp_YOUR_TOKEN_HERE",
        "--url", "https://YOUR_PLATFORM_URL/api/mcp"
      ]
    }
  }
}
```

Replace `YOUR_TOKEN_HERE` and `YOUR_PLATFORM_URL` with the actual values. Restart Claude Desktop.

### 3. Configure Cursor

In Cursor settings → **Model Context Protocol** → add server:

```json
{
  "name": "dufense-grc",
  "command": "node",
  "args": [
    "/path/to/packages/mcp-server/index.js"
  ],
  "env": {
    "DUFENSE_MCP_TOKEN": "mcp_YOUR_TOKEN_HERE",
    "DUFENSE_MCP_URL": "https://YOUR_PLATFORM_URL/api/mcp"
  }
}
```

## Environment Variables

| Variable             | Description                        | Default                     |
|----------------------|------------------------------------|-----------------------------|
| `DUFENSE_MCP_TOKEN`  | MCP token (mcp_…)                  | Required                    |
| `DUFENSE_MCP_URL`    | Full URL of the MCP HTTP endpoint  | `https://localhost/api/mcp` |

Or pass `--token` and `--url` as CLI args.

## Available Tools

The server exposes the complete DuFense GRC toolset:

| Domain      | Tools                                                                            |
|-------------|----------------------------------------------------------------------------------|
| Risks       | `list_risks`, `get_risk`, `create_risk`, `update_risk_status`, `generate_risk_playbook` |
| Controls    | `list_controls`, `get_control`, `update_control_status`, `run_evidence_collection` |
| Policies    | `list_policies`, `get_policy`, `create_policy`                                   |
| Evidence    | `list_evidence`, `get_evidence_summary`, `trigger_collection`                    |
| Vendors     | `list_vendors`, `get_vendor_risk`                                                |
| Frameworks  | `list_frameworks`, `get_compliance_score`                                        |
| AI vCISO    | `ask_vciso`                                                                      |
| Tickets     | `list_tickets`, `create_ticket`                                                  |
| Security    | `grc_code_security_review`, `grc_risk_assessment`, `grc_compliance_check`, `grc_threat_model`, `grc_incident_response`, `grc_vulnerability_assess` |

## Example prompts (in Claude Desktop)

- *"List all critical risks in our GRC platform"*
- *"What's our SOC 2 compliance score?"*
- *"Create a ticket for a phishing incident, high priority, assigned to security@acme.com"*
- *"Ask the vCISO: are we ready for our ISO 27001 audit?"*
- *"Generate a risk playbook for RISK-007 using a mitigate strategy"*

## Resources

The server also exposes MCP resources:
- `grc://risks` — live risk register (JSON)
- `grc://controls` — all compliance controls (JSON)  
- `grc://vendors` — vendor risk register (JSON)

## Authentication

All tool calls are:
- **Tenant-isolated** — the token is bound to a specific tenant; no cross-tenant access
- **Audit-logged** — every tool call is recorded in the `mcp_audit_log` table for compliance traceability
- **Rate-limited** — 60 tool calls per minute per token
