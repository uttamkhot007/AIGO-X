# AIGO-X Endpoint Agent (Rust)

Production-grade, cross-platform endpoint agent for the AIGO-X platform. Written in Rust for zero GC pauses, memory safety without a runtime, and a 3–8 MB binary footprint.

> **Privacy & Data Collection:** The agent collects system-level metadata (hardware, OS, software inventory, security settings) for compliance and asset management. It does **not** read personal files, capture keystrokes, or take screenshots. For full details, see the [Privacy Statement](../PRIVACY.md).

## Features

- **Multi-tenant** registration with tenant-scoped agent tokens
- **Offline-first** SQLite store — buffers telemetry when the server is unreachable and replays on reconnect
- **CIS Benchmark** compliance checks (Linux, macOS, Windows)
- **Endpoint hardening** assessment with CIS/NIST/OWASP baselines
- **Threat detection** — behavioral analysis and indicator-based alerting
- **Automated remediation** — low-risk auto-fix actions with rollback support
- **Endpoint scoring** — weighted security + hardening score with trend tracking
- **Circuit breakers** for crash-prevention under load
- **Vault integration** — HashiCorp Vault (AppRole / Token auth) with env-var fallback
- **Admin UI** — React/TypeScript web panel served locally on port 7979

## Quick Start

```bash
# 1. Copy and edit config
cp config.yaml.example /etc/grc-agent/config.yaml
# Set registration.admin_panel_url and registration.agent_token

# 2. Register the agent (one-shot)
./grc-agent register

# 3. Run in service mode
./grc-agent start

# 4. Run a single collection cycle and exit
./grc-agent check
```

## Installation Modes

### Full-Privilege Mode (default)

Installs as **root** (Linux/macOS) or **SYSTEM** (Windows). Required for:
- System-level remediation (firewall, SSH, auditd)
- Full CIS benchmark checks
- Patch management
- Service-level inventory

### Least-Privilege Mode (observability-only)

For environments where full root/SYSTEM access is not acceptable, the agent supports a reduced-capability mode. In this mode the agent runs as an unprivileged user and collects only non-invasive data.

**Capabilities in least-privilege mode:**
- ✅ Software inventory (read-only)
- ✅ User inventory (read-only)
- ✅ Open port enumeration
- ✅ Encryption volume status
- ✅ Configuration file checks (read-only)

**Disabled in least-privilege mode:**
- ❌ System-level remediation (firewall, SSH, services)
- ❌ Patch installation
- ❌ Any write operation to system directories
- ❌ Process protection / self-hardening

**Installation:**
```bash
# Linux/macOS — run as unprivileged user
sudo -u grc-agent ./grc-agent start --mode=observer

# Windows — run as standard user (not admin)
grc-agent.exe start --mode=observer
```

**Configuration:**
Set `capabilities.auto_remediate = false` and `capabilities.system_hardening = false` in `config.yaml`.

> **Note:** The installer currently defaults to full-privilege. A dedicated `--observer-only` installer flag is planned for a future release.

## Uninstall

The uninstall command requires the password set during installation. The password is never accepted as a CLI argument (preventing exposure in `ps` / process lists).

### Interactive (TTY)

```bash
./grc-agent uninstall
# Prompts securely for the uninstall password (input is masked)
```

### Non-interactive (automation / CI)

**Option A — stdin pipe:**

```bash
echo "my-password" | ./grc-agent uninstall
```

**Option B — password file:**

```bash
./grc-agent uninstall --password-file /run/secrets/uninstall_pw
```

### Emergency bypass

Root/administrator users can bypass password verification with `--force` (not recommended for routine use):

```bash
./grc-agent uninstall --force
```

## Configuration

| Key | Description | Default |
|-----|-------------|---------|
| `registration.admin_panel_url` | AIGO-X server URL | *(required)* |
| `registration.agent_token` | Tenant agent token (from Agent Management UI) | *(required)* |
| `registration.tenant_id` | Tenant UUID | *(optional — resolved from token)* |
| `agent.heartbeat_interval` | Heartbeat interval (seconds) | `300` |
| `agent.collection_interval` | Full collection interval (seconds) | `900` |
| `store.path` | SQLite store path | `/var/lib/grc-agent/cache.db` |
| `vault.enabled` | Enable HashiCorp Vault secrets backend | `false` |
| `vault.address` | Vault server address | env `VAULT_ADDR` |
| `vault.role_id` / `vault.secret_id` | AppRole credentials | env `VAULT_ROLE_ID` / `VAULT_SECRET_ID` |

Environment variables override config file values:

| Variable | Overrides |
|----------|-----------|
| `GRC_AGENT_TOKEN` | `registration.agent_token` |
| `GRC_PANEL_URL` | `registration.admin_panel_url` |
| `GRC_TENANT_ID` | `registration.tenant_id` |
| `VAULT_ADDR` | `vault.address` |
| `VAULT_TOKEN` | `vault.token` |

## Building from Source

### Prerequisites

- Rust stable toolchain (1.75+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- For cross-compilation: `cargo install cross --git https://github.com/cross-rs/cross`
- For Windows ARM64: [llvm-mingw](https://github.com/mstorsjo/llvm-mingw) with `aarch64-w64-mingw32-clang` in PATH

### Build targets

```bash
cd agent

# Debug build (host platform)
make build

# Stripped release build (host platform)
make release

# Cross-compile all 6 targets (requires cross)
make cross

# Individual targets
make linux-amd64
make linux-arm64
make darwin-amd64
make darwin-arm64
make windows-amd64
make windows-arm64

# Tests
make test

# Linting (clippy)
make lint

# Admin UI
make admin-ui
```

### Output binaries

| Platform | File |
|----------|------|
| Linux x86_64 | `dist/grc-agent-linux-amd64` |
| Linux ARM64  | `dist/grc-agent-linux-arm64` |
| macOS x86_64 | `dist/grc-agent-darwin-amd64` |
| macOS ARM64  | `dist/grc-agent-darwin-arm64` |
| Windows x64  | `dist/grc-agent-windows-amd64.exe` |
| Windows ARM64 | `dist/grc-agent-windows-arm64.exe` |

## Admin UI

The agent has a built-in HTTP server on `http://127.0.0.1:7979` (loopback only) that serves both the React SPA and the JSON API. The admin UI connects directly to the local agent — your browser never receives the agent token.

### Production setup

```bash
# Build the UI (requires Node 18+)
make admin-ui          # → admin-ui/dist/

# Enable in config.yaml:
#   admin:
#     enabled: true
#     port: 7979
#     bind_address: "127.0.0.1"

# Start agent — Rust server serves SPA + API on :7979
grc-agent start
# Open http://127.0.0.1:7979/  in a browser
```

The Rust server serves:
- `GET /`                  → `admin-ui/dist/index.html` (React SPA, all unknown paths SPA-fallback)
- `GET /assets/*`          → bundled JS/CSS from `admin-ui/dist/assets/`
- `GET /admin-api/status`  → JSON agent status
- `GET /admin-api/checks`  → JSON compliance checks
- `GET /status`            → same (Vite dev proxy strips the `/admin-api` prefix)

### Development setup

```bash
# Terminal 1: run the agent (Rust admin server on :7979)
cargo run -- start --dry-run

# Terminal 2: Vite dev server with HMR (proxies /admin-api/* → :7979/*)
cd admin-ui && npm run dev
# Open http://localhost:5174/
```

## API Contract

The agent communicates with the AIGO-X server using these endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/agent/register` | Register / re-register agent |
| `POST` | `/api/v1/agent/checkin` | Heartbeat |
| `POST` | `/api/v1/agent/push` | Push telemetry + check results |

All requests use `Authorization: Bearer <agent_token>`.

## Architecture

```
grc-agent
├── src/agent.rs          — Core lifecycle orchestrator
├── src/client.rs         — HTTP API client (register / checkin / push)
├── src/config.rs         — YAML + env config loader
├── src/checks.rs         — CIS compliance check engine
├── src/discovery.rs      — Cross-platform inventory collection
├── src/compliance.rs     — Multi-framework compliance mapping
├── src/hardening.rs      — Endpoint hardening assessment (CIS/NIST/OWASP)
├── src/scoring.rs        — Weighted endpoint security score
├── src/security.rs       — Threat detection engine
├── src/remediation.rs    — Automated remediation planner
├── src/offline.rs        — Offline-first SQLite store (air-gap mode)
├── src/registration.rs   — Registration metadata + command processor
├── src/secrets.rs        — Vault / env secrets backend
├── src/recovery.rs       — Health monitoring + auto-recovery
├── src/stability.rs      — Circuit breakers + resource protection
└── src/admin.rs          — Tokio HTTP server on :7979 (static SPA + JSON API)
admin-ui/                 — React/TypeScript admin panel (Vite)
dist/                     — Pre-built binaries
```
