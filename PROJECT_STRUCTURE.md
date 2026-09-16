# GnkAlgo project structure

The existing TypeScript application remains in `src`, with browser assets in `public`, SQL migrations in `migrations`, and tests in `test`. The additional directories provide an organized expansion path for the full platform.

| Directory | Intended responsibility |
| --- | --- |
| `audit` | Security, compliance, and operational audit components |
| `blueprints` | Reusable application or deployment blueprints |
| `broker` | Broker adapters, contracts, and shared broker logic |
| `collections` | Curated instrument or market-data collections |
| `data` | Non-secret application data and fixtures |
| `database` | Database access abstractions and maintenance utilities |
| `db` | Local development database artifacts only |
| `deploy` | Docker, nginx, migration, backup, and production runbooks |
| `docs` | Architecture and implementation documentation |
| `download` | Temporary import/download staging |
| `events` | Domain events and event handlers |
| `examples` | Safe example configurations and integrations |
| `frontend` | Future frontend source; current static pages remain in `public` |
| `install` | Installation and host-bootstrap assets |
| `keys` | Runtime key mount point; never commit real keys |
| `log` | Runtime log mount point; never commit logs |
| `mcp` | Optional local MCP integrations; remote MCP remains disabled |
| `okf` | OKF-specific integration boundary |
| `portfolio` | Portfolio domain logic |
| `restx_api` | Compatibility boundary for RESTX-style APIs |
| `sandbox` | Isolated paper-trading or experimentation components |
| `scripts` | Developer and operations scripts |
| `services` | Application services and background workers |
| `sip` | SIP-related domain components |
| `strategies` | Trading strategy implementations |
| `subscribers` | Market/event subscribers |
| `tmp` | Disposable runtime files |
| `upgrade` | Upgrade and migration coordination |
| `utils` | Shared, dependency-light utilities |
| `websocket_proxy` | WebSocket gateway/proxy components |
| `workspace` | Local operator workspace artifacts |

Generated directories such as `node_modules`, `dist`, Python `venv`, `__pycache__`, and package metadata must not be treated as source. Secret-bearing `.env`, `keys`, `secrets`, database files, logs, backups, downloads, and temporary content must remain outside Git and Docker build contexts.
