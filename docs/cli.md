# aigo-x CLI — Command Reference

The `aigo-x` operator CLI lets you manage a DuFense AIGO-X GRC deployment from
the terminal without accessing the web UI. It talks to the platform gateway using
an operator JWT token.

---

## Installation

```bash
# From the repo root — installs the CLI globally
cd cli && npm install -g .
```

Or for local development (no build required):

```bash
cd cli && npm install
npm run build
npm link          # registers `aigo-x` globally pointing at dist/
```

---

## Quick Start

```bash
# 1. Point the CLI at your gateway and supply your operator token
aigo-x login --url https://grc.acme.com --token eyJhbGci...

# 2. Verify connectivity
aigo-x config verify

# 3. Check platform health
aigo-x health

# 4. List tenants
aigo-x tenant list
```

---

## Global Flags

| Flag     | Description                          |
|----------|--------------------------------------|
| `--json` | Output results as machine-readable JSON (suppresses spinners and colour) |
| `--help` | Show help for a command or subcommand |
| `--version` | Print CLI version |

---

## `aigo-x login`

Save gateway URL and operator token to `~/.aigo-x/config.json`.

```bash
aigo-x login --url <url> --token <token>
```

**Options**

| Option | Description |
|--------|-------------|
| `--url <url>` | Gateway base URL (e.g. `https://grc.acme.com`) |
| `--token <token>` | Operator JWT token issued by the auth service |

**Example**

```bash
aigo-x login --url https://grc.acme.com --token eyJhbGciOiJIUzI1NiIs...
```

---

## `aigo-x config`

Manage CLI configuration stored in `~/.aigo-x/config.json`.

### `config show`

Print the current configuration (token is masked).

```bash
aigo-x config show
aigo-x config show --json
```

### `config set`

Update a configuration key.

```bash
aigo-x config set url https://new-gateway.acme.com
aigo-x config set token eyJhbGci...
```

### `config verify`

Check that the gateway is reachable with the stored token.

```bash
aigo-x config verify
```

---

## `aigo-x tenant`

Manage platform tenants (requires `super_admin` role).

### `tenant list`

```bash
aigo-x tenant list
aigo-x tenant list --json
```

### `tenant get <id>`

```bash
aigo-x tenant get 42
```

### `tenant create`

```bash
aigo-x tenant create \
  --name "Acme Corp" \
  --slug acme \
  --plan enterprise \
  --domain grc.acme.com
```

**Options**

| Option | Required | Description |
|--------|----------|-------------|
| `--name <name>` | ✓ | Display name |
| `--slug <slug>` | ✓ | Unique URL slug (lowercase, hyphens) |
| `--plan <plan>` | ✓ | `starter` \| `professional` \| `enterprise` |
| `--domain <domain>` | — | Custom domain |
| `--seats <n>` | — | Seat count |

### `tenant suspend <id>`

Block all logins for a tenant (sets status to `suspended`).

```bash
aigo-x tenant suspend 42
```

### `tenant activate <id>`

Re-enable a suspended tenant.

```bash
aigo-x tenant activate 42
```

### `tenant update <id>`

Patch one or more tenant fields.

```bash
aigo-x tenant update 42 --plan enterprise --seats 100
aigo-x tenant update 42 --license-expiry 2027-12-31
```

### `tenant delete <id>`

Permanently remove a tenant. The tenant must have no users. Prompts for
confirmation unless `--force` is passed.

```bash
aigo-x tenant delete 42
aigo-x tenant delete 42 --force
```

---

## `aigo-x migrate`

Database migration operations.

### `migrate run`

Apply all pending SQL migrations from `lib/db/migrations/`.

```bash
aigo-x migrate run
aigo-x migrate run --dry-run   # show what would be applied
```

> **Note** — the gateway must expose `POST /api/admin/migrate`.
> If that endpoint is not available, the CLI will print the equivalent
> manual `psql` commands.

### `migrate status`

Show migration status.

```bash
aigo-x migrate status
```

---

## `aigo-x health`

Check the health of all registered platform services.

```bash
aigo-x health
aigo-x health --service auth-service   # filter to one service
aigo-x health --json                   # machine-readable output
```

**Example output**

```
  Platform Health
  ───────────────────────────
  Status:   HEALTHY
  Uptime:   3d 14h 22m 9s
  Gateway:  12ms latency

  ┌────────────────────┬─────────┬─────────┬──────────────┐
  │ Service            │ Status  │ Version │ Last Checked │
  ├────────────────────┼─────────┼─────────┼──────────────┤
  │ auth-service       │ healthy │ 1.0.0   │ 10:42:01 AM  │
  │ risk-service       │ healthy │ 1.0.0   │ 10:42:01 AM  │
  │ compliance-service │ healthy │ 1.0.0   │ 10:42:01 AM  │
  └────────────────────┴─────────┴─────────┴──────────────┘
```

---

## `aigo-x secrets`

Secret management operations.

### `secrets rotate`

Rotate JWT signing secrets for one or all services. Active sessions are
invalidated. Prompts for confirmation unless `--force` is passed.

```bash
aigo-x secrets rotate --service auth-service
aigo-x secrets rotate --service auth-service --force
aigo-x secrets rotate --all             # rotate all services
```

### `secrets list`

List secret names for a service (values are never shown).

```bash
aigo-x secrets list --service auth-service
```

---

## `aigo-x backup`

Trigger and manage backups.

### `backup now`

Trigger an immediate backup (Postgres + Redis).

```bash
aigo-x backup now                       # via API
aigo-x backup now --tag weekly          # with custom tag
aigo-x backup now --no-redis            # Postgres only
aigo-x backup now --local               # run scripts/backup.sh locally
```

The command first tries the gateway API (`POST /api/admin/backup`) and
falls back to executing `scripts/backup.sh` locally if the API is unreachable.

### `backup list`

List recent backups.

```bash
aigo-x backup list
aigo-x backup list --limit 5
```

---

## `aigo-x logs`

Stream or fetch logs from a service.

```bash
aigo-x logs --service risk-service --tail 100
aigo-x logs --service auth-service --follow             # live stream
aigo-x logs --service gateway --tail 50 --since 1h
```

**Options**

| Option | Description |
|--------|-------------|
| `--service <name>` | Service name (required) |
| `--tail <n>` | Number of lines (default: 100) |
| `--follow` | Stream live logs until Ctrl+C |
| `--since <time>` | ISO timestamp or duration (`1h`, `30m`) |

If the API logs endpoint is not available, the CLI prints the equivalent
`docker logs` command.

**Known service names**

`gateway`, `auth-service`, `risk-service`, `compliance-service`,
`governance-service`, `privacy-service`, `evidence-service`,
`secops-service`, `ai-service`, `trust-service`, `integration-service`,
`web`, `postgres`, `redis`, `nginx`

---

## `aigo-x deploy`

Wrap cloud deploy scripts or Terraform plans.

```bash
aigo-x deploy --cloud aws --env prod
aigo-x deploy --cloud aws --env prod --version 1.2.3
aigo-x deploy --cloud azure --env staging --plan
aigo-x deploy --cloud gcp --env prod --version 1.2.3
```

**Options**

| Option | Description |
|--------|-------------|
| `--cloud <cloud>` | `aws` \| `azure` \| `gcp` (required) |
| `--env <env>` | Environment (`prod` \| `staging` \| `dev`). Default: `prod` |
| `--version <tag>` | Docker image tag to deploy (default: `latest`) |
| `--plan` | Terraform plan only — no changes applied |
| `--working-dir <dir>` | Override directory to search for deploy script |

The CLI searches for deploy scripts in this order:

| Cloud | Paths searched |
|-------|---------------|
| AWS | `aws/deploy.sh`, `terraform/aws/deploy.sh`, `scripts/deploy-aws.sh` |
| Azure | `azure/deploy.sh`, `terraform/azure/deploy.sh`, `scripts/deploy-azure.sh` |
| GCP | `gcp/deploy.sh`, `terraform/gcp/deploy.sh`, `scripts/deploy-gcp.sh` |

---

## Configuration File

`~/.aigo-x/config.json` (mode 600 — readable by owner only)

```json
{
  "url": "https://grc.acme.com",
  "token": "eyJhbGci..."
}
```

You can edit this file directly or use `aigo-x config set`.

---

## JSON Output Mode

All commands support `--json` for scripting and CI pipelines:

```bash
aigo-x tenant list --json | jq '.[].id'
aigo-x health --json | jq '.status'
aigo-x backup now --json | jq '.backupName'
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (authentication, API, validation) |

---

## Troubleshooting

**`Not configured`** — Run `aigo-x login` first.

**`HTTP 401: Unauthorized`** — Token is expired or invalid. Re-run `aigo-x login`.

**`HTTP 403: Forbidden`** — Token does not have `super_admin` role. Check your
operator account in the admin portal.

**`Gateway unreachable`** — Check that the gateway is running and the URL is correct:
```bash
curl https://grc.acme.com/api/healthz
```

**Logs endpoint not available** — Stream directly with Docker:
```bash
docker logs risk-service --tail 100 -f
```
